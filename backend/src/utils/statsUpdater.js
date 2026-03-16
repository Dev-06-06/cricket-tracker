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
  // STEP 1: Group playerStats entries by a dedup key.
  // RISK: jokers have TWO entries with the same playerId — must merge them.
  // RISK: on-the-fly players have no playerId — use name as fallback key.
  const playerGroups = new Map();

  for (const ps of match.playerStats) {
    // RISK: skip frozen dissolved joker entries — skipCareerStats flag set
    // during joker dissolution in overBreakCommit
    if (ps.skipCareerStats) continue;

    const key = ps.playerId
      ? ps.playerId.toString()
      : `name:${ps.name}`;

    if (!playerGroups.has(key)) {
      playerGroups.set(key, {
        playerId: ps.playerId || null,
        name: ps.name,
        entries: [],
      });
    }
    playerGroups.get(key).entries.push(ps);
  }

  // STEP 2: Build bulkWrite ops — one per player (or merged joker)
  const ops = [];

  for (const [key, group] of playerGroups) {
    const { playerId, name, entries } = group;

    // Bowling is tracked by NAME in the timeline via buildBowlingByName.
    // This naturally handles jokers since the same name appears in timeline
    // regardless of which team entry they're from.
    const bowlingStats = bowlingByName[name] || {
      balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0,
    };

    // STEP 2a: Merge batting across all entries (handles joker with 2 entries)
    // RISK: joker innings counts as 1 — not one per entry
    let didBat = false;
    let didBowl = false;
    let isOut = false;
    let totalRuns  = 0;
    let totalBalls = 0;
    let totalFours = 0;
    let totalSixes = 0;

    for (const entry of entries) {
      if (entry.didBat) {
        didBat = true;
        totalRuns  += Number(entry.batting?.runs)  || 0;
        totalBalls += Number(entry.batting?.balls) || 0;
        totalFours += Number(entry.batting?.fours) || 0;
        totalSixes += Number(entry.batting?.sixes) || 0;
        // RISK: isOut true if dismissed in ANY of their entries
        if (entry.isOut) isOut = true;
      }
      if (entry.didBowl) didBowl = true;
    }

    // Also check bowling by timeline (catches bowlers not flagged didBowl)
    const bowledInTimeline = bowlingStats.balls > 0 ||
      bowlingStats.runs > 0 ||
      bowlingStats.wickets > 0;
    if (bowledInTimeline) didBowl = true;

    const inc = {};
    const max = {};

    // STEP 2b: Batting stats — preserve ALL existing fields
    if (didBat) {
      inc["batting.matches"]  = 1;
      // RISK: innings = 1 even for joker with 2 entries (already merged above)
      inc["batting.innings"]  = 1;
      inc["batting.runs"]     = totalRuns;
      inc["batting.balls"]    = totalBalls;
      inc["batting.fours"]    = totalFours;
      inc["batting.sixes"]    = totalSixes;

      if (!isOut)              inc["batting.notOuts"]  = 1;
      if (totalRuns >= 100)    inc["batting.hundreds"] = 1;
      else if (totalRuns >= 50) inc["batting.fifties"]  = 1;
      else if (totalRuns >= 30) inc["batting.thirties"] = 1;

      max["batting.highestScore"] = totalRuns;
    }

    // STEP 2c: Bowling stats — preserve ALL existing fields
    // buildBowlingByName already merged both innings correctly
    if (didBowl && bowledInTimeline) {
      inc["bowling.matches"]  = 1;
      inc["bowling.innings"]  = 1;
      inc["bowling.balls"]    = bowlingStats.balls;
      inc["bowling.runs"]     = bowlingStats.runs;
      inc["bowling.wickets"]  = bowlingStats.wickets;
      inc["bowling.wides"]    = bowlingStats.wides   || 0;
      inc["bowling.noBalls"]  = bowlingStats.noBalls || 0;

      if (bowlingStats.wickets >= 5)       inc["bowling.fiveWickets"]  = 1;
      else if (bowlingStats.wickets === 4) inc["bowling.fourWickets"]  = 1;
      else if (bowlingStats.wickets === 3) inc["bowling.threeWickets"] = 1;
    }

    if (Object.keys(inc).length === 0 && Object.keys(max).length === 0) continue;

    const update = {};
    if (Object.keys(inc).length > 0) update.$inc = inc;
    if (Object.keys(max).length > 0) update.$max = max;

    // STEP 2d: Build filter
    // RISK: on-the-fly players have no playerId — match by name + groupId
    // RISK: sparse unique index on {playerId, groupId} allows null playerId docs
    const filter = playerId
      ? { playerId, groupId }
      : { playerId: null, name, groupId };

    ops.push({
      updateOne: {
        filter,
        update: {
          ...update,
          // $setOnInsert only runs on upsert insert — safe to always include
          $setOnInsert: {
            playerId: playerId || null,
            name,
            groupId,
          },
        },
        upsert: true,
      },
    });
  }

  // STEP 3: Single round-trip bulkWrite — preserves existing performance pattern
  // RISK: runs inside the same session/transaction as match completion.
  // If bulkWrite fails, transaction rolls back — statsApplied stays false
  // and the match can be safely retried.
  if (ops.length > 0) {
    await GroupPlayerStats.bulkWrite(
      ops,
      options.session ? { session: options.session } : {}
    );
  }
}

module.exports = { updateCareerStats, isValidBallType, buildBowlingByName };