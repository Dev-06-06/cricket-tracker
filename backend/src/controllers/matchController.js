const Match = require("../models/Match");
const Player = require("../models/Player");

function buildCompletedResultMessage(match) {
  if (!match || match.status !== "completed") {
    return "";
  }

  if (typeof match.firstInningsScore !== "number") {
    return "";
  }

  const firstInningsScore = Number(match.firstInningsScore) || 0;
  const chasingScore = Number(match.totalRuns) || 0;
  const wicketsLost = Number(match.wickets) || 0;

  if (chasingScore === firstInningsScore) {
    return "Match Tied";
  }

  if (chasingScore > firstInningsScore) {
    const battingCountFromStats = (match.playerStats || []).filter(
      (player) => player.team === match.battingTeam,
    ).length;
    const battingCountFromTeams =
      match.battingTeam === match.team1Name
        ? (match.team1Players || []).length
        : match.battingTeam === match.team2Name
          ? (match.team2Players || []).length
          : 0;
    const battingPlayersCount =
      battingCountFromStats || battingCountFromTeams || 11;
    const wicketsRemaining = Math.max(0, battingPlayersCount - 1 - wicketsLost);
    return `${match.battingTeam} won by ${wicketsRemaining} wicket${wicketsRemaining === 1 ? "" : "s"}`;
  }

  const runsMargin = firstInningsScore - chasingScore;
  return `${match.bowlingTeam} won by ${runsMargin} run${runsMargin === 1 ? "" : "s"}`;
}

function mapMatchSummary(match) {
  return {
    _id: match._id,
    team1Name: match.team1Name,
    team2Name: match.team2Name,
    totalOvers: match.totalOvers,
    status: match.status,
    inningsNumber: match.inningsNumber,
    totalRuns: match.totalRuns,
    wickets: match.wickets,
    oversBowled: match.oversBowled,
    ballsBowled: match.ballsBowled,
    firstInningsScore: match.firstInningsScore,
    targetScore: match.targetScore,
    battingTeam: match.battingTeam,
    bowlingTeam: match.bowlingTeam,
    resultMessage: buildCompletedResultMessage(match),
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    team1Players: (match.team1Players || []).map((player) => ({
      _id: player._id,
      name: player.name,
    })),
    team2Players: (match.team2Players || []).map((player) => ({
      _id: player._id,
      name: player.name,
    })),
  };
}

const createMatch = async (req, res) => {
  try {
    const {
      battingTeam,
      bowlingTeam,
      currentStriker,
      currentNonStriker,
      currentBowler,
    } = req.body;

    const match = new Match({
      battingTeam,
      bowlingTeam,
      currentStriker,
      currentNonStriker,
      currentBowler,
    });

    const savedMatch = await match.save();
    res.status(201).json({ success: true, match: savedMatch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createUpcomingMatch = async (req, res) => {
  try {
    const { team1Name, team2Name, team1PlayerIds, team2PlayerIds, totalOvers } =
      req.body;

    if (!team1Name?.trim() || !team2Name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Both team names are required",
      });
    }

    const t1Players = await Player.find({
      _id: { $in: team1PlayerIds || [] },
    }).select("name");
    const t2Players = await Player.find({
      _id: { $in: team2PlayerIds || [] },
    }).select("name");

    const playerStats = [];
    t1Players.forEach((player) => {
      playerStats.push({
        playerId: player._id,
        name: player.name,
        team: team1Name.trim(),
        didBat: false,
        didBowl: false,
      });
    });
    t2Players.forEach((player) => {
      playerStats.push({
        playerId: player._id,
        name: player.name,
        team: team2Name.trim(),
        didBat: false,
        didBowl: false,
      });
    });
    const match = await Match.create({
      team1Name: team1Name.trim(),
      team2Name: team2Name.trim(),
      team1Players: team1PlayerIds || [],
      team2Players: team2PlayerIds || [],
      totalOvers: Number(totalOvers) || 5,
      battingTeam: team1Name.trim(),
      bowlingTeam: team2Name.trim(),
      inningsNumber: 1,
      status: "upcoming",
      playerStats,
    });

    const populatedMatch = await Match.findById(match._id)
      .populate("team1Players", "name")
      .populate("team2Players", "name");

    res
      .status(201)
      .json({ success: true, match: mapMatchSummary(populatedMatch) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id)
      .populate("team1Players", "name")
      .populate("team2Players", "name");

    if (!match) {
      return res
        .status(404)
        .json({ success: false, message: "Match not found" });
    }

    res.status(200).json({ success: true, match });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const listUpcomingMatches = async (_req, res) => {
  try {
    const matches = await Match.find({ status: "upcoming" })
      .populate("team1Players", "name")
      .populate("team2Players", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      matches: matches.map(mapMatchSummary),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const listLiveMatches = async (_req, res) => {
  try {
    const matches = await Match.find({
      status: { $in: ["toss", "innings", "live", "innings_complete"] },
    })
      .populate("team1Players", "name")
      .populate("team2Players", "name")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      matches: matches.map(mapMatchSummary),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const listCompletedMatches = async (_req, res) => {
  try {
    const matches = await Match.find({ status: "completed" })
      .populate("team1Players", "name")
      .populate("team2Players", "name")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      matches: matches.map(mapMatchSummary),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const startMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const match = await Match.findById(id);

    if (!match) {
      return res
        .status(404)
        .json({ success: false, message: "Match not found" });
    }

    if (match.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot start a completed match",
      });
    }

    if (match.status === "upcoming") {
      match.status = "toss";
      await match.save();
    }

    res.status(200).json({
      success: true,
      match: {
        _id: match._id,
        status: match.status,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOngoingMatch = async (_req, res) => {
  try {
    const match = await Match.findOne({
      status: { $in: ["toss", "innings", "live", "innings_complete"] },
    }).sort({
      updatedAt: -1,
    });

    if (!match) {
      return res.status(200).json({ success: true, match: null });
    }

    res.status(200).json({ success: true, match });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const match = await Match.findByIdAndDelete(id);

    if (!match) {
      return res
        .status(404)
        .json({ success: false, message: "Match not found" });
    }

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
};
