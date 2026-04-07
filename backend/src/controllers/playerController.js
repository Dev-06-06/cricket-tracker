const mongoose = require("mongoose");
const Player = require("../models/Player");
const Group = require("../models/Group");
const GroupPlayerStats = require("../models/GroupPlayerStats");

const escapeRegExp = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const roundTo = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

const parseOversToBalls = (overs) => {
  if (!overs) return 0;
  const parts = String(overs).split(".");
  return parseInt(parts[0], 10) * 6 + (parseInt(parts[1], 10) || 0);
};

// Computed stats are derived — never stored — to keep the DB lean
const calculateComputedStats = (batting, bowling) => {
  const dismissals = (batting.innings || 0) - (batting.notOuts || 0);
  const battingAverage =
    dismissals > 0 ? roundTo(batting.runs / dismissals, 2) : null;
  const battingStrikeRate =
    batting.balls > 0
      ? roundTo((batting.runs * 100) / batting.balls, 2)
      : null;

  const legalBalls =
    bowling.balls > 0 ? bowling.balls : parseOversToBalls(bowling.overs);
  const bowlingAverage =
    bowling.wickets > 0 ? roundTo(bowling.runs / bowling.wickets, 2) : null;
  const bowlingEconomy =
    legalBalls > 0 ? roundTo((bowling.runs * 6) / legalBalls, 2) : null;

  return {
    batting: { average: battingAverage, strikeRate: battingStrikeRate, dismissals },
    bowling: { average: bowlingAverage, economy: bowlingEconomy, legalBalls },
  };
};

// ─── getPlayers (global list, no stats) ──────────────────────────────────────
const getPlayers = async (_req, res) => {
  try {
    // ✅ Player docs are now tiny (name, photoUrl, userId only) — very fast
    const players = await Player.find({}).sort({ name: 1 }).limit(500).lean();
    res.json({ success: true, players });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── getGroupPlayersWithStats ─────────────────────────────────────────────────
// OLD: Group.findById → Player.find({ _id: $in pool }) = 2 queries
// NEW: GroupPlayerStats.find({ groupId }).populate("playerId") = 1 query
const getGroupPlayersWithStats = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid groupId" });
    }

    // Auth check — user must be a member of this group
    const group = await Group.findOne({
      _id: groupId,
      "members.user": req.user._id,
    }).select("_id").lean();

    if (!group) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this group",
      });
    }

    // ✅ Single query — hits { groupId: 1 } index
    const statsRecords = await GroupPlayerStats.find({ groupId })
      .populate("playerId", "name photoUrl userId")
      .lean();

    const players = statsRecords
      .filter((s) => s.playerId)
      .map((s) => {
        const totalBalls = s.bowling?.balls || 0;
        // ✅ Compute overs from balls on read — never trust stored overs value
        const computedOvers = Math.floor(totalBalls / 6) + (totalBalls % 6) / 10;
        const bowling = { ...s.bowling, overs: computedOvers };
        return {
          _id: s.playerId._id,
          name: s.playerId.name,
          photoUrl: s.playerId.photoUrl || "",
          userId: s.playerId.userId || null,
          batting: s.batting,
          bowling,
          computedStats: calculateComputedStats(s.batting, bowling),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ success: true, players });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── createPlayer ─────────────────────────────────────────────────────────────
const createPlayer = async (req, res) => {
  try {
    const { name, photoUrl } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: "Name is required" });
    }

    const trimmedName = name.trim();

    // ✅ Hits { name: 1 } index
    const existing = await Player.findOne({
      name: { $regex: `^${escapeRegExp(trimmedName)}$`, $options: "i" },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Player with this name already exists",
      });
    }

    const player = await Player.create({
      name: trimmedName,
      photoUrl: typeof photoUrl === "string" ? photoUrl.trim() : "",
    });

    res.status(201).json({ success: true, player });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getPlayers, createPlayer, getGroupPlayersWithStats };