const Player = require("../models/Player");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toNum = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundTo = (value, digits = 2) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const parseOversToBalls = (oversValue) => {
  if (oversValue === null || oversValue === undefined || oversValue === "") {
    return 0;
  }

  const parsed = Number(oversValue);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;

  const wholeOvers = Math.floor(parsed);
  const ballsPart = Math.round((parsed - wholeOvers) * 10);
  if (ballsPart < 0 || ballsPart > 5) return 0;

  return wholeOvers * 6 + ballsPart;
};

const calculateComputedStats = (playerDoc) => {
  const batting = playerDoc?.batting || {};
  const bowling = playerDoc?.bowling || {};

  const battingRuns = toNum(batting.runs);
  const battingBalls = toNum(batting.balls);
  const battingInnings = toNum(batting.innings);
  const battingNotOuts = toNum(batting.notOuts);
  const dismissals = Math.max(0, battingInnings - battingNotOuts);

  const battingAverage =
    dismissals > 0 ? roundTo(battingRuns / dismissals, 2) : null;
  const battingStrikeRate =
    battingBalls > 0 ? roundTo((battingRuns * 100) / battingBalls, 2) : null;

  const bowlingRuns = toNum(bowling.runs);
  const bowlingWickets = toNum(bowling.wickets);
  const legalBallsFromBalls = toNum(bowling.balls);
  const legalBallsFromOvers = parseOversToBalls(bowling.overs);
  const legalBalls =
    legalBallsFromBalls > 0 ? legalBallsFromBalls : legalBallsFromOvers;

  const bowlingAverage =
    bowlingWickets > 0 ? roundTo(bowlingRuns / bowlingWickets, 2) : null;
  const bowlingEconomy =
    legalBalls > 0 ? roundTo((bowlingRuns * 6) / legalBalls, 2) : null;

  return {
    batting: {
      average: battingAverage,
      strikeRate: battingStrikeRate,
      dismissals,
    },
    bowling: {
      average: bowlingAverage,
      economy: bowlingEconomy,
      legalBalls,
    },
  };
};

const getPlayers = async (req, res) => {
  try {
    const players = await Player.find({}).sort({ name: 1 });
    const playersWithComputedStats = players.map((playerDoc) => {
      const player = playerDoc.toObject();
      return {
        ...player,
        computedStats: calculateComputedStats(player),
      };
    });

    res.json({ success: true, players: playersWithComputedStats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createPlayer = async (req, res) => {
  try {
    const { name, photoUrl } = req.body;
    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Name is required" });
    }

    const trimmedName = name.trim();
    const existingPlayer = await Player.findOne({
      name: { $regex: `^${escapeRegExp(trimmedName)}$`, $options: "i" },
    });

    if (existingPlayer) {
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

module.exports = { getPlayers, createPlayer };
