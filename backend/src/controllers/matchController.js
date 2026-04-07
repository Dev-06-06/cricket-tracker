const Match = require("../models/Match");
const Player = require("../models/Player");
const Group = require("../models/Group");
const mongoose = require("mongoose");

let _io = null;
const setIo = (ioInstance) => { _io = ioInstance; };

const broadcastGroupUpdate = (groupId, type) => {
  if (_io && groupId) {
    _io.to(`group:${groupId}`).emit("groupMatchUpdate", {
      groupId: groupId.toString(),
      type,
    });
  }
};

// ─── Auth helper ──────────────────────────────────────────────────────────────
const ensureUserIsGroupMember = async (groupId, userId) => {
  const group = await Group.findOne({
    _id: groupId,
    "members.user": userId,
  }).select("_id").lean();
  return Boolean(group);
};

// ─── Result message builder ───────────────────────────────────────────────────
function buildResultMessage(match) {
  if (match.status !== "completed") return "";
  return match.result?.message || "";
}

// ─── Map match to API response shape ─────────────────────────────────────────
// ✅ No .populate() needed — team1.players / team2.players are embedded snapshots
function mapMatchSummary(match) {
  const m = match.toObject ? match.toObject() : match;
  return {
    _id: m._id,
    groupId: m.groupId,

    // Flat team fields for frontend compatibility
    team1Name: m.team1.name,
    team2Name: m.team2.name,
    team1Players: m.team1.players,   // [{ playerId, name, photoUrl }]
    team2Players: m.team2.players,

    totalOvers: m.totalOvers,
    status: m.status,

    // Toss
    tossWinner: m.toss?.winner || "",
    tossChoice: m.toss?.choice || "",

    // Live state (flattened for frontend)
    inningsNumber: m.current.inningsNumber,
    battingTeam:   m.current.battingTeam === "team1" ? m.team1.name : m.team2.name,
    bowlingTeam:   m.current.battingTeam === "team1" ? m.team2.name : m.team1.name,
    totalRuns:     m.current.runs,
    wickets:       m.current.wickets,
    oversBowled:   m.current.oversBowled,
    ballsBowled:   m.current.ballsBowled,
    currentStriker:    m.current.striker?.name    || null,
    currentNonStriker: m.current.nonStriker?.name || null,
    currentBowler:     m.current.bowler?.name     || null,
    nextBatterFor:     m.current.nextBatterFor    || null,

    // Innings 1 summary
    firstInningsScore: m.innings1?.score  ?? null,
    targetScore:       m.innings1?.target ?? null,
    // RISK: ScoreboardPage needs full innings1 for batting/bowling tables
    // Must include battingRows and bowlingRows for first innings display
    innings1: m.innings1 ? {
      battingTeam:  m.innings1.battingTeam === "team1"
        ? m.team1.name
        : m.team2.name,
      bowlingTeam:  m.innings1.battingTeam === "team1"
        ? m.team2.name
        : m.team1.name,
      score:        m.innings1.score   ?? 0,
      wickets:      m.innings1.wickets ?? 0,
      overs:        m.innings1.overs   ?? 0,
      target:       m.innings1.target  ?? null,
      battingRows:  Array.isArray(m.innings1.battingRows)
        ? m.innings1.battingRows
        : [],
      bowlingRows:  Array.isArray(m.innings1.bowlingRows)
        ? m.innings1.bowlingRows
        : [],
    } : null,

    // Player stats
    playerStats: (m.playerStats || []).map((p) => ({
      playerId: p.playerId,
      name:     p.name,
      team:     p.team === "team1" ? m.team1.name : m.team2.name,
      didBat:   p.didBat  === true,
      didBowl:  p.didBowl === true,
      isOut:    p.isOut   === true,
      isBenched:       p.isBenched       === true,
      isJoker:         p.isJoker         === true,
      skipCareerStats: p.skipCareerStats === true,
      batting: {
        runs:          Number(p.batting?.runs)  || 0,
        balls:         Number(p.batting?.balls) || 0,
        fours:         Number(p.batting?.fours) || 0,
        sixes:         Number(p.batting?.sixes) || 0,
        dismissalType: p.batting?.dismissalType || "",
      },
      bowling: {
        overs:   Number(p.bowling?.overs)   || 0,
        balls:   Number(p.bowling?.balls)   || 0,
        runs:    Number(p.bowling?.runs)    || 0,
        wickets: Number(p.bowling?.wickets) || 0,
        wides:   Number(p.bowling?.wides)   || 0,
        noBalls: Number(p.bowling?.noBalls) || 0,
      },
    })),

    resultMessage: buildResultMessage(m),
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

// ─── createUpcomingMatch ──────────────────────────────────────────────────────
const createUpcomingMatch = async (req, res) => {
  try {
    const {
      groupId,
      team1Name,
      team2Name,
      team1PlayerIds,
      team2PlayerIds,
      totalOvers,
      jokerPlayerId,
    } = req.body;

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Valid groupId is required" });
    }

    if (!team1Name?.trim() || !team2Name?.trim()) {
      return res.status(400).json({ success: false, message: "Both team names are required" });
    }

    const canAccess = await ensureUserIsGroupMember(groupId, req.user._id);
    if (!canAccess) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    // Fetch the group to validate playerPool
    const group = await Group.findById(groupId).select("playerPool");
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    // Validate that all submitted player IDs belong to the group's playerPool
    const poolIds = new Set(group.playerPool.map(id => id.toString()));
    const allSubmittedIds = [
      ...(team1PlayerIds || []),
      ...(team2PlayerIds || []),
      // RISK: validate joker belongs to group pool too
      ...(jokerPlayerId ? [jokerPlayerId] : []),
    ];
    const invalidIds = allSubmittedIds.filter(id => !poolIds.has(id.toString()));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "One or more players do not belong to this group"
      });
    }

    // ── Fetch player snapshots for both teams ──────────────────────
    const [t1Players, t2Players] = await Promise.all([
      Player.find({ _id: { $in: team1PlayerIds || [] } })
        .select("name photoUrl").lean(),
      Player.find({ _id: { $in: team2PlayerIds || [] } })
        .select("name photoUrl").lean(),
    ]);

    // ── Fetch joker player separately if provided ──────────────────
    let jokerPlayer = null;
    if (jokerPlayerId && mongoose.Types.ObjectId.isValid(jokerPlayerId)) {
      jokerPlayer = await Player.findById(jokerPlayerId)
        .select("name photoUrl").lean();
    }

    const toSnapshot = (p) => ({
      playerId: p._id,
      name: p.name,
      photoUrl: p.photoUrl || "",
    });

    // ── Build team snapshots ───────────────────────────────────────
    // RISK: joker appears in BOTH team snapshot arrays
    const t1Snapshots = t1Players.map(toSnapshot);
    const t2Snapshots = t2Players.map(toSnapshot);

    if (jokerPlayer) {
      // Add joker to both team snapshot arrays if not already present
      if (!t1Snapshots.find(s => s.name === jokerPlayer.name)) {
        t1Snapshots.push(toSnapshot(jokerPlayer));
      }
      if (!t2Snapshots.find(s => s.name === jokerPlayer.name)) {
        t2Snapshots.push(toSnapshot(jokerPlayer));
      }
    }

    // ── Build playerStats ──────────────────────────────────────────
    const playerStats = [
      // Team 1 regular players
      ...t1Players.map((p) => ({
        playerId: p._id,
        name: p.name,
        team: "team1",
        isJoker: false,
        isBenched: false,
        skipCareerStats: false,
      })),
      // Team 2 regular players
      ...t2Players.map((p) => ({
        playerId: p._id,
        name: p.name,
        team: "team2",
        isJoker: false,
        isBenched: false,
        skipCareerStats: false,
      })),
    ];

    if (jokerPlayer) {
      // RISK: joker gets TWO entries — one per team
      // This is intentional — they bat/bowl for both teams
      // Both entries have the same playerId
      // statsUpdater merges them into one career record on completion
      playerStats.push({
        playerId: jokerPlayer._id,
        name: jokerPlayer.name,
        team: "team1",
        isJoker: true,
        isBenched: false,
        skipCareerStats: false,
      });
      playerStats.push({
        playerId: jokerPlayer._id,
        name: jokerPlayer.name,
        team: "team2",
        isJoker: true,
        isBenched: false,
        skipCareerStats: false,
      });
    }

    // ── Create match ───────────────────────────────────────────────
    const match = await Match.create({
      groupId,
      team1: { name: team1Name.trim(), players: t1Snapshots },
      team2: { name: team2Name.trim(), players: t2Snapshots },
      totalOvers: totalOvers || 5,
      status: "upcoming",
      current: { battingTeam: "team1", inningsNumber: 1 },
      playerStats,
    });

    broadcastGroupUpdate(groupId, "match_created");
    return res.status(201).json({ 
      success: true, 
      match: mapMatchSummary(match) 
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── createMatch (live start) ─────────────────────────────────────────────────
const createMatch = async (req, res) => {
  try {
    const { groupId, team1Name, team2Name, team1PlayerIds, team2PlayerIds, totalOvers } = req.body;

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Valid groupId is required" });
    }

    const canAccess = await ensureUserIsGroupMember(groupId, req.user._id);
    if (!canAccess) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    const group = await Group.findById(groupId).select("playerPool");
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    const poolIds = group.playerPool.map((id) => id.toString());

    const invalidTeam1 = (team1PlayerIds || []).filter(
      (id) => !poolIds.includes(id.toString())
    );
    if (invalidTeam1.length > 0) {
      return res.status(400).json({
        message: "One or more team 1 players are not in the group pool"
      });
    }

    const invalidTeam2 = (team2PlayerIds || []).filter(
      (id) => !poolIds.includes(id.toString())
    );
    if (invalidTeam2.length > 0) {
      return res.status(400).json({
        message: "One or more team 2 players are not in the group pool"
      });
    }

    const [t1Players, t2Players] = await Promise.all([
      Player.find({ _id: { $in: team1PlayerIds || [] } }).select("name photoUrl").lean(),
      Player.find({ _id: { $in: team2PlayerIds || [] } }).select("name photoUrl").lean(),
    ]);

    const toSnapshot = (p) => ({ playerId: p._id, name: p.name, photoUrl: p.photoUrl || "" });

    const playerStats = [
      ...t1Players.map((p) => ({ playerId: p._id, name: p.name, team: "team1" })),
      ...t2Players.map((p) => ({ playerId: p._id, name: p.name, team: "team2" })),
    ];

    const match = await Match.create({
      groupId,
      team1: { name: team1Name?.trim() || "Team 1", players: t1Players.map(toSnapshot) },
      team2: { name: team2Name?.trim() || "Team 2", players: t2Players.map(toSnapshot) },
      totalOvers: totalOvers || 5,
      status: "toss",
      current: { battingTeam: "team1", inningsNumber: 1 },
      playerStats,
    });

    return res.status(201).json({ success: true, match: mapMatchSummary(match) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── getMatch ─────────────────────────────────────────────────────────────────
const getMatch = async (req, res) => {
  try {
    // ✅ No .populate() — player data is embedded in team1.players / team2.players
    const match = await Match.findById(req.params.id).lean();
    if (!match) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }
    res.status(200).json({ success: true, match: mapMatchSummary(match) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── listUpcomingMatches ──────────────────────────────────────────────────────
const listUpcomingMatches = async (req, res) => {
  try {
    const filter = { status: "upcoming" };
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({ success: false, message: "groupId query parameter is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid groupId" });
    }
    const isMember = await ensureUserIsGroupMember(groupId, req.user._id);
    if (!isMember) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }
    filter.groupId = groupId;

    // ✅ Hits { groupId, status } compound index. No populate.
    const matches = await Match.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    res.status(200).json({ success: true, matches: matches.map(mapMatchSummary) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── listLiveMatches ──────────────────────────────────────────────────────────
const listLiveMatches = async (req, res) => {
  try {
    const filter = { status: { $in: ["toss", "innings", "live", "innings_complete"] } };
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({ success: false, message: "groupId query parameter is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid groupId" });
    }
    const isMember = await ensureUserIsGroupMember(groupId, req.user._id);
    if (!isMember) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }
    filter.groupId = groupId;

    const matches = await Match.find(filter).sort({ updatedAt: -1 }).limit(50).lean();
    res.status(200).json({ success: true, matches: matches.map(mapMatchSummary) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── listCompletedMatches ─────────────────────────────────────────────────────
const listCompletedMatches = async (req, res) => {
  try {
    const filter = { status: "completed" };
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({ success: false, message: "groupId query parameter is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid groupId" });
    }
    const isMember = await ensureUserIsGroupMember(groupId, req.user._id);
    if (!isMember) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }
    filter.groupId = groupId;

    const matches = await Match.find(filter).sort({ updatedAt: -1 }).limit(50).lean();
    res.status(200).json({ success: true, matches: matches.map(mapMatchSummary) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── getOngoingMatch ──────────────────────────────────────────────────────────
const getOngoingMatch = async (req, res) => {
  try {
    const filter = { status: { $in: ["toss", "innings", "live", "innings_complete"] } };
    const { groupId } = req.query;

    if (!groupId) {
      return res.status(400).json({ success: false, message: "groupId query parameter is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid groupId" });
    }

    const isMember = await ensureUserIsGroupMember(groupId, req.user._id);
    if (!isMember) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    filter.groupId = groupId;

    const match = await Match.findOne(filter).sort({ updatedAt: -1 }).lean();

    res.status(200).json({ success: true, match: match ? mapMatchSummary(match) : null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── startMatch ───────────────────────────────────────────────────────────────
const startMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }

    const canAccess = await ensureUserIsGroupMember(match.groupId, req.user._id);
    if (!canAccess) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    if (match.status === "completed") {
      return res.status(400).json({ success: false, message: "Cannot start a completed match" });
    }

    if (match.status === "upcoming") {
      match.status = "toss";
      await match.save();
      broadcastGroupUpdate(match.groupId, "match_started");
    }

    res.status(200).json({ success: true, match: { _id: match._id, status: match.status } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── deleteMatch ──────────────────────────────────────────────────────────────
const deleteMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id).lean();
    if (!match) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }

    const canAccess = await ensureUserIsGroupMember(match.groupId, req.user._id);
    if (!canAccess) {
      return res.status(403).json({ success: false, message: "You are not a member of this group" });
    }

    await Match.findByIdAndDelete(req.params.id);
    broadcastGroupUpdate(match.groupId, "match_deleted");
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createMatch,
  createUpcomingMatch,
  deleteMatch,
  getMatch,
  getOngoingMatch,
  listCompletedMatches,
  listUpcomingMatches,
  listLiveMatches,
  startMatch,
  setIo,
};