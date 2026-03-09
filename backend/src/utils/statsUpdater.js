const GroupPlayerStats = require("../models/GroupPlayerStats");

const isValidBallType = (extraType) =>
  extraType === "none" || extraType === "bye" || extraType === "leg-bye";

function calculateOversFromBalls(totalBalls) {
  const balls = Number(totalBalls) || 0;
  return Math.floor(balls / 6) + (balls % 6) / 10;
}

// Build a map of { playerName -> { balls, runs, wickets, wides, noBalls } }
// from the match timeline (both innings combined via innings1 summary + current timeline)
function buildBowlingByName(match) {
  const bowlingByName = {};

  // Include first innings bowling rows if stored in innings1 summary
  const firstInningsBowlingRows =
    match?.innings1?.bowlingRows && Array.isArray(match.innings1.bowlingRows)
      ? match.innings1.bowlingRows
      : [];

  firstInningsBowlingRows.forEach((row) => {
    const bowler = row?.name;
    if (!bowler) return;
    if (!bowlingByName[bowler]) {
      bowlingByName[bowler] = { balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
    }
    bowlingByName[bowler].balls   += Number(row.balls)   || 0;
    bowlingByName[bowler].runs    += Number(row.runs)    || 0;
    bowlingByName[bowler].wickets += Number(row.wickets) || 0;
  });

  // Current innings timeline
  (match.timeline || []).forEach((delivery) => {
    const bowler = delivery.bowler;
    if (!bowler) return;
    if (!bowlingByName[bowler]) {
      bowlingByName[bowler] = { balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
    }

    if (isValidBallType(delivery.extraType)) {
      bowlingByName[bowler].balls += 1;
    }

    const extraType  = delivery.extraType  || "none";
    const runsOffBat = Number(delivery.runsOffBat) || 0;
    const extraRuns  = Number(delivery.extraRuns)  || 0;
    const isByeLike  = extraType === "bye" || extraType === "leg-bye";

    if (!isByeLike) {
      bowlingByName[bowler].runs += runsOffBat;
    }
    if (extraType === "wide") {
      bowlingByName[bowler].runs   += extraRuns;
      bowlingByName[bowler].wides  += 1;
    }
    if (extraType === "no-ball") {
      bowlingByName[bowler].runs    += extraRuns;
      bowlingByName[bowler].noBalls += 1;
    }
    if (delivery.isWicket && delivery.wicketType !== "run-out") {
      bowlingByName[bowler].wickets += 1;
    }
  });

  return bowlingByName;
}

/**
 * Applies match stats to GroupPlayerStats (per-group career stats).
 * Called once when a match completes (guarded by match.statsApplied flag).
 *
 * Uses bulkWrite for a single round-trip instead of one save per player.
 */
async function updateCareerStats(match, options = {}) {
  if (!match || !Array.isArray(match.playerStats)) return;

  const groupId = match.groupId;
  const bowlingByName = buildBowlingByName(match);
  const ops = [];

  for (const ps of match.playerStats) {
    if (!ps.playerId) continue;

    const batting      = ps.batting  || {};
    const bowlingStats = bowlingByName[ps.name] || { balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
    const didBat  = Boolean(ps.didBat);
    const didBowl = Boolean(ps.didBowl) || bowlingStats.balls > 0;
    const battingRuns = Number(batting.runs) || 0;

    const inc = {};
    const max = {};

    if (didBat) {
      inc["batting.matches"]  = 1;
      inc["batting.innings"]  = 1;
      inc["batting.runs"]     = battingRuns;
      inc["batting.balls"]    = Number(batting.balls)  || 0;
      inc["batting.fours"]    = Number(batting.fours)  || 0;
      inc["batting.sixes"]    = Number(batting.sixes)  || 0;

      if (!ps.isOut)          inc["batting.notOuts"]  = 1;
      if (battingRuns >= 100) inc["batting.hundreds"] = 1;
      else if (battingRuns >= 50) inc["batting.fifties"]  = 1;
      else if (battingRuns >= 30) inc["batting.thirties"] = 1;

      max["batting.highestScore"] = battingRuns;
    }

    if (didBowl && (bowlingStats.balls > 0 || bowlingStats.runs > 0 || bowlingStats.wickets > 0)) {
      inc["bowling.matches"]  = 1;
      inc["bowling.innings"]  = 1;
      inc["bowling.balls"]    = bowlingStats.balls;
      inc["bowling.runs"]     = bowlingStats.runs;
      inc["bowling.wickets"]  = bowlingStats.wickets;
      inc["bowling.wides"]    = bowlingStats.wides   || 0;
      inc["bowling.noBalls"]  = bowlingStats.noBalls || 0;

      if (bowlingStats.wickets >= 5)      inc["bowling.fiveWickets"]  = 1;
      else if (bowlingStats.wickets === 4) inc["bowling.fourWickets"]  = 1;
      else if (bowlingStats.wickets === 3) inc["bowling.threeWickets"] = 1;
    }

    if (Object.keys(inc).length === 0 && Object.keys(max).length === 0) continue;

    const update = {};
    if (Object.keys(inc).length > 0) update.$inc = inc;
    if (Object.keys(max).length > 0) update.$max = max;

    ops.push({
      updateOne: {
        filter: { playerId: ps.playerId, groupId },
        update,
        upsert: true,
      },
    });
  }

  if (ops.length > 0) {
    // ✅ Single round-trip to MongoDB for all player stat updates
    await GroupPlayerStats.bulkWrite(ops, options.session ? { session: options.session } : {});
  }
}

module.exports = { updateCareerStats, isValidBallType, buildBowlingByName };