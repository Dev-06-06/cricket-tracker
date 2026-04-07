const mongoose = require("mongoose");
const Match = require("../models/Match");
const Group = require("../models/Group");
const GroupPlayerStats = require("../models/GroupPlayerStats");
const { updateCareerStats, isValidBallType } = require("../utils/statsUpdater");

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verify that a user is a member of the group associated with the match.
 * @param {Object} match - The match document
 * @param {String} userId - The userId to verify
 * @returns {Promise<Boolean>} True if user is a group member, false otherwise
 */
async function assertGroupMember(match, userId) {
  if (!match || !userId) return false;
  const group = await Group.findOne({
    _id: match.groupId,
    "members.user": userId,
  }).select("_id");
  return Boolean(group);
}

function calculateOvers(totalValidBalls) {
  const balls = Number(totalValidBalls) || 0;
  return Math.floor(balls / 6) + (balls % 6) / 10;
}

async function saveWithRetry(matchId, applyFn, maxAttempts = 3) {
  // RISK: VersionError happens when rapid socket events load the same __v
  // and both try to save. We re-fetch the fresh document and re-apply
  // the same logic on each retry. This is safe because applyFn is
  // deterministic given the current match state.
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const match = await Match.findById(matchId);
    if (!match) return null;
    try {
      await applyFn(match);
      await match.save();
      return match;
    } catch (err) {
      if (err.name === "ValidationError") {
        throw err;
      }
      const isVersionError =
        err.name === "VersionError" ||
        err.message?.includes("No matching document found");
      if (isVersionError && attempt < maxAttempts - 1) {
        // Wait briefly before retry to reduce collision chance
        await new Promise((res) => setTimeout(res, 20 + attempt * 30));
        continue;
      }
      throw err;
    }
  }
  return null;
}

function shouldRotateStrike(runs, extraType, totalValidBalls) {
  if (extraType === "wide") return false;

  const isValidBall =
    extraType === "none" || extraType === "bye" || extraType === "leg-bye";

  // Rule A: odd runs rotate strike
  let rotates = runs % 2 === 1;

  // Rule B: end of over also flips rotation (XOR)
  // e.g. single on last ball → odd=true XOR end-of-over=true → false (no rotation)
  // e.g. dot on last ball   → odd=false XOR end-of-over=true → true (rotate)
  if (isValidBall && totalValidBalls > 0 && totalValidBalls % 6 === 0) {
    rotates = !rotates;
  }

  return rotates;
}

// DEPRECATED for innings-end logic. Use getAvailableBatters() instead.
// Still used by checkMatchEnd for run-chase calculations — do not remove.
function getBattingTeamSize(match) {
  const team = match.current.battingTeam; // "team1" | "team2"
  return (match.playerStats || []).filter((p) => p.team === team).length || 11;
}

function getAvailableBatters(match) {
  const battingTeam = match.current.battingTeam; // "team1" | "team2"
  const strikerName = match.current.striker?.name;
  const nonStrikerName = match.current.nonStriker?.name;

  // Filter to batting team entries only — this naturally handles
  // jokers correctly: their batting-team entry passes, their
  // bowling-team entry is excluded by team filter
  const battingEntries = match.playerStats.filter((p) => {
    if (p.team !== battingTeam) return false;
    if (p.isOut) return false;
    if (p.name === strikerName || p.name === nonStrikerName) return false;
    return true;
  });

  // Deduplicate by name as final safety net
  // (should not be needed after team filter but guards edge cases)
  const seen = new Set();
  return battingEntries.filter((p) => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

function getCurrentInningsNumber(match) {
  return match.current.inningsNumber || 1;
}

// ─── emitMatchState ───────────────────────────────────────────────────────────
// ✅ No DB query — accepts the already-loaded match document directly.
// Call as: emitMatchState(io.to(matchId), match)
function emitMatchState(target, match) {
  const m = match.toObject ? match.toObject() : match;
  const team1Name = m.team1.name;
  const team2Name = m.team2.name;

  const statsMap = {};
  (m.playerStats || []).forEach((ps) => {
    const teamName = ps.team === "team1" ? team1Name : team2Name;
    const key = `${ps.name}__${ps.team}`;
    statsMap[key] = {
      playerId: ps.playerId ?? null,
      name: ps.name ?? "",
      team: teamName,
      didBat: ps.didBat === true,
      didBowl: ps.didBowl === true,
      isOut: ps.isOut === true,
      isBenched: ps.isBenched === true,
      isJoker: ps.isJoker === true,
      skipCareerStats: ps.skipCareerStats === true,
      batting: {
        runs: Number(ps.batting?.runs) || 0,
        balls: Number(ps.batting?.balls) || 0,
        fours: Number(ps.batting?.fours) || 0,
        sixes: Number(ps.batting?.sixes) || 0,
        dismissalType: ps.batting?.dismissalType || "",
      },
      bowling: {
        overs: Number(ps.bowling?.overs) || 0,
        balls: Number(ps.bowling?.balls) || 0,
        runs: Number(ps.bowling?.runs) || 0,
        wickets: Number(ps.bowling?.wickets) || 0,
        wides: Number(ps.bowling?.wides) || 0,
        noBalls: Number(ps.bowling?.noBalls) || 0,
      },
    };
  });

  const playerStatsArray = Object.values(statsMap);

  // Determine nextBatterFor from current state
  let nextBatterFor = m.current.nextBatterFor || null;
  if (!nextBatterFor) {
    if (!m.current.striker?.name && m.current.nonStriker?.name) {
      nextBatterFor = "striker";
    } else if (!m.current.nonStriker?.name && m.current.striker?.name) {
      nextBatterFor = "nonStriker";
    }
  }

  const fullTimeline = (m.timeline || []).map((ball) => ({
    ...ball,
    runs: ball.runsOffBat,
    isValidBall: isValidBallType(ball.extraType),
  }));

  // Only send last 12 balls (current over + previous over)
  // for real-time updates. Frontend scoreboard only needs
  // current over balls for the live over display.
  const recentTimeline = fullTimeline.slice(-12);

  target.emit("matchState", {
    _id: m._id,
    groupId: m.groupId,
    team1Name,
    team2Name,
    team1Players: m.team1.players,
    team2Players: m.team2.players,
    totalOvers: m.totalOvers,
    status: m.status,

    // Toss
    tossWinner: m.toss?.winner || "",
    tossChoice: m.toss?.choice || "",

    // Live state (flattened for frontend compatibility)
    inningsNumber: m.current.inningsNumber,
    battingTeam: m.current.battingTeam === "team1" ? team1Name : team2Name,
    bowlingTeam: m.current.battingTeam === "team1" ? team2Name : team1Name,
    totalRuns: m.current.runs,
    wickets: m.current.wickets,
    oversBowled: m.current.oversBowled,
    ballsBowled: m.current.ballsBowled,
    striker: m.current.striker?.name || null,
    nonStriker: m.current.nonStriker?.name || null,
    currentStriker: m.current.striker?.name || null,
    currentNonStriker: m.current.nonStriker?.name || null,
    currentBowler: m.current.bowler?.name || null,
    nextBatterFor,

    // Innings 1 — normalize field names to match what frontend reads
    firstInningsScore: m.innings1?.score ?? null,
    targetScore: m.innings1?.target ?? null,
    // Frontend reads .totalRuns and .oversBowled — map from new schema names
    firstInningsSummary: m.innings1
      ? {
          ...m.innings1,
          totalRuns: m.innings1.score,
          oversBowled: m.innings1.overs,
        }
      : null,
    innings1: m.innings1
      ? {
          battingTeam:
            m.innings1.battingTeam === "team1" ? team1Name : team2Name,
          bowlingTeam:
            m.innings1.battingTeam === "team1" ? team2Name : team1Name,
          score: m.innings1.score ?? 0,
          wickets: m.innings1.wickets ?? 0,
          overs: m.innings1.overs ?? 0,
          target: m.innings1.target ?? null,
          battingRows: Array.isArray(m.innings1.battingRows)
            ? m.innings1.battingRows
            : [],
          bowlingRows: Array.isArray(m.innings1.bowlingRows)
            ? m.innings1.bowlingRows
            : [],
        }
      : null,

    playerStats: playerStatsArray,
    timeline: recentTimeline,
    timelineLength: fullTimeline.length,

    result: m.result || {},
    statsApplied: m.statsApplied,
  });
}

function emitFullMatchState(target, match) {
  const m = match.toObject ? match.toObject() : match;
  const fullTimeline = (m.timeline || []).map((ball) => ({
    ...ball,
    runs: ball.runsOffBat,
    isValidBall: isValidBallType(ball.extraType),
  }));

  // Emit a separate event with the full timeline
  target.emit("fullTimeline", {
    matchId: m._id,
    timeline: fullTimeline,
    timelineLength: fullTimeline.length,
  });
}

// ─── completeMatchWithStats ───────────────────────────────────────────────────
async function completeMatchWithStats({ matchId, resultMessage, io }) {
  const session = await mongoose.startSession();
  let payload = null;

  try {
    await session.withTransaction(async () => {
      const match = await Match.findById(matchId).session(session);
      if (!match || match.statsApplied) return;

      match.status = "completed";
      match.statsApplied = true;
      match.result = {
        winner: resultMessage,
        message: resultMessage,
      };

      await match.save({ session });
      await updateCareerStats(match, { session });

      payload = {
        matchId,
        resultMessage,
        firstInningsScore: match.innings1?.score ?? null,
        targetScore: match.innings1?.target ?? null,
      };
    });
  } finally {
    await session.endSession();
  }

  if (!payload) return false;

  // ✅ No extra DB query — emit using the already-loaded match
  const completedMatch = await Match.findById(matchId);
  if (completedMatch) emitMatchState(io.to(matchId), completedMatch);
  io.to(matchId).emit("match_completed", payload);
  return true;
}

// ─── buildFirstInningsSummary ─────────────────────────────────────────────────
function buildFirstInningsSummary(match) {
  const battingTeam = match.current.battingTeam; // "team1" | "team2"
  const team1Name = match.team1.name;
  const team2Name = match.team2.name;
  const battingTeamName = battingTeam === "team1" ? team1Name : team2Name;
  const bowlingTeamName = battingTeam === "team1" ? team2Name : team1Name;
  const timeline = match.timeline || [];

  const dismissalOrder = {};
  timeline.forEach((ball, index) => {
    if (ball.isWicket && ball.batterDismissed) {
      dismissalOrder[ball.batterDismissed] = index;
    }
  });

  const battingRows = (match.playerStats || [])
    .filter((p) => p.team === battingTeam && p.didBat)
    .map((p) => {
      const runs = p.batting?.runs || 0;
      const balls = p.batting?.balls || 0;
      return {
        name: p.name,
        dismissal: p.isOut ? p.batting?.dismissalType || "out" : "not out",
        runs,
        balls,
        fours: p.batting?.fours || 0,
        sixes: p.batting?.sixes || 0,
        strikeRate:
          balls > 0 ? Number(((runs / balls) * 100).toFixed(2)) : null,
        dismissalOrder: dismissalOrder[p.name] ?? Infinity,
      };
    })
    .sort((a, b) => a.dismissalOrder - b.dismissalOrder);

  // Build bowling rows from the current innings timeline
  const bowlingMap = {};
  timeline.forEach((ball) => {
    const bowler = ball.bowler;
    if (!bowler) return;
    if (!bowlingMap[bowler]) {
      bowlingMap[bowler] = { name: bowler, balls: 0, runs: 0, wickets: 0 };
    }
    if (isValidBallType(ball.extraType)) bowlingMap[bowler].balls += 1;
    const extra = ball.extraType || "none";
    if (extra !== "bye" && extra !== "leg-bye") {
      bowlingMap[bowler].runs += Number(ball.runsOffBat) || 0;
    }
    if (extra === "wide" || extra === "no-ball") {
      bowlingMap[bowler].runs += Number(ball.extraRuns) || 0;
    }
    if (ball.isWicket && ball.wicketType !== "run-out") {
      bowlingMap[bowler].wickets += 1;
    }
  });

  const bowlingRows = Object.values(bowlingMap).map((b) => ({
    ...b,
    overs: calculateOvers(b.balls),
  }));

  return {
    battingTeam: battingTeamName,
    bowlingTeam: bowlingTeamName,
    score: match.current.runs,
    wickets: match.current.wickets,
    overs: match.current.oversBowled,
    battingRows,
    bowlingRows,
  };
}

// ─── startSecondInnings ───────────────────────────────────────────────────────
function startSecondInnings(match) {
  const firstInningsRuns = Number(match.current.runs) || 0;
  const nextBattingTeam =
    match.current.battingTeam === "team1" ? "team2" : "team1";

  // Save first innings summary into innings1
  match.innings1 = {
    ...buildFirstInningsSummary(match),
    score: firstInningsRuns,
    wickets: match.current.wickets,
    overs: match.current.oversBowled,
    target: firstInningsRuns + 1,
    battingTeam: match.current.battingTeam,
  };

  // Reset live state for second innings
  match.current.inningsNumber = 2;
  match.current.battingTeam = nextBattingTeam;
  match.current.runs = 0;
  match.current.wickets = 0;
  match.current.oversBowled = 0;
  match.current.ballsBowled = 0;
  match.current.striker = { name: null, playerId: null };
  match.current.nonStriker = { name: null, playerId: null };
  match.current.bowler = { name: null, playerId: null };
  match.current.nextBatterFor = null;
  // RISK: clear bench state from first innings
  // benched players from innings 1 must not appear in innings 2
  match.current.benchedPlayers = [];
  match.current.overBreakPending = false;
  match.markModified("current");
  match.status = "innings_complete";
  match.timeline = [];

  // Reset batting figures for the new batting team
  match.playerStats.forEach((ps) => {
    if (ps.team === nextBattingTeam) {
      ps.didBat = false;
      ps.isOut = false;
      ps.isBenched = false;
      // RISK: joker may have been benched in innings 1 —
      // clear bench flag for innings 2
      if (ps.batting) {
        ps.batting.runs = 0;
        ps.batting.balls = 0;
        ps.batting.fours = 0;
        ps.batting.sixes = 0;
        ps.batting.dismissalType = "";
      }
    }
  });

  // RISK: also clear bench flags for innings 1 batting team
  // (now bowling team in innings 2) so their bench state
  // from innings 1 doesn't persist
  // Note: at this point battingTeam is already switched to
  // nextBattingTeam, so prev team = opposite of nextBattingTeam
  const inns1BattingTeam = nextBattingTeam === "team1" ? "team2" : "team1";

  match.playerStats.forEach((ps) => {
    if (ps.team === inns1BattingTeam) {
      // RISK: clear bench flag for innings 1 batters
      // They finished their innings — bench state is irrelevant now
      ps.isBenched = false;
    }
  });

  match.markModified("playerStats");
  match.markModified("current");

  return {
    battingTeam:
      nextBattingTeam === "team1" ? match.team1.name : match.team2.name,
    firstInningsScore: firstInningsRuns,
    targetScore: firstInningsRuns + 1,
  };
}

// ─── checkMatchEnd ────────────────────────────────────────────────────────────
function checkMatchEnd(
  {
    teamAScore,
    teamBScore,
    teamBWickets,
    teamBPlayersCount,
    totalValidBalls,
    totalOvers,
  },
  team1Name,
  team2Name,
) {
  const maxBalls = (Number(totalOvers) || 0) * 6;

  if (teamBScore > teamAScore) {
    const wicketsRemaining = Math.max(
      0,
      (teamBPlayersCount || 11) - 1 - teamBWickets,
    );
    return {
      isMatchOver: true,
      resultMessage: `${team2Name} won by ${wicketsRemaining} wicket${wicketsRemaining === 1 ? "" : "s"}`,
    };
  }
  if (maxBalls > 0 && totalValidBalls >= maxBalls) {
    if (teamBScore === teamAScore)
      return { isMatchOver: true, resultMessage: "Match Tied" };
    if (teamBScore < teamAScore) {
      const margin = teamAScore - teamBScore;
      return {
        isMatchOver: true,
        resultMessage: `${team1Name} won by ${margin} run${margin === 1 ? "" : "s"}`,
      };
    }
  }
  return { isMatchOver: false, resultMessage: "" };
}

// ─── applyWicketState ─────────────────────────────────────────────────────────
function applyWicketState(
  match,
  { dismissedBatter, dismissedPlayerType, wicketType },
) {
  match.current.wickets += 1;

  let outType = dismissedPlayerType;
  if (outType !== "striker" && outType !== "nonStriker") {
    outType =
      dismissedBatter && dismissedBatter === match.current.nonStriker?.name
        ? "nonStriker"
        : "striker";
  }

  const resolvedDismissed =
    dismissedBatter ||
    (outType === "nonStriker"
      ? match.current.nonStriker?.name
      : match.current.striker?.name);

  if (resolvedDismissed) {
    // RISK: joker has TWO playerStats entries (one per team)
    // When joker is dismissed, BOTH entries must be marked isOut
    // Otherwise their other-team entry still appears as available batter
    // For dismissal, mark BOTH entries isOut (existing behavior)
    // but also ensure dismissalType goes to batting team entry only
    const battingTeam = match.current.battingTeam;
    const allEntries = match.playerStats.filter(
      (p) => p.name === resolvedDismissed,
    );
    // Find the batting team entry specifically for dismissalType
    const battingEntry = match.playerStats.find(
      (p) => p.name === resolvedDismissed && p.team === battingTeam,
    );

    allEntries.forEach((entry) => {
      entry.isOut = true;
      if (!entry.batting) entry.batting = {};
      if (entry.team === battingTeam) {
        entry.batting.dismissalType = wicketType || "";
      }
    });
  }

  if (outType === "nonStriker") {
    match.current.nonStriker = { name: null, playerId: null };
  } else {
    match.current.striker = { name: null, playerId: null };
  }

  match.current.nextBatterFor = outType;

  return {
    dismissedBatter: resolvedDismissed,
    dismissedPlayerType: outType,
    nextBatterFor: outType,
  };
}

// ─── handleWicketInningsCompletion ────────────────────────────────────────────
async function handleWicketInningsCompletion(match, matchId, io, options = {}) {
  const { suppressStateEmit = false } = options;
  const battingTeamPlayers = (match.playerStats || []).filter(
    (p) => p.team === match.current.battingTeam,
  );
  const notOutAndBatted = battingTeamPlayers.filter(
    (p) => p.didBat && !p.isOut,
  ).length;
  const availableToBat = battingTeamPlayers.filter(
    (p) => !p.didBat && !p.isOut,
  ).length;
  const battingTeamSize =
    battingTeamPlayers.length || getBattingTeamSize(match);

  const availableBatters = getAvailableBatters(match);
  // RISK PREVENTION: isBenched players count as available (isOut=false, not
  // at crease) — they can return to bat, so innings must NOT end while any
  // benched player exists
  const inningsCanEnd = availableBatters.length === 0;
  if (!inningsCanEnd) return "none";

  const inningsNumber = getCurrentInningsNumber(match);
  const battingTeamName =
    match.current.battingTeam === "team1" ? match.team1.name : match.team2.name;

  const completedInnings = {
    matchId,
    battingTeam: battingTeamName,
    score: match.current.runs,
    wickets: match.current.wickets,
    overs: match.current.oversBowled,
  };

  if (inningsNumber === 1) {
    const secondInningsState = startSecondInnings(match);
    await match.save();
    io.to(matchId).emit("innings_complete", {
      ...completedInnings,
      nextBattingTeam: secondInningsState.battingTeam,
      targetScore: secondInningsState.targetScore,
      firstInningsScore: secondInningsState.firstInningsScore,
    });
    if (!suppressStateEmit) emitMatchState(io.to(matchId), match);
    // Trigger innings break drawer on frontend
    // Same as over break but with opener selection required
    io.to(matchId).emit("inningsBreakStarted", {
      matchId,
      nextBattingTeam: secondInningsState.battingTeam,
      targetScore: secondInningsState.targetScore,
      firstInningsScore: secondInningsState.firstInningsScore,
    });
    return "innings_complete";
  }

  // Innings 2 — check if match is over
  const firstInningsScore = match.innings1?.score || 0;
  const chasingTeamSize = getBattingTeamSize(match);
  const evaluation = checkMatchEnd(
    {
      teamAScore: firstInningsScore,
      teamBScore: match.current.runs,
      teamBWickets: match.current.wickets,
      teamBPlayersCount: chasingTeamSize,
      totalValidBalls: match.current.ballsBowled || 0,
      totalOvers: match.totalOvers,
    },
    match.team1.name,
    match.team2.name,
  );

  const resultMessage = evaluation.isMatchOver
    ? evaluation.resultMessage
    : match.current.runs < firstInningsScore
      ? `${match.team1.name} won by ${firstInningsScore - match.current.runs} runs`
      : match.current.runs === firstInningsScore
        ? "Match Tied"
        : `${match.team2.name} won by ${Math.max(0, chasingTeamSize - 1 - match.current.wickets)} wickets`;

  await match.save();
  const completed = await completeMatchWithStats({
    matchId,
    resultMessage,
    io,
  });
  return completed ? "match_complete" : "none";
}

// ─── finalizeSecondInningsIfMatchEnded ────────────────────────────────────────
async function finalizeSecondInningsIfMatchEnded(
  match,
  matchId,
  io,
  totalValidBalls,
) {
  if (getCurrentInningsNumber(match) !== 2) return "none";

  const evaluation = checkMatchEnd(
    {
      teamAScore: match.innings1?.score || 0,
      teamBScore: match.current.runs,
      teamBWickets: match.current.wickets,
      teamBPlayersCount: getBattingTeamSize(match),
      totalValidBalls,
      totalOvers: match.totalOvers,
    },
    match.team1.name,
    match.team2.name,
  );

  if (!evaluation.isMatchOver) return "none";

  await match.save();
  const completed = await completeMatchWithStats({
    matchId,
    resultMessage: evaluation.resultMessage,
    io,
  });
  return completed ? "match_complete" : "none";
}

// ─── handleMaxOversTransition ─────────────────────────────────────────────────
async function handleMaxOversTransition(
  match,
  matchId,
  io,
  totalValidBalls,
  options = {},
) {
  const { suppressStateEmit = false } = options;
  const maxOvers = Number(match.totalOvers) || 0;
  if (maxOvers <= 0 || totalValidBalls % 6 !== 0) return "none";

  const completedOvers = Math.floor(totalValidBalls / 6);
  if (completedOvers !== maxOvers) return "none";

  const inningsNumber = getCurrentInningsNumber(match);
  const battingTeamName =
    match.current.battingTeam === "team1" ? match.team1.name : match.team2.name;

  if (inningsNumber === 1) {
    const completedInnings = {
      matchId,
      battingTeam: battingTeamName,
      score: match.current.runs,
      wickets: match.current.wickets,
      overs: match.current.oversBowled,
    };
    const secondInningsState = startSecondInnings(match);
    await match.save();
    io.to(matchId).emit("innings_complete", {
      ...completedInnings,
      nextBattingTeam: secondInningsState.battingTeam,
      targetScore: secondInningsState.targetScore,
      firstInningsScore: secondInningsState.firstInningsScore,
    });
    if (!suppressStateEmit) emitMatchState(io.to(matchId), match);
    // Trigger innings break drawer on frontend
    // Same as over break but with opener selection required
    io.to(matchId).emit("inningsBreakStarted", {
      matchId,
      nextBattingTeam: secondInningsState.battingTeam,
      targetScore: secondInningsState.targetScore,
      firstInningsScore: secondInningsState.firstInningsScore,
    });
    match.current.overBreakPending = false; // innings complete, not an over break
    return "innings_complete";
  }

  if (inningsNumber === 2) {
    const evaluation = checkMatchEnd(
      {
        teamAScore: match.innings1?.score || 0,
        teamBScore: match.current.runs,
        teamBWickets: match.current.wickets,
        teamBPlayersCount: getBattingTeamSize(match),
        totalValidBalls,
        totalOvers: maxOvers,
      },
      match.team1.name,
      match.team2.name,
    );
    if (!evaluation.isMatchOver) {
      match.current.overBreakPending = true;
      await match.save();
      if (!suppressStateEmit) emitMatchState(io.to(matchId), match);
      // RISK: overBreakPending is set to true here and cleared only in overBreakCommit.
      // If two clients call overBreakCommit simultaneously, the first one clears the
      // flag and the second one hits the guard at the top of the handler and is rejected.
      io.to(matchId).emit("overBreakStarted", { matchId });
      return "over_break";
    }
    await match.save();
    const completed = await completeMatchWithStats({
      matchId,
      resultMessage: evaluation.resultMessage,
      io,
    });
    return completed ? "match_complete" : "none";
  }

  return "none";
}

// ─── setupSockets ─────────────────────────────────────────────────────────────
function setupSockets(io) {
  io.on("connection", (socket) => {
    // ── joinMatch ──────────────────────────────────────────────────────────
    socket.on("joinMatch", async ({ matchId }) => {
      const match = await Match.findById(matchId).lean();
      if (match) {
        const isMember = await assertGroupMember(match, socket.user?.userId);
        if (!isMember) {
          socket.emit("matchError", {
            message: "You are not a member of this group",
          });
          return;
        }

        socket.join(matchId);
        emitMatchState(socket, match);
        emitFullMatchState(socket, match);
      }
    });

    socket.on("join_match", async (matchId) => {
      const match = await Match.findById(matchId).lean();
      if (match) {
        const isMember = await assertGroupMember(match, socket.user?.userId);
        if (!isMember) {
          socket.emit("matchError", {
            message: "You are not a member of this group",
          });
          return;
        }

        socket.join(matchId);
        emitMatchState(socket, match);
        emitFullMatchState(socket, match);
      }
    });

    socket.on("joinGroup", ({ groupId }) => {
      if (!groupId) return;
      // Leave any previously joined group rooms first
      const rooms = [...socket.rooms];
      rooms.forEach((room) => {
        if (room.startsWith("group:")) socket.leave(room);
      });
      socket.join(`group:${groupId}`);
    });

    // ── toss events ────────────────────────────────────────────────────────
    socket.on("toss_flip_started", async ({ matchId }) => {
      try {
        if (!matchId) return;

        const match = await Match.findById(matchId).lean();
        if (!match) {
          socket.emit("matchError", { message: "Match not found" });
          return;
        }

        const isMember = await assertGroupMember(match, socket.user?.userId);
        if (!isMember) {
          socket.emit("matchError", {
            message: "You are not a member of this group",
          });
          return;
        }

        io.to(matchId).emit("toss_flip_started");
      } catch (error) {
        console.error("Error handling toss_flip_started:", error);
        socket.emit("matchError", {
          message: "Failed to broadcast toss event",
        });
      }
    });

    socket.on("toss_flip_result", async ({ matchId, result, winner }) => {
      try {
        if (!matchId) return;

        const match = await Match.findById(matchId).lean();
        if (!match) {
          socket.emit("matchError", { message: "Match not found" });
          return;
        }

        const isMember = await assertGroupMember(match, socket.user?.userId);
        if (!isMember) {
          socket.emit("matchError", {
            message: "You are not a member of this group",
          });
          return;
        }

        io.to(matchId).emit("toss_flip_result", { result, winner });
      } catch (error) {
        console.error("Error handling toss_flip_result:", error);
        socket.emit("matchError", {
          message: "Failed to broadcast toss event",
        });
      }
    });

    socket.on("tossResult", async ({ matchId, tossWinner, tossChoice }) => {
      try {
        const match = await Match.findById(matchId);
        if (!match) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(match, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        // tossWinner is a team name string ("Team A" etc.)
        // Map it to "team1" | "team2"
        const winnerKey = tossWinner === match.team1.name ? "team1" : "team2";
        const choiceLower = (tossChoice || "").toLowerCase(); // "bat" | "bowl"

        match.toss.winner = winnerKey;
        match.toss.choice = choiceLower;

        // Determine who bats first
        if (choiceLower === "bat") {
          match.current.battingTeam = winnerKey;
        } else {
          match.current.battingTeam = winnerKey === "team1" ? "team2" : "team1";
        }

        match.status = "innings";
        await match.save();
        emitMatchState(io.to(matchId), match);
      } catch (error) {
        console.error("Error handling tossResult:", error);
        socket.emit("matchError", {
          message: "Failed to save toss result. Please try again.",
        });
      }
    });

    // ── setOpeners ─────────────────────────────────────────────────────────
    socket.on(
      "setOpeners",
      async ({ matchId, striker, nonStriker, bowler }) => {
        try {
          const match = await Match.findById(matchId);
          if (!match) return;

          const userId = socket.user?.userId;
          const isMember = await assertGroupMember(match, userId);
          if (!isMember) {
            socket.emit("matchError", { message: "Unauthorized" });
            return;
          }

          // RISK: joker has two entries — find by name AND
          // current batting team to get correct innings entry
          const battingTeamKey = match.current.battingTeam;
          const bowlingTeamKey = battingTeamKey === "team1" ? "team2" : "team1";

          const findBattingEntry = (name) =>
            match.playerStats.find(
              (p) => p.name === name && p.team === battingTeamKey,
            ) || match.playerStats.find((p) => p.name === name);

          const findBowlingEntry = (name) =>
            match.playerStats.find(
              (p) => p.name === name && p.team === bowlingTeamKey,
            ) || match.playerStats.find((p) => p.name === name);

          const strikerEntry = findBattingEntry(striker);
          const nonStrikerEntry = findBattingEntry(nonStriker);
          const bowlerEntry = findBowlingEntry(bowler);

          match.current.striker = {
            name: striker,
            playerId: strikerEntry?.playerId || null,
          };
          match.current.nonStriker = {
            name: nonStriker,
            playerId: nonStrikerEntry?.playerId || null,
          };
          match.current.bowler = {
            name: bowler,
            playerId: bowlerEntry?.playerId || null,
          };
          match.current.nextBatterFor = null;
          match.status = "live";

          // RISK: only mark didBat on the BATTING team entry
          // Only mark didBowl on the BOWLING team entry
          // For jokers, the wrong entry getting didBat=true
          // causes innings2BattingRows to filter incorrectly
          match.playerStats.forEach((ps) => {
            if (
              (ps.name === striker || ps.name === nonStriker) &&
              ps.team === battingTeamKey
            ) {
              ps.didBat = true;
            }
            if (ps.name === bowler && ps.team === bowlingTeamKey) {
              ps.didBowl = true;
            }
          });

          await match.save();
          emitMatchState(io.to(matchId), match);
        } catch (error) {
          console.error("Error handling setOpeners:", error);
        }
      },
    );

    // ── setNewBatter ───────────────────────────────────────────────────────
    socket.on("setNewBatter", async ({ matchId, batter }) => {
      try {
        const match = await Match.findById(matchId);
        if (!match) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(match, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        // RISK: joker has TWO playerStats entries — one per team
        // find() returns the first match which may be the wrong team entry
        // Must find the entry matching the CURRENT batting team
        const battingTeam = match.current.battingTeam; // "team1" | "team2"

        const batterEntry =
          match.playerStats.find(
            (p) => p.name === batter && p.team === battingTeam,
          ) ||
          match.playerStats.find(
            // Fallback for non-joker players (only one entry, team always matches)
            (p) => p.name === batter,
          );

        // RISK: if batterEntry not found (edge case), still set name
        // null playerId is acceptable — name is the display key
        const batterObj = {
          name: batter,
          playerId: batterEntry?.playerId ?? null,
        };

        // RISK: if no entry found at all, create a minimal one
        // This handles edge cases where player was added mid-match
        // and their stats entry wasn't created properly
        if (!batterEntry) {
          console.warn(`No playerStats entry found for ${batter} 
      in team ${battingTeam} — creating minimal entry`);
          match.playerStats.push({
            playerId: null,
            name: batter,
            team: battingTeam,
            didBat: true,
            didBowl: false,
            isOut: false,
            isJoker: false,
            isBenched: false,
            skipCareerStats: false,
            batting: {
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              dismissalType: "",
            },
            bowling: {
              overs: 0,
              balls: 0,
              runs: 0,
              wickets: 0,
              wides: 0,
              noBalls: 0,
            },
          });
        }

        // RISK: must use nextBatterFor to place batter at correct end
        // bench sets nextBatterFor = "nonStriker" when non-striker benched
        // wicket sets nextBatterFor = "striker" when striker is out
        // ignoring this causes replacements to always go to striker end
        const position = match.current.nextBatterFor;

        if (position === "nonStriker") {
          match.current.nonStriker = batterObj;
        } else if (position === "striker") {
          match.current.striker = batterObj;
        } else if (!match.current.striker?.name) {
          match.current.striker = batterObj;
        } else if (!match.current.nonStriker?.name) {
          match.current.nonStriker = batterObj;
        } else {
          match.current.striker = batterObj;
        }

        // Mark player as having batted
        if (batterEntry) batterEntry.didBat = true;

        // RISK: if returning benched player, clear their bench flag
        if (batterEntry && batterEntry.isBenched) {
          batterEntry.isBenched = false;
          match.current.benchedPlayers = (
            match.current.benchedPlayers || []
          ).filter((n) => n !== batter);
          match.markModified("current");
        }

        if (match.current.striker?.name && match.current.nonStriker?.name) {
          match.current.nextBatterFor = null;
          if (match.status === "innings") match.status = "live";
          // RISK: force Mongoose to detect nested object change
          match.markModified("current");
        } else if (!match.current.striker?.name) {
          match.current.nextBatterFor = "striker";
          match.markModified("current");
        } else if (!match.current.nonStriker?.name) {
          match.current.nextBatterFor = "nonStriker";
          match.markModified("current");
        }

        await match.save();
        emitMatchState(io.to(matchId), match);
      } catch (error) {
        console.error("Error handling setNewBatter:", error);
      }
    });

    // ── setNewBowler ───────────────────────────────────────────────────────
    socket.on("setNewBowler", async ({ matchId, bowler }) => {
      try {
        const match = await Match.findById(matchId);
        if (!match) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(match, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        const bowlingTeam =
          match.current.battingTeam === "team1" ? "team2" : "team1";

        const bowlerEntry =
          match.playerStats.find(
            (p) => p.name === bowler && p.team === bowlingTeam,
          ) ?? match.playerStats.find((p) => p.name === bowler);
        match.current.bowler = {
          name: bowler,
          playerId: bowlerEntry?.playerId || null,
        };
        if (bowlerEntry) bowlerEntry.didBowl = true;

        await match.save();
        emitMatchState(io.to(matchId), match);
      } catch (error) {
        console.error("Error handling setNewBowler:", error);
      }
    });

    // ── swapStriker ────────────────────────────────────────────────────────
    socket.on("swapStriker", async ({ matchId }) => {
      try {
        const match = await Match.findById(matchId);
        if (!match) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(match, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        const strikerSnapshot = {
          name: match.current.striker?.name || null,
          playerId: match.current.striker?.playerId || null,
        };
        const nonStrikerSnapshot = {
          name: match.current.nonStriker?.name || null,
          playerId: match.current.nonStriker?.playerId || null,
        };

        match.current.striker = nonStrikerSnapshot;
        match.current.nonStriker = strikerSnapshot;
        match.markModified("current");
        await match.save();
        emitMatchState(io.to(matchId), match);
      } catch (error) {
        console.error("Error handling swapStriker:", error);
      }
    });

    socket.on("benchBatter", async ({ matchId, batterName }) => {
      try {
        const authMatch = await Match.findById(matchId);
        if (!authMatch) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(authMatch, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        const savedMatch = await saveWithRetry(matchId, async (match) => {
          // RISK: only allow benching if match is live
          if (match.status !== "live" && match.status !== "innings") {
            throw new ValidationError("Cannot bench: match not in play");
          }

          const striker = match.current.striker?.name;
          const nonStriker = match.current.nonStriker?.name;

          // RISK: batterName must be striker or nonStriker — cannot bench someone
          // not at the crease
          if (batterName !== striker && batterName !== nonStriker) {
            throw new ValidationError("Player is not currently at crease");
          }

          // RISK: block bench if no available replacements exist
          const available = getAvailableBatters(match);
          if (available.length === 0) {
            throw new ValidationError(
              "Cannot bench: no available replacement batters",
            );
          }

          const battingTeam = match.current.battingTeam; // "team1" | "team2"

          // RISK: joker has two entries — find batting team entry specifically
          // battingTeam is always a KEY ("team1"/"team2") in match.current
          const ps =
            match.playerStats.find(
              (p) => p.name === batterName && p.team === battingTeam,
            ) || match.playerStats.find((p) => p.name === batterName);
          if (!ps) {
            throw new ValidationError("Player stats not found");
          }

          // RISK: already benched guard
          if (ps.isBenched) {
            throw new ValidationError("Player is already benched");
          }

          // Apply bench
          ps.isBenched = true;
          // Do NOT set isOut — benched player remains eligible to return

          // Clear the crease position and set nextBatterFor
          if (batterName === striker) {
            match.current.striker = { name: null, playerId: null };
            match.current.nextBatterFor = "striker";
          } else {
            match.current.nonStriker = { name: null, playerId: null };
            match.current.nextBatterFor = "nonStriker";
          }

          // RISK: if both striker and nonStriker are now null after this bench,
          // set nextBatterFor to "striker" as priority
          if (!match.current.striker?.name && !match.current.nonStriker?.name) {
            match.current.nextBatterFor = "striker";
          }

          // Sync denormalized benchedPlayers list
          if (!match.current.benchedPlayers) match.current.benchedPlayers = [];
          if (!match.current.benchedPlayers.includes(batterName)) {
            match.current.benchedPlayers.push(batterName);
          }

          // Pause match status to wait for new batter — same as wicket
          match.status = "innings";
          match.markModified("current");
          match.markModified("playerStats");
        });

        if (savedMatch) emitMatchState(io.to(matchId), savedMatch);
      } catch (error) {
        if (error.name === "ValidationError") {
          socket.emit("matchError", { message: error.message });
          return;
        }
        console.error("Error handling benchBatter:", error);
        socket.emit("matchError", { message: "Failed to bench player" });
      }
    });

    socket.on(
      "benchAndReplace",
      async ({ matchId, batterName, replacementName }) => {
        try {
          const match = await Match.findById(matchId);
          if (!match) return;

          const userId = socket.user?.userId;
          const isMember = await assertGroupMember(match, userId);
          if (!isMember) {
            socket.emit("matchError", { message: "Unauthorized" });
            return;
          }

          if (match.status !== "live" && match.status !== "innings") {
            socket.emit("matchError", { message: "Match not in play" });
            return;
          }

          const striker = match.current.striker?.name;
          const nonStriker = match.current.nonStriker?.name;

          // Validate batterName is at crease
          if (batterName !== striker && batterName !== nonStriker) {
            socket.emit("matchError", {
              message: "Player is not at crease",
            });
            return;
          }

          const battingTeam = match.current.battingTeam;

          // ── STEP 1: Bench the batter ──────────────────────────────────
          const benchedPs =
            match.playerStats.find(
              (p) => p.name === batterName && p.team === battingTeam,
            ) || match.playerStats.find((p) => p.name === batterName);

          if (!benchedPs) {
            socket.emit("matchError", { message: "Benched player not found" });
            return;
          }

          // RISK: check available replacements before benching
          const available = getAvailableBatters(match);
          if (available.length === 0) {
            socket.emit("matchError", {
              message: "No available replacements",
            });
            return;
          }

          benchedPs.isBenched = true;

          // Determine which position is being vacated
          const vacatedPosition =
            batterName === striker ? "striker" : "nonStriker";

          // Clear the crease position
          if (vacatedPosition === "striker") {
            match.current.striker = { name: null, playerId: null };
          } else {
            match.current.nonStriker = { name: null, playerId: null };
          }

          // Update benched players list
          if (!match.current.benchedPlayers) match.current.benchedPlayers = [];
          if (!match.current.benchedPlayers.includes(batterName)) {
            match.current.benchedPlayers.push(batterName);
          }

          // ── STEP 2: Place replacement at vacated position ─────────────
          // RISK: joker has two entries — find batting team entry
          const replacementPs =
            match.playerStats.find(
              (p) => p.name === replacementName && p.team === battingTeam,
            ) || match.playerStats.find((p) => p.name === replacementName);

          if (!replacementPs) {
            socket.emit("matchError", {
              message: "Replacement player not found",
            });
            return;
          }

          if (replacementPs.isOut) {
            socket.emit("matchError", {
              message: "Cannot bring back a dismissed player",
            });
            return;
          }

          if (replacementPs.isBenched && replacementPs.name !== batterName) {
            socket.emit("matchError", {
              message: "This player is already benched",
            });
            return;
          }

          const replacementObj = {
            name: replacementName,
            playerId: replacementPs?.playerId ?? null,
          };

          // Place at the SAME position that was vacated
          // RISK: this is atomic — no race condition possible
          if (vacatedPosition === "striker") {
            match.current.striker = replacementObj;
          } else {
            match.current.nonStriker = replacementObj;
          }

          // Mark replacement as having batted
          if (replacementPs) {
            replacementPs.didBat = true;
            // If returning from bench, clear bench flag
            if (replacementPs.isBenched) {
              replacementPs.isBenched = false;
              match.current.benchedPlayers = (
                match.current.benchedPlayers || []
              ).filter((n) => n !== replacementName);
            }
          }

          // Clear nextBatterFor — both positions handled atomically
          match.current.nextBatterFor = null;
          match.markModified("current");

          // Keep match live
          if (match.status === "innings") match.status = "live";

          match.markModified("current");
          match.markModified("playerStats");
          await match.save();
          emitMatchState(io.to(matchId), match);
        } catch (error) {
          console.error("Error handling benchAndReplace:", error);
          socket.emit("matchError", { message: "Bench and replace failed" });
        }
      },
    );

    socket.on("overBreakCommit", async ({ matchId, payload }) => {
      // payload shape:
      // {
      //   newBowler: string (REQUIRED),
      //   newTotalOvers: number | null,
      //   addPlayers: [{ name, photoUrl, fromPool, playerId }] | null,
      //   reshuffles: [{ playerName, toTeam }] | null,
      //   setJokers: [{ playerName }] | null,
      //   dissolveJokers: [{ playerName, permanentTeam }] | null,
      // }

      try {
        const userId = socket.user?.userId;
        const savedMatch = await saveWithRetry(matchId, async (match) => {
          const isMember = await assertGroupMember(match, userId);
          if (!isMember) {
            socket.emit("matchError", { message: "Unauthorized" });
            return;
          }

          // RISK: double-commit guard — only process if overBreakPending is true
          if (!match.current.overBreakPending) {
            socket.emit("matchError", {
              message: "No over break is currently pending",
            });
            return;
          }

          // RISK: innings must still be in a breakable state
          if (
            match.status === "completed" ||
            match.status === "innings_complete"
          ) {
            socket.emit("matchError", {
              message: "Cannot commit over break: innings over",
            });
            return;
          }

          const {
            newBowler,
            newTotalOvers,
            addPlayers,
            reshuffles,
            setJokers,
            dissolveJokers,
          } = payload || {};

          // --- MANDATORY: bowler selection ---
          if (!newBowler) {
            socket.emit("matchError", {
              message: "Bowler selection is required",
            });
            return;
          }
          const bowlingTeam =
            match.current.battingTeam === "team1" ? "team2" : "team1";
          // RISK: benched player must not be selected as bowler
          const bowlerPs =
            match.playerStats.find(
              (p) => p.name === newBowler && p.team === bowlingTeam,
            ) ?? match.playerStats.find((p) => p.name === newBowler);
          if (bowlerPs?.isBenched) {
            socket.emit("matchError", {
              message: "Benched player cannot bowl",
            });
            return;
          }
          match.current.bowler = {
            name: newBowler,
            playerId: bowlerPs?.playerId || null,
          };
          if (bowlerPs) bowlerPs.didBowl = true;

          // --- OPTIONAL: change total overs ---
          if (newTotalOvers != null) {
            const completedOvers = Math.floor(
              (match.current.ballsBowled || 0) / 6,
            );
            const floor = completedOvers + 1;
            // RISK: hard floor — cannot reduce below completed overs + 1
            if (newTotalOvers < floor) {
              socket.emit("matchError", {
                message: `Total overs cannot be less than ${floor} (current completed: ${completedOvers})`,
              });
              return;
            }
            match.totalOvers = newTotalOvers;
          }

          // --- OPTIONAL: add players ---
          if (addPlayers && addPlayers.length > 0) {
            const Player = require("../models/Player");
            for (const ap of addPlayers) {
              let playerId = ap.playerId || null;
              if (!ap.fromPool || !playerId) {
                // Create new player globally
                const newPlayerName = ap.name.trim();
                const newPlayer = await Player.create({
                  name: newPlayerName,
                  photoUrl: ap.photoUrl?.trim() || "",
                });
                playerId = newPlayer._id;
                await GroupPlayerStats.updateOne(
                  {
                    playerId: null,
                    name: newPlayerName,
                    groupId: match.groupId,
                  },
                  {
                    $setOnInsert: {
                      playerId: null,
                      name: newPlayerName,
                      groupId: match.groupId,
                      batting: {},
                      bowling: {},
                    },
                  },
                  { upsert: true },
                );
                // Add to group pool
                await Group.findByIdAndUpdate(match.groupId, {
                  $addToSet: { playerPool: playerId },
                });
              }
              const team = ap.toTeam || "team1";
              const snapshot = {
                playerId,
                name: ap.name.trim(),
                photoUrl: ap.photoUrl || "",
              };
              // Add to team snapshot
              if (team === "team1") match.team1.players.push(snapshot);
              else match.team2.players.push(snapshot);
              // Add to playerStats
              // RISK: prevent duplicate playerStats entry
              const alreadyExists = match.playerStats.some(
                (p) =>
                  p.playerId?.toString() === playerId?.toString() &&
                  p.team === team,
              );
              if (!alreadyExists) {
                match.playerStats.push({
                  playerId,
                  name: ap.name.trim(),
                  team,
                  isJoker: false,
                  isBenched: false,
                  skipCareerStats: false,
                });
              }
            }
            match.markModified("team1");
            match.markModified("team2");
          }

          // --- OPTIONAL: reshuffles ---
          if (reshuffles && reshuffles.length > 0) {
            for (const r of reshuffles) {
              const ps = match.playerStats.find((p) => p.name === r.playerName);
              if (!ps) continue;
              // RISK: do not reshuffle currently batting or bowling player mid-over
              // (over break means over is done — crease is empty — safe to reshuffle)
              // RISK: frontend sends team name string, backend stores key
              const toTeamKey =
                r.toTeam === match.team1.name ? "team1" : "team2";
              ps.team = toTeamKey;
              // Move snapshot between team arrays
              ["team1", "team2"].forEach((t) => {
                const arr = match[t].players;
                const idx = arr.findIndex((p) => p.name === r.playerName);
                if (idx !== -1) arr.splice(idx, 1);
              });
              const snap = {
                name: r.playerName,
                playerId: ps.playerId,
                photoUrl: "",
              };
              match[toTeamKey].players.push(snap);
            }
            match.markModified("team1");
            match.markModified("team2");
            match.markModified("playerStats");
          }

          // --- OPTIONAL: set jokers ---
          if (setJokers && setJokers.length > 0) {
            for (const sj of setJokers) {
              // Find existing entry
              const existing = match.playerStats.find(
                (p) => p.name === sj.playerName,
              );
              if (!existing) continue;
              existing.isJoker = true;
              // Create second entry for the other team if not exists
              const otherTeam = existing.team === "team1" ? "team2" : "team1";
              const otherExists = match.playerStats.find(
                (p) => p.name === sj.playerName && p.team === otherTeam,
              );
              if (!otherExists) {
                match.playerStats.push({
                  playerId: existing.playerId,
                  name: existing.name,
                  team: otherTeam,
                  isJoker: true,
                  isBenched: false,
                  skipCareerStats: false,
                });
                // Add snapshot to other team
                const snap = {
                  name: existing.name,
                  playerId: existing.playerId,
                  photoUrl: "",
                };
                match[otherTeam].players.push(snap);
                match.markModified(otherTeam);
              }
            }
            match.markModified("playerStats");
          }

          // --- OPTIONAL: dissolve jokers ---
          if (dissolveJokers && dissolveJokers.length > 0) {
            for (const dj of dissolveJokers) {
              // permanentTeam is a name string e.g. "Team 1"
              // Convert to key for internal storage
              const permanentTeamKey =
                dj.permanentTeam === match.team1.name ? "team1" : "team2";
              const otherTeamKey =
                permanentTeamKey === "team1" ? "team2" : "team1";

              // STEP 1: Update playerStats entries
              const entries = match.playerStats.filter(
                (p) => p.name === dj.playerName && p.isJoker,
              );

              for (const entry of entries) {
                if (entry.team === permanentTeamKey) {
                  // This entry becomes permanent — keep stats, clear joker flag
                  entry.isJoker = false;
                  entry.skipCareerStats = false;
                } else {
                  // RISK: remove the other-team entry entirely from playerStats
                  // so joker no longer appears in that team's roster/batting/bowling
                  // Mark for removal below (cannot splice inside forEach safely)
                  entry._dissolve = true;
                }
              }

              // STEP 2: Remove dissolved entry from playerStats array
              const beforeCount = match.playerStats.length;
              match.playerStats = match.playerStats.filter(
                (p) => !(p.name === dj.playerName && p._dissolve === true),
              );
              // STEP 3: Remove joker snapshot from the other team's
              // players array so they no longer appear in that team's roster
              const otherTeamPlayers = match[otherTeamKey].players;
              const snapIdx = otherTeamPlayers.findIndex(
                (p) => p.name === dj.playerName,
              );
              if (snapIdx !== -1) {
                otherTeamPlayers.splice(snapIdx, 1);
                match.markModified(otherTeamKey);
              }

              // STEP 4: Ensure joker remains in permanent team snapshot
              // (they should already be there — just verify)
              const permanentTeamPlayers = match[permanentTeamKey].players;
              const existsInPermanent = permanentTeamPlayers.some(
                (p) => p.name === dj.playerName,
              );
              if (!existsInPermanent) {
                // Re-add if somehow missing
                const jokerEntry = match.playerStats.find(
                  (p) => p.name === dj.playerName,
                );
                if (jokerEntry) {
                  permanentTeamPlayers.push({
                    name: jokerEntry.name,
                    playerId: jokerEntry.playerId,
                    photoUrl: "",
                  });
                  match.markModified(permanentTeamKey);
                }
              }
            }
            match.markModified("playerStats");
          }

          // --- Clear over break flag and reset bowler-change state ---
          match.current.overBreakPending = false;
          match.markModified("current");
        });

        if (savedMatch) emitMatchState(io.to(matchId), savedMatch);
      } catch (error) {
        console.error("Error handling overBreakCommit:", error);
        const isVersionError =
          error.name === "VersionError" ||
          error.message?.includes("No matching document found");
        if (isVersionError) {
          socket.emit("matchError", {
            message:
              "Over break commit failed after retries. Please try again.",
          });
          return;
        }
        socket.emit("matchError", { message: "Over break commit failed" });
      }
    });

    // ── delivery (main ball event) ─────────────────────────────────────────
    socket.on("delivery", async (deliveryPayload) => {
      const { matchId } = deliveryPayload;
      try {
        const authMatch = await Match.findById(matchId);
        if (!authMatch) {
          socket.emit("error", { message: "Match not found" });
          return;
        }

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(authMatch, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        let wicketTransition = "none";
        let maxOversTransition = "none";
        let secondInningsTransition = "none";

        const savedMatch = await saveWithRetry(matchId, async (match) => {
          const {
            runs,
            extraType,
            extraRuns,
            isWicket,
            wicketType,
            dismissedBatter,
            dismissedPlayerType,
          } = deliveryPayload;

          const normalizedExtraType =
            extraType === "noBall" ? "no-ball" : extraType || "none";
          const isValidBall = isValidBallType(normalizedExtraType);
          const originalNonStriker = match.current.nonStriker?.name;

          const entry = {
            runsOffBat: Number(runs) || 0,
            extraType: normalizedExtraType,
            extraRuns: Number(extraRuns) || 0,
            isWicket: Boolean(isWicket),
            wicketType: isWicket && wicketType ? wicketType : "none",
            batterDismissed: isWicket && dismissedBatter ? dismissedBatter : "",
            striker: match.current.striker?.name || "",
            nonStriker: match.current.nonStriker?.name || "",
            bowler: match.current.bowler?.name || "",
          };

          match.timeline.push(entry);
          match.current.runs += entry.runsOffBat + entry.extraRuns;

          // ── Update batter stats ──────────────────────────────────────────
          if (match.current.striker?.name) {
            const battingTeam = match.current.battingTeam;
            const strikerPs =
              match.playerStats.find(
                (p) =>
                  p.name === match.current.striker.name &&
                  p.team === battingTeam,
              ) ||
              match.playerStats.find(
                (p) => p.name === match.current.striker.name,
              );
            if (strikerPs) {
              if (!strikerPs.batting) strikerPs.batting = {};
              if (normalizedExtraType !== "wide") {
                strikerPs.batting.runs =
                  (strikerPs.batting.runs || 0) + entry.runsOffBat;
                if (entry.runsOffBat === 4)
                  strikerPs.batting.fours = (strikerPs.batting.fours || 0) + 1;
                if (entry.runsOffBat === 6)
                  strikerPs.batting.sixes = (strikerPs.batting.sixes || 0) + 1;
              }
              if (isValidBall)
                strikerPs.batting.balls = (strikerPs.batting.balls || 0) + 1;
            }
          }

          // ── Update bowler stats ──────────────────────────────────────────
          if (match.current.bowler?.name) {
            const bowlingTeam =
              match.current.battingTeam === "team1" ? "team2" : "team1";
            const bowlerPs =
              match.playerStats.find(
                (p) =>
                  p.name === match.current.bowler.name &&
                  p.team === bowlingTeam,
              ) ||
              match.playerStats.find(
                (p) => p.name === match.current.bowler.name,
              );
            if (bowlerPs) {
              if (!bowlerPs.bowling) bowlerPs.bowling = {};
              if (isValidBall)
                bowlerPs.bowling.balls = (bowlerPs.bowling.balls || 0) + 1;
              const isByeLike =
                normalizedExtraType === "bye" ||
                normalizedExtraType === "leg-bye";
              if (!isByeLike) {
                bowlerPs.bowling.runs =
                  (bowlerPs.bowling.runs || 0) + entry.runsOffBat;
              }
              if (normalizedExtraType === "wide")
                bowlerPs.bowling.wides = (bowlerPs.bowling.wides || 0) + 1;
              if (normalizedExtraType === "no-ball")
                bowlerPs.bowling.noBalls = (bowlerPs.bowling.noBalls || 0) + 1;
              if (
                normalizedExtraType === "wide" ||
                normalizedExtraType === "no-ball"
              ) {
                bowlerPs.bowling.runs =
                  (bowlerPs.bowling.runs || 0) + entry.extraRuns;
              }
              if (isWicket && wicketType !== "run-out") {
                bowlerPs.bowling.wickets = (bowlerPs.bowling.wickets || 0) + 1;
              }
              // ✅ Recompute overs from total legal balls after every delivery
              const bowlerTotalBalls = bowlerPs.bowling.balls || 0;
              bowlerPs.bowling.overs =
                Math.floor(bowlerTotalBalls / 6) + (bowlerTotalBalls % 6) / 10;
            }
          }

          // ── Wicket ───────────────────────────────────────────────────────
          if (isWicket) {
            const wicketState = applyWicketState(match, {
              dismissedBatter,
              dismissedPlayerType,
              wicketType,
            });
            entry.batterDismissed = wicketState.dismissedBatter || "";
            wicketTransition = await handleWicketInningsCompletion(
              match,
              matchId,
              io,
              { suppressStateEmit: true },
            );
            if (wicketTransition !== "none") return;
            match.status = "innings";
          }

          // ── Valid ball count & overs ─────────────────────────────────────
          let totalValidBalls = match.current.ballsBowled || 0;
          if (isValidBall) totalValidBalls += 1;

          // ── Strike rotation ──────────────────────────────────────────────
          const isRunOut = isWicket && wicketType === "run-out";
          const nonStrikerRunOut =
            isRunOut && dismissedBatter === originalNonStriker;

          if (!isWicket || isRunOut) {
            const runsForRotation =
              normalizedExtraType === "bye" || normalizedExtraType === "leg-bye"
                ? entry.runsOffBat + (entry.extraRuns || 0)
                : entry.runsOffBat;
            let rotates;
            if (nonStrikerRunOut) {
              rotates = runsForRotation % 2 === 1;
            } else {
              rotates = shouldRotateStrike(
                runsForRotation,
                normalizedExtraType,
                totalValidBalls,
              );
            }
            if (rotates) {
              const tmp = { ...match.current.striker };
              match.current.striker = { ...match.current.nonStriker };
              match.current.nonStriker = tmp;
            }
          }

          match.current.oversBowled = calculateOvers(totalValidBalls);
          match.current.ballsBowled = totalValidBalls;

          // ── Over transitions & match end ─────────────────────────────────
          maxOversTransition = await handleMaxOversTransition(
            match,
            matchId,
            io,
            totalValidBalls,
            {
              suppressStateEmit: true,
            },
          );
          if (maxOversTransition !== "none") return;

          secondInningsTransition = await finalizeSecondInningsIfMatchEnded(
            match,
            matchId,
            io,
            totalValidBalls,
          );
          if (secondInningsTransition !== "none") return;

          const justCompletedOver =
            isValidBall && totalValidBalls % 6 === 0 && totalValidBalls > 0;
          if (
            justCompletedOver &&
            match.status !== "innings_complete" &&
            match.status !== "completed"
          ) {
            match.current.overBreakPending = true;
          }
        });

        if (!savedMatch) {
          socket.emit("error", { message: "Match not found" });
          return;
        }

        const isMatchComplete =
          wicketTransition === "match_complete" ||
          maxOversTransition === "match_complete" ||
          secondInningsTransition === "match_complete";

        if (!isMatchComplete) {
          emitMatchState(io.to(matchId), savedMatch);
        }

        // Emit over break if an over just completed and innings continues
        const rawExtraType =
          deliveryPayload.extraType === "noBall"
            ? "no-ball"
            : deliveryPayload.extraType || "none";
        const isValidBallOuter = isValidBallType(rawExtraType);
        const justCompletedOver =
          isValidBallOuter &&
          savedMatch.current.ballsBowled % 6 === 0 &&
          savedMatch.current.ballsBowled > 0;
        if (
          justCompletedOver &&
          savedMatch.status !== "innings_complete" &&
          savedMatch.status !== "completed"
        ) {
          io.to(matchId).emit("overBreakStarted", {
            matchId,
            completedOver: Math.floor(savedMatch.current.ballsBowled / 6),
          });
        }
      } catch (error) {
        console.error("Error handling delivery:", error);
        socket.emit("error", { message: "Failed to record delivery" });
      }
    });

    // ── umpire_update (alternative delivery path) ──────────────────────────
    socket.on("umpire_update", async ({ matchId, deliveryData }) => {
      try {
        const authMatch = await Match.findById(matchId);
        if (!authMatch) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(authMatch, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        let wicketTransition = "none";
        let maxOversTransition = "none";
        let secondInningsTransition = "none";

        const savedMatch = await saveWithRetry(matchId, async (match) => {
          const dismissedBatter =
            deliveryData.dismissedBatter || deliveryData.batterDismissed || "";
          const dismissedPlayerType = deliveryData.dismissedPlayerType;
          const originalNonStriker = match.current.nonStriker?.name;
          const isValidBall = isValidBallType(deliveryData.extraType);

          const enrichedDelivery = {
            ...deliveryData,
            batterDismissed: dismissedBatter,
            striker: match.current.striker?.name || "",
            nonStriker: match.current.nonStriker?.name || "",
            bowler: match.current.bowler?.name || "",
          };
          match.timeline.push(enrichedDelivery);
          match.current.runs +=
            deliveryData.runsOffBat + deliveryData.extraRuns;

          // Batter stats
          if (match.current.striker?.name) {
            const battingTeam = match.current.battingTeam;
            const strikerPs =
              match.playerStats.find(
                (p) =>
                  p.name === match.current.striker.name &&
                  p.team === battingTeam,
              ) ||
              match.playerStats.find(
                (p) => p.name === match.current.striker.name,
              );
            if (strikerPs) {
              if (!strikerPs.batting) strikerPs.batting = {};
              if (deliveryData.extraType !== "wide") {
                strikerPs.batting.runs =
                  (strikerPs.batting.runs || 0) + deliveryData.runsOffBat;
                if (deliveryData.runsOffBat === 4)
                  strikerPs.batting.fours = (strikerPs.batting.fours || 0) + 1;
                if (deliveryData.runsOffBat === 6)
                  strikerPs.batting.sixes = (strikerPs.batting.sixes || 0) + 1;
              }
              if (isValidBall)
                strikerPs.batting.balls = (strikerPs.batting.balls || 0) + 1;
            }
          }

          // Bowler stats (umpire_update path)
          if (match.current.bowler?.name) {
            const bowlingTeam =
              match.current.battingTeam === "team1" ? "team2" : "team1";
            const bowlerPs =
              match.playerStats.find(
                (p) =>
                  p.name === match.current.bowler.name &&
                  p.team === bowlingTeam,
              ) ||
              match.playerStats.find(
                (p) => p.name === match.current.bowler.name,
              );
            if (bowlerPs) {
              if (!bowlerPs.bowling) bowlerPs.bowling = {};
              if (isValidBall)
                bowlerPs.bowling.balls = (bowlerPs.bowling.balls || 0) + 1;
              const isByeLikeU =
                deliveryData.extraType === "bye" ||
                deliveryData.extraType === "leg-bye";
              if (!isByeLikeU) {
                bowlerPs.bowling.runs =
                  (bowlerPs.bowling.runs || 0) + (deliveryData.runsOffBat || 0);
              }
              if (deliveryData.extraType === "wide")
                bowlerPs.bowling.wides = (bowlerPs.bowling.wides || 0) + 1;
              if (deliveryData.extraType === "no-ball")
                bowlerPs.bowling.noBalls = (bowlerPs.bowling.noBalls || 0) + 1;
              if (
                deliveryData.extraType === "wide" ||
                deliveryData.extraType === "no-ball"
              ) {
                bowlerPs.bowling.runs =
                  (bowlerPs.bowling.runs || 0) + (deliveryData.extraRuns || 0);
              }
              if (
                deliveryData.isWicket &&
                deliveryData.wicketType !== "run-out"
              ) {
                bowlerPs.bowling.wickets = (bowlerPs.bowling.wickets || 0) + 1;
              }
              // ✅ Recompute overs from total legal balls
              const uBowlerBalls = bowlerPs.bowling.balls || 0;
              bowlerPs.bowling.overs =
                Math.floor(uBowlerBalls / 6) + (uBowlerBalls % 6) / 10;
              bowlerPs.didBowl = true;
            }
          }

          if (deliveryData.isWicket) {
            const wicketState = applyWicketState(match, {
              dismissedBatter,
              dismissedPlayerType,
              wicketType: deliveryData.wicketType,
            });
            enrichedDelivery.batterDismissed =
              wicketState.dismissedBatter || "";
            wicketTransition = await handleWicketInningsCompletion(
              match,
              matchId,
              io,
              { suppressStateEmit: true },
            );
            if (wicketTransition !== "none") return;
            match.status = "innings";
          }

          let totalValidBalls = match.current.ballsBowled || 0;
          if (isValidBall) totalValidBalls += 1;

          const isRunOut =
            deliveryData.isWicket && deliveryData.wicketType === "run-out";
          const nonStrikerRunOut =
            isRunOut && dismissedBatter === originalNonStriker;

          if (!deliveryData.isWicket || isRunOut) {
            const runsForRotation =
              deliveryData.extraType === "bye" ||
              deliveryData.extraType === "leg-bye"
                ? deliveryData.runsOffBat + (deliveryData.extraRuns || 0)
                : deliveryData.runsOffBat;
            const rotates = nonStrikerRunOut
              ? runsForRotation % 2 === 1
              : shouldRotateStrike(
                  runsForRotation,
                  deliveryData.extraType,
                  totalValidBalls,
                );
            if (rotates) {
              const tmp = { ...match.current.striker };
              match.current.striker = { ...match.current.nonStriker };
              match.current.nonStriker = tmp;
            }
          }

          match.current.oversBowled = calculateOvers(totalValidBalls);
          match.current.ballsBowled = totalValidBalls;

          maxOversTransition = await handleMaxOversTransition(
            match,
            matchId,
            io,
            totalValidBalls,
            {
              suppressStateEmit: true,
            },
          );
          if (maxOversTransition !== "none") return;

          secondInningsTransition = await finalizeSecondInningsIfMatchEnded(
            match,
            matchId,
            io,
            totalValidBalls,
          );
          if (secondInningsTransition !== "none") return;

          const justCompletedOverU =
            isValidBall && totalValidBalls % 6 === 0 && totalValidBalls > 0;
          if (
            justCompletedOverU &&
            match.status !== "innings_complete" &&
            match.status !== "completed"
          ) {
            match.current.overBreakPending = true;
          }
        });

        if (!savedMatch) return;

        const isMatchComplete =
          wicketTransition === "match_complete" ||
          maxOversTransition === "match_complete" ||
          secondInningsTransition === "match_complete";

        if (!isMatchComplete) {
          emitMatchState(io.to(matchId), savedMatch);
        }

        // Emit over break if an over just completed and innings continues
        const isValidBallU = isValidBallType(deliveryData.extraType);
        const justCompletedOverU =
          isValidBallU &&
          savedMatch.current.ballsBowled % 6 === 0 &&
          savedMatch.current.ballsBowled > 0;
        if (
          justCompletedOverU &&
          savedMatch.status !== "innings_complete" &&
          savedMatch.status !== "completed"
        ) {
          io.to(matchId).emit("overBreakStarted", {
            matchId,
            completedOver: Math.floor(savedMatch.current.ballsBowled / 6),
          });
        }
      } catch (error) {
        console.error("Error handling umpire_update:", error);
        socket.emit("matchError", {
          message: "Failed to record delivery. Please try again.",
        });
      }
    });

    // ── complete_match (manual) ────────────────────────────────────────────
    socket.on("complete_match", async ({ matchId }) => {
      try {
        const match = await Match.findById(matchId);
        if (!match) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(match, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }
        await completeMatchWithStats({
          matchId,
          resultMessage: "Match completed",
          io,
        });
      } catch (error) {
        console.error("Error handling complete_match:", error);
        socket.emit("matchError", {
          message: "Failed to complete match. Please try again.",
        });
      }
    });

    // ── undo_delivery ──────────────────────────────────────────────────────
    socket.on("undo_delivery", async ({ matchId }) => {
      try {
        const authMatch = await Match.findById(matchId);
        if (!authMatch || authMatch.timeline.length === 0) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(authMatch, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        const savedMatch = await saveWithRetry(matchId, async (match) => {
          if (match.timeline.length === 0) return;

          const inns1BattingTeam = match.innings1?.battingTeam;
          const inns1BattingSnapshot =
            inns1BattingTeam && match.current.inningsNumber === 2
              ? match.playerStats
                  .filter((ps) => ps.team === inns1BattingTeam)
                  .map((ps) => ({
                    name: ps.name,
                    team: ps.team,
                    runs: ps.batting?.runs || 0,
                    balls: ps.batting?.balls || 0,
                    fours: ps.batting?.fours || 0,
                    sixes: ps.batting?.sixes || 0,
                    isOut: ps.isOut,
                    dismissalType: ps.batting?.dismissalType || "",
                  }))
              : [];

          // Remove last ball
          match.timeline.pop();

          // ── Rebuild current.runs, wickets, balls from remaining timeline ──
          match.current.runs = match.timeline.reduce(
            (sum, d) => sum + (d.runsOffBat || 0) + (d.extraRuns || 0),
            0,
          );
          match.current.wickets = match.timeline.filter(
            (d) => d.isWicket,
          ).length;

          const validBalls = match.timeline.filter((d) =>
            isValidBallType(d.extraType),
          ).length;
          match.current.ballsBowled = validBalls;
          match.current.oversBowled = calculateOvers(validBalls);

          // ── Rebuild all playerStats from scratch ──────────────────────────
          match.playerStats.forEach((ps) => {
            ps.isOut = false;
            ps.didBat = false;
            ps.didBowl = false;
            ps.batting = {
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              dismissalType: "",
            };
            ps.bowling = {
              overs: 0,
              balls: 0,
              runs: 0,
              wickets: 0,
              wides: 0,
              noBalls: 0,
            };
          });

          match.timeline.forEach((delivery) => {
            const battingTeam = match.current.battingTeam;
            const isValid = isValidBallType(delivery.extraType);

            if (delivery.striker) {
              const sp =
                match.playerStats.find(
                  (p) => p.name === delivery.striker && p.team === battingTeam,
                ) || match.playerStats.find((p) => p.name === delivery.striker);
              if (sp) {
                sp.didBat = true;
                if (delivery.extraType !== "wide") {
                  sp.batting.runs += delivery.runsOffBat || 0;
                  if (delivery.runsOffBat === 4) sp.batting.fours += 1;
                  if (delivery.runsOffBat === 6) sp.batting.sixes += 1;
                }
                if (isValid) sp.batting.balls += 1;
              }
            }

            if (delivery.isWicket && delivery.batterDismissed) {
              const dp = match.playerStats.find(
                (p) => p.name === delivery.batterDismissed,
              );
              if (dp) {
                dp.isOut = true;
                dp.batting.dismissalType = delivery.wicketType || "";
              }
            }

            if (delivery.bowler) {
              const bowlingTeam = battingTeam === "team1" ? "team2" : "team1";
              const bp =
                match.playerStats.find(
                  (p) => p.name === delivery.bowler && p.team === bowlingTeam,
                ) || match.playerStats.find((p) => p.name === delivery.bowler);
              if (bp) {
                bp.didBowl = true;
                if (isValid) bp.bowling.balls += 1;
                const isByeLike =
                  delivery.extraType === "bye" ||
                  delivery.extraType === "leg-bye";
                if (!isByeLike) bp.bowling.runs += delivery.runsOffBat || 0;
                if (delivery.extraType === "wide") {
                  bp.bowling.wides += 1;
                  bp.bowling.runs += delivery.extraRuns || 0;
                }
                if (delivery.extraType === "no-ball") {
                  bp.bowling.noBalls += 1;
                  bp.bowling.runs += delivery.extraRuns || 0;
                }
                if (delivery.isWicket && delivery.wicketType !== "run-out") {
                  bp.bowling.wickets += 1;
                }
                const totalBp = bp.bowling.balls;
                bp.bowling.overs = Math.floor(totalBp / 6) + (totalBp % 6) / 10;
              }
            }
          });

          if (match.timeline.length > 0) {
            // Each timeline entry stores the pre-delivery crease positions.
            // Simulate only the last remaining delivery to recover the
            // post-delivery crease state after undo.
            const lastBall = match.timeline[match.timeline.length - 1];
            let resStriker = lastBall.striker || null;
            let resNonStriker = lastBall.nonStriker || null;

            if (lastBall.isWicket) {
              // Wicket: dismissed batter's position becomes vacant.
              const dismissed = lastBall.batterDismissed || "";
              const isRunOut = lastBall.wicketType === "run-out";

              if (dismissed === resNonStriker) {
                resNonStriker = null;
              } else {
                resStriker = null;
              }

              // Run-out can still rotate.
              if (isRunOut) {
                const runs = lastBall.runsOffBat || 0;
                if (runs % 2 === 1) {
                  [resStriker, resNonStriker] = [resNonStriker, resStriker];
                }
              }
            } else {
              // Normal ball: apply strike rotation using already recomputed
              // post-last-ball valid ball count.
              const validBallsUpToAndIncluding = match.current.ballsBowled;
              const runsForRotation =
                lastBall.extraType === "bye" || lastBall.extraType === "leg-bye"
                  ? (lastBall.runsOffBat || 0) + (lastBall.extraRuns || 0)
                  : lastBall.runsOffBat || 0;

              const rotates = shouldRotateStrike(
                runsForRotation,
                lastBall.extraType,
                validBallsUpToAndIncluding,
              );
              if (rotates) {
                [resStriker, resNonStriker] = [resNonStriker, resStriker];
              }
            }

            // Restore crease positions.
            const sEntry = match.playerStats.find((p) => p.name === resStriker);
            const nsEntry = match.playerStats.find(
              (p) => p.name === resNonStriker,
            );
            match.current.striker = {
              name: resStriker || null,
              playerId: sEntry?.playerId || null,
            };
            match.current.nonStriker = {
              name: resNonStriker || null,
              playerId: nsEntry?.playerId || null,
            };

            // Set nextBatterFor if a position is vacant.
            if (!resStriker && resNonStriker)
              match.current.nextBatterFor = "striker";
            else if (resStriker && !resNonStriker)
              match.current.nextBatterFor = "nonStriker";
            else match.current.nextBatterFor = null;

            // Restore bowler from last ball.
            if (lastBall.bowler) {
              const bEntry = match.playerStats.find(
                (p) => p.name === lastBall.bowler,
              );
              match.current.bowler = {
                name: lastBall.bowler,
                playerId: bEntry?.playerId || null,
              };
            }
          } else {
            // All balls undone — clear live state.
            match.current.striker = { name: null, playerId: null };
            match.current.nonStriker = { name: null, playerId: null };
            match.current.bowler = { name: null, playerId: null };
            match.current.nextBatterFor = null;
          }

          inns1BattingSnapshot.forEach((snap) => {
            const ps = match.playerStats.find(
              (p) => p.name === snap.name && p.team === snap.team,
            );
            if (ps) {
              if (!ps.batting) ps.batting = {};
              ps.batting.runs = snap.runs;
              ps.batting.balls = snap.balls;
              ps.batting.fours = snap.fours;
              ps.batting.sixes = snap.sixes;
              ps.isOut = snap.isOut;
              ps.batting.dismissalType = snap.dismissalType;
            }
          });

          // Restore status to "live" if wicket had paused it
          if (
            match.current.striker?.name &&
            match.current.nonStriker?.name &&
            match.status === "innings"
          ) {
            match.status = "live";
          }

          // If a restored crease player is in benchedPlayers,
          // they have been un-benched by undo — remove them
          const restoredNames = [
            match.current.striker?.name,
            match.current.nonStriker?.name,
          ].filter(Boolean);

          restoredNames.forEach((name) => {
            // Remove from benchedPlayers array
            match.current.benchedPlayers = (
              match.current.benchedPlayers || []
            ).filter((n) => n !== name);

            // Clear isBenched flag on their playerStats entry
            const ps = match.playerStats.find((p) => p.name === name);
            if (ps) ps.isBenched = false;
          });

          match.markModified("current");
          match.markModified("playerStats");

          // Restore isBenched flags from the denormalised benchedPlayers array
          if (match.current.benchedPlayers?.length > 0) {
            match.current.benchedPlayers.forEach((benchedName) => {
              const ps = match.playerStats.find((p) => p.name === benchedName);
              if (ps) ps.isBenched = true;
            });
          }

          const benchedSet = new Set(match.current.benchedPlayers || []);

          if (benchedSet.size > 0) {
            // Determine if the last ball in the remaining timeline was a wicket
            const lastBall =
              match.timeline.length > 0
                ? match.timeline[match.timeline.length - 1]
                : null;
            const lastBallWasWicket = lastBall?.isWicket === true;

            if (!lastBallWasWicket) {
              // Undo of a non-wicket ball while a bench is pending:
              // The bench happened AFTER the last ball — undo should
              // reverse it. Restore benched players to their crease
              // positions and clear bench state entirely.

              // Restore striker if vacant due to bench
              if (
                !match.current.striker?.name ||
                benchedSet.has(match.current.striker.name)
              ) {
                // Find the benched player who was at striker position
                // Use the last timeline ball's striker field as reference
                const originalStriker = lastBall?.striker || null;
                if (originalStriker && benchedSet.has(originalStriker)) {
                  const ps = match.playerStats.find(
                    (p) => p.name === originalStriker,
                  );
                  match.current.striker = {
                    name: originalStriker,
                    playerId: ps?.playerId || null,
                  };
                  if (ps) ps.isBenched = false;
                  match.current.benchedPlayers = (
                    match.current.benchedPlayers || []
                  ).filter((n) => n !== originalStriker);
                }
              }

              // Restore non-striker if vacant due to bench
              if (
                !match.current.nonStriker?.name ||
                benchedSet.has(match.current.nonStriker.name)
              ) {
                const originalNonStriker = lastBall?.nonStriker || null;
                if (originalNonStriker && benchedSet.has(originalNonStriker)) {
                  const ps = match.playerStats.find(
                    (p) => p.name === originalNonStriker,
                  );
                  match.current.nonStriker = {
                    name: originalNonStriker,
                    playerId: ps?.playerId || null,
                  };
                  if (ps) ps.isBenched = false;
                  match.current.benchedPlayers = (
                    match.current.benchedPlayers || []
                  ).filter((n) => n !== originalNonStriker);
                }
              }

              // After restoration both positions should be filled
              // Clear nextBatterFor
              if (
                match.current.striker?.name &&
                match.current.nonStriker?.name
              ) {
                match.current.nextBatterFor = null;
              }
            } else {
              // Last ball WAS a wicket — keep existing reconciliation
              // A bench after a wicket means the benched player was
              // already out — nextBatterFor set by wicket logic is correct

              if (
                match.current.striker?.name &&
                benchedSet.has(match.current.striker.name)
              ) {
                match.current.striker = { name: null, playerId: null };
                match.current.nextBatterFor = "striker";
              }

              if (
                match.current.nonStriker?.name &&
                benchedSet.has(match.current.nonStriker.name)
              ) {
                match.current.nonStriker = { name: null, playerId: null };
                if (!match.current.nextBatterFor) {
                  match.current.nextBatterFor = "nonStriker";
                }
              }
            }

            match.markModified("current");
            match.markModified("playerStats");
          }

          match.current.overBreakPending = false;
        });

        if (savedMatch) emitMatchState(io.to(matchId), savedMatch);
      } catch (error) {
        console.error("Error handling undo_delivery:", error);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected: " + socket.id);
    });
  });
}

module.exports = setupSockets;
