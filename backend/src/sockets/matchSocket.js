const mongoose = require("mongoose");
const Match = require("../models/Match");
const Group = require("../models/Group");
const { updateCareerStats, isValidBallType } = require("../utils/statsUpdater");

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

function shouldRotateStrike(runs, extraType, totalValidBalls) {
  if (extraType === "wide") return false;

  const isValidBall = extraType === "none" || extraType === "bye" || extraType === "leg-bye";

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

function getBattingTeamSize(match) {
  const team = match.current.battingTeam; // "team1" | "team2"
  return (match.playerStats || []).filter((p) => p.team === team).length || 11;
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

  // Build player stats map keyed by name for quick access
  const statsMap = {};
  (m.playerStats || []).forEach((ps) => {
    statsMap[ps.name] = {
      playerId: ps.playerId,
      name: ps.name,
      team: ps.team === "team1" ? team1Name : team2Name,
      didBat: ps.didBat,
      didBowl: ps.didBowl,
      isOut: ps.isOut,
      batting: {
        runs:          ps.batting?.runs  || 0,
        balls:         ps.batting?.balls || 0,
        fours:         ps.batting?.fours || 0,
        sixes:         ps.batting?.sixes || 0,
        dismissalType: ps.batting?.dismissalType || "",
      },
      bowling: {
        overs:   ps.bowling?.overs   || 0,
        balls:   ps.bowling?.balls   || 0,
        runs:    ps.bowling?.runs    || 0,
        wickets: ps.bowling?.wickets || 0,
        wides:   ps.bowling?.wides   || 0,
        noBalls: ps.bowling?.noBalls || 0,
      },
    };
  });

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
    inningsNumber:     m.current.inningsNumber,
    battingTeam:       m.current.battingTeam === "team1" ? team1Name : team2Name,
    bowlingTeam:       m.current.battingTeam === "team1" ? team2Name : team1Name,
    totalRuns:         m.current.runs,
    wickets:           m.current.wickets,
    oversBowled:       m.current.oversBowled,
    ballsBowled:       m.current.ballsBowled,
    striker:           m.current.striker?.name    || null,
    nonStriker:        m.current.nonStriker?.name || null,
    currentStriker:    m.current.striker?.name    || null,
    currentNonStriker: m.current.nonStriker?.name || null,
    currentBowler:     m.current.bowler?.name     || null,
    nextBatterFor,

    // Innings 1 — normalize field names to match what frontend reads
    firstInningsScore:   m.innings1?.score  ?? null,
    targetScore:         m.innings1?.target ?? null,
    // Frontend reads .totalRuns and .oversBowled — map from new schema names
    firstInningsSummary: m.innings1 ? {
      ...m.innings1,
      totalRuns:   m.innings1.score,
      oversBowled: m.innings1.overs,
    } : null,

    playerStats: Object.values(statsMap),
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
        targetScore:       match.innings1?.target ?? null,
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
      const runs  = p.batting?.runs  || 0;
      const balls = p.batting?.balls || 0;
      return {
        name: p.name,
        dismissal: p.isOut
          ? (p.batting?.dismissalType || "out")
          : "not out",
        runs,
        balls,
        fours: p.batting?.fours || 0,
        sixes: p.batting?.sixes || 0,
        strikeRate: balls > 0 ? Number(((runs / balls) * 100).toFixed(2)) : null,
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
    score:       match.current.runs,
    wickets:     match.current.wickets,
    overs:       match.current.oversBowled,
    battingRows,
    bowlingRows,
  };
}

// ─── startSecondInnings ───────────────────────────────────────────────────────
function startSecondInnings(match) {
  const firstInningsRuns = Number(match.current.runs) || 0;
  const nextBattingTeam  = match.current.battingTeam === "team1" ? "team2" : "team1";

  // Save first innings summary into innings1
  match.innings1 = {
    ...buildFirstInningsSummary(match),
    score:  firstInningsRuns,
    wickets: match.current.wickets,
    overs:  match.current.oversBowled,
    target: firstInningsRuns + 1,
    battingTeam: match.current.battingTeam,
  };

  // Reset live state for second innings
  match.current.inningsNumber = 2;
  match.current.battingTeam   = nextBattingTeam;
  match.current.runs          = 0;
  match.current.wickets       = 0;
  match.current.oversBowled   = 0;
  match.current.ballsBowled   = 0;
  match.current.striker       = { name: null, playerId: null };
  match.current.nonStriker    = { name: null, playerId: null };
  match.current.bowler        = { name: null, playerId: null };
  match.current.nextBatterFor = null;
  match.status = "innings_complete";
  match.timeline = [];

  // Reset batting figures for the new batting team
  match.playerStats.forEach((ps) => {
    if (ps.team === nextBattingTeam) {
      ps.didBat  = false;
      ps.isOut   = false;
      if (ps.batting) {
        ps.batting.runs          = 0;
        ps.batting.balls         = 0;
        ps.batting.fours         = 0;
        ps.batting.sixes         = 0;
        ps.batting.dismissalType = "";
      }
    }
  });

  return {
    battingTeam:      nextBattingTeam === "team1" ? match.team1.name : match.team2.name,
    firstInningsScore: firstInningsRuns,
    targetScore:       firstInningsRuns + 1,
  };
}

// ─── checkMatchEnd ────────────────────────────────────────────────────────────
function checkMatchEnd({ teamAScore, teamBScore, teamBWickets, teamBPlayersCount, totalValidBalls, totalOvers }) {
  const maxBalls = (Number(totalOvers) || 0) * 6;

  if (teamBScore > teamAScore) {
    const wicketsRemaining = Math.max(0, (teamBPlayersCount || 11) - 1 - teamBWickets);
    return {
      isMatchOver: true,
      resultMessage: `Team B won by ${wicketsRemaining} wicket${wicketsRemaining === 1 ? "" : "s"}`,
    };
  }
  if (maxBalls > 0 && totalValidBalls >= maxBalls) {
    if (teamBScore === teamAScore) return { isMatchOver: true, resultMessage: "Match Tied" };
    if (teamBScore < teamAScore) {
      const margin = teamAScore - teamBScore;
      return { isMatchOver: true, resultMessage: `Team A won by ${margin} run${margin === 1 ? "" : "s"}` };
    }
  }
  return { isMatchOver: false, resultMessage: "" };
}

// ─── applyWicketState ─────────────────────────────────────────────────────────
function applyWicketState(match, { dismissedBatter, dismissedPlayerType, wicketType }) {
  match.current.wickets += 1;

  let outType = dismissedPlayerType;
  if (outType !== "striker" && outType !== "nonStriker") {
    outType = dismissedBatter && dismissedBatter === match.current.nonStriker?.name
      ? "nonStriker"
      : "striker";
  }

  const resolvedDismissed = dismissedBatter ||
    (outType === "nonStriker" ? match.current.nonStriker?.name : match.current.striker?.name);

  if (resolvedDismissed) {
    const ps = match.playerStats.find((p) => p.name === resolvedDismissed);
    if (ps) {
      ps.isOut = true;
      if (!ps.batting) ps.batting = {};
      ps.batting.dismissalType = wicketType || "";
    }
  }

  if (outType === "nonStriker") {
    match.current.nonStriker = { name: null, playerId: null };
  } else {
    match.current.striker = { name: null, playerId: null };
  }

  match.current.nextBatterFor = outType;

  return { dismissedBatter: resolvedDismissed, dismissedPlayerType: outType, nextBatterFor: outType };
}

// ─── handleWicketInningsCompletion ────────────────────────────────────────────
async function handleWicketInningsCompletion(match, matchId, io) {
  const battingTeamPlayers = (match.playerStats || []).filter(
    (p) => p.team === match.current.battingTeam,
  );
  const notOutAndBatted  = battingTeamPlayers.filter((p) => p.didBat && !p.isOut).length;
  const availableToBat   = battingTeamPlayers.filter((p) => !p.didBat && !p.isOut).length;
  const battingTeamSize  = battingTeamPlayers.length || getBattingTeamSize(match);

  const wicketLimitReached      = battingTeamSize > 0 && match.current.wickets >= battingTeamSize - 1;
  const lastBatterWithoutPartner = notOutAndBatted <= 1 && availableToBat === 0;
  if (!wicketLimitReached && !lastBatterWithoutPartner) return false;

  const inningsNumber = getCurrentInningsNumber(match);
  const battingTeamName = match.current.battingTeam === "team1" ? match.team1.name : match.team2.name;

  const completedInnings = {
    matchId,
    battingTeam: battingTeamName,
    score:   match.current.runs,
    wickets: match.current.wickets,
    overs:   match.current.oversBowled,
  };

  if (inningsNumber === 1) {
    const secondInningsState = startSecondInnings(match);
    await match.save();
    io.to(matchId).emit("innings_complete", {
      ...completedInnings,
      nextBattingTeam:   secondInningsState.battingTeam,
      targetScore:       secondInningsState.targetScore,
      firstInningsScore: secondInningsState.firstInningsScore,
    });
    emitMatchState(io.to(matchId), match);
    return true;
  }

  // Innings 2 — check if match is over
  const firstInningsScore = match.innings1?.score || 0;
  const chasingTeamSize   = getBattingTeamSize(match);
  const evaluation = checkMatchEnd({
    teamAScore:        firstInningsScore,
    teamBScore:        match.current.runs,
    teamBWickets:      match.current.wickets,
    teamBPlayersCount: chasingTeamSize,
    totalValidBalls:   match.current.ballsBowled || 0,
    totalOvers:        match.totalOvers,
  });

  const resultMessage = evaluation.isMatchOver
    ? evaluation.resultMessage
    : match.current.runs < firstInningsScore
      ? `Team A won by ${firstInningsScore - match.current.runs} runs`
      : match.current.runs === firstInningsScore
        ? "Match Tied"
        : `Team B won by ${Math.max(0, chasingTeamSize - 1 - match.current.wickets)} wickets`;

  await match.save();
  return completeMatchWithStats({ matchId, resultMessage, io });
}

// ─── finalizeSecondInningsIfMatchEnded ────────────────────────────────────────
async function finalizeSecondInningsIfMatchEnded(match, matchId, io, totalValidBalls) {
  if (getCurrentInningsNumber(match) !== 2) return false;

  const evaluation = checkMatchEnd({
    teamAScore:        match.innings1?.score || 0,
    teamBScore:        match.current.runs,
    teamBWickets:      match.current.wickets,
    teamBPlayersCount: getBattingTeamSize(match),
    totalValidBalls,
    totalOvers:        match.totalOvers,
  });

  if (!evaluation.isMatchOver) return false;

  await match.save();
  return completeMatchWithStats({ matchId, resultMessage: evaluation.resultMessage, io });
}

// ─── handleMaxOversTransition ─────────────────────────────────────────────────
async function handleMaxOversTransition(match, matchId, io, totalValidBalls) {
  const maxOvers = Number(match.totalOvers) || 0;
  if (maxOvers <= 0 || totalValidBalls % 6 !== 0) return false;

  const completedOvers = Math.floor(totalValidBalls / 6);
  if (completedOvers !== maxOvers) return false;

  const inningsNumber = getCurrentInningsNumber(match);
  const battingTeamName = match.current.battingTeam === "team1" ? match.team1.name : match.team2.name;

  if (inningsNumber === 1) {
    const completedInnings = {
      matchId,
      battingTeam: battingTeamName,
      score:   match.current.runs,
      wickets: match.current.wickets,
      overs:   match.current.oversBowled,
    };
    const secondInningsState = startSecondInnings(match);
    await match.save();
    io.to(matchId).emit("innings_complete", {
      ...completedInnings,
      nextBattingTeam:   secondInningsState.battingTeam,
      targetScore:       secondInningsState.targetScore,
      firstInningsScore: secondInningsState.firstInningsScore,
    });
    emitMatchState(io.to(matchId), match);
    return true;
  }

  if (inningsNumber === 2) {
    const evaluation = checkMatchEnd({
      teamAScore:        match.innings1?.score || 0,
      teamBScore:        match.current.runs,
      teamBWickets:      match.current.wickets,
      teamBPlayersCount: getBattingTeamSize(match),
      totalValidBalls,
      totalOvers:        maxOvers,
    });
    if (!evaluation.isMatchOver) return false;
    await match.save();
    return completeMatchWithStats({ matchId, resultMessage: evaluation.resultMessage, io });
  }

  return false;
}

// ─── setupSockets ─────────────────────────────────────────────────────────────
function setupSockets(io) {
  io.on("connection", (socket) => {

    // ── joinMatch ──────────────────────────────────────────────────────────
    socket.on("joinMatch", async ({ matchId }) => {
      socket.join(matchId);
      const match = await Match.findById(matchId).lean();
      if (match) {
        emitMatchState(socket, match);
        emitFullMatchState(socket, match);
      }
    });

    socket.on("join_match", async (matchId) => {
      socket.join(matchId);
      const match = await Match.findById(matchId).lean();
      if (match) {
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
    socket.on("toss_flip_started", ({ matchId }) => {
      if (!matchId) return;
      io.to(matchId).emit("toss_flip_started");
    });

    socket.on("toss_flip_result", ({ matchId, result, winner }) => {
      if (!matchId) return;
      io.to(matchId).emit("toss_flip_result", { result, winner });
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
      }
    });

    // ── setOpeners ─────────────────────────────────────────────────────────
    socket.on("setOpeners", async ({ matchId, striker, nonStriker, bowler }) => {
      try {
        const match = await Match.findById(matchId);
        if (!match) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(match, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        // Resolve playerIds from playerStats
        const findPlayerEntry = (name) =>
          match.playerStats.find((p) => p.name === name);

        const strikerEntry    = findPlayerEntry(striker);
        const nonStrikerEntry = findPlayerEntry(nonStriker);
        const bowlerEntry     = findPlayerEntry(bowler);

        match.current.striker    = { name: striker,    playerId: strikerEntry?.playerId    || null };
        match.current.nonStriker = { name: nonStriker, playerId: nonStrikerEntry?.playerId || null };
        match.current.bowler     = { name: bowler,     playerId: bowlerEntry?.playerId     || null };
        match.current.nextBatterFor = null;
        match.status = "live";

        match.playerStats.forEach((ps) => {
          if (ps.name === striker || ps.name === nonStriker) ps.didBat  = true;
          if (ps.name === bowler)                             ps.didBowl = true;
        });

        await match.save();
        emitMatchState(io.to(matchId), match);
      } catch (error) {
        console.error("Error handling setOpeners:", error);
      }
    });

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

        const batterEntry = match.playerStats.find((p) => p.name === batter);
        const batterObj   = { name: batter, playerId: batterEntry?.playerId || null };

        if (!match.current.striker?.name) {
          match.current.striker = batterObj;
        } else if (!match.current.nonStriker?.name) {
          match.current.nonStriker = batterObj;
        } else {
          match.current.striker = batterObj;
        }

        // Mark player as having batted
        if (batterEntry) batterEntry.didBat = true;

        // Clear nextBatterFor if both are now set
        if (match.current.striker?.name && match.current.nonStriker?.name) {
          match.current.nextBatterFor = null;
          if (match.status === "innings") match.status = "live";
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

        const bowlerEntry = match.playerStats.find((p) => p.name === bowler);
        match.current.bowler = { name: bowler, playerId: bowlerEntry?.playerId || null };
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

    // ── delivery (main ball event) ─────────────────────────────────────────
    socket.on("delivery", async ({
      matchId, runs, extraType, extraRuns,
      isWicket, wicketType, dismissedBatter, dismissedPlayerType,
    }) => {
      try {
        const match = await Match.findById(matchId);
        if (!match) {
          socket.emit("error", { message: "Match not found" });
          return;
        }

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(match, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        const normalizedExtraType = extraType === "noBall" ? "no-ball" : extraType || "none";
        const isValidBall         = isValidBallType(normalizedExtraType);
        const originalNonStriker  = match.current.nonStriker?.name;

        const entry = {
          runsOffBat:      Number(runs)      || 0,
          extraType:       normalizedExtraType,
          extraRuns:       Number(extraRuns) || 0,
          isWicket:        Boolean(isWicket),
          wicketType:      isWicket && wicketType ? wicketType : "none",
          batterDismissed: isWicket && dismissedBatter ? dismissedBatter : "",
          striker:         match.current.striker?.name    || "",
          nonStriker:      match.current.nonStriker?.name  || "",
          bowler:          match.current.bowler?.name      || "",
        };

        match.timeline.push(entry);
        match.current.runs += entry.runsOffBat + entry.extraRuns;

        // ── Update batter stats ──────────────────────────────────────────
        if (match.current.striker?.name) {
          const strikerPs = match.playerStats.find((p) => p.name === match.current.striker.name);
          if (strikerPs) {
            if (!strikerPs.batting) strikerPs.batting = {};
            if (normalizedExtraType !== "wide") {
              strikerPs.batting.runs = (strikerPs.batting.runs || 0) + entry.runsOffBat;
              if (entry.runsOffBat === 4) strikerPs.batting.fours = (strikerPs.batting.fours || 0) + 1;
              if (entry.runsOffBat === 6) strikerPs.batting.sixes = (strikerPs.batting.sixes || 0) + 1;
            }
            if (isValidBall) strikerPs.batting.balls = (strikerPs.batting.balls || 0) + 1;
          }
        }

        // ── Update bowler stats ──────────────────────────────────────────
        if (match.current.bowler?.name) {
          const bowlerPs = match.playerStats.find((p) => p.name === match.current.bowler.name);
          if (bowlerPs) {
            if (!bowlerPs.bowling) bowlerPs.bowling = {};
            if (isValidBall) bowlerPs.bowling.balls = (bowlerPs.bowling.balls || 0) + 1;
            const isByeLike = normalizedExtraType === "bye" || normalizedExtraType === "leg-bye";
            if (!isByeLike) {
              bowlerPs.bowling.runs = (bowlerPs.bowling.runs || 0) + entry.runsOffBat;
            }
            if (normalizedExtraType === "wide")    bowlerPs.bowling.wides   = (bowlerPs.bowling.wides   || 0) + 1;
            if (normalizedExtraType === "no-ball") bowlerPs.bowling.noBalls = (bowlerPs.bowling.noBalls || 0) + 1;
            if (normalizedExtraType === "wide" || normalizedExtraType === "no-ball") {
              bowlerPs.bowling.runs = (bowlerPs.bowling.runs || 0) + entry.extraRuns;
            }
            if (isWicket && wicketType !== "run-out") {
              bowlerPs.bowling.wickets = (bowlerPs.bowling.wickets || 0) + 1;
            }
            // ✅ Recompute overs from total legal balls after every delivery
            const bowlerTotalBalls = bowlerPs.bowling.balls || 0;
            bowlerPs.bowling.overs = Math.floor(bowlerTotalBalls / 6) + (bowlerTotalBalls % 6) / 10;
          }
        }

        // ── Wicket ───────────────────────────────────────────────────────
        if (isWicket) {
          const wicketState = applyWicketState(match, { dismissedBatter, dismissedPlayerType, wicketType });
          entry.batterDismissed = wicketState.dismissedBatter || "";
          const inningsClosed = await handleWicketInningsCompletion(match, matchId, io);
          if (inningsClosed) return;
          match.status = "innings";
        }

        // ── Valid ball count & overs ─────────────────────────────────────
        let totalValidBalls = match.current.ballsBowled || 0;
        if (isValidBall) totalValidBalls += 1;

        // ── Strike rotation ──────────────────────────────────────────────
        const isRunOut         = isWicket && wicketType === "run-out";
        const nonStrikerRunOut = isRunOut && dismissedBatter === originalNonStriker;

        if (!isWicket || isRunOut) {
          const runsForRotation =
            normalizedExtraType === "bye" || normalizedExtraType === "leg-bye"
              ? entry.runsOffBat + (entry.extraRuns || 0)
              : entry.runsOffBat;
          let rotates;
          if (nonStrikerRunOut) {
            rotates = runsForRotation % 2 === 1;
          } else {
            rotates = shouldRotateStrike(runsForRotation, normalizedExtraType, totalValidBalls);
          }
          if (rotates) {
            const tmp = { ...match.current.striker };
            match.current.striker    = { ...match.current.nonStriker };
            match.current.nonStriker = tmp;
          }
        }

        match.current.oversBowled = calculateOvers(totalValidBalls);
        match.current.ballsBowled = totalValidBalls;

        // ── Over transitions & match end ─────────────────────────────────
        const transitionedAtMaxOvers = await handleMaxOversTransition(match, matchId, io, totalValidBalls);
        if (transitionedAtMaxOvers) return;

        const completed = await finalizeSecondInningsIfMatchEnded(match, matchId, io, totalValidBalls);
        if (completed) return;

        await match.save();
        // ✅ Pass match directly — no extra DB query
        emitMatchState(io.to(matchId), match);
      } catch (error) {
        console.error("Error handling delivery:", error);
        socket.emit("error", { message: "Failed to record delivery" });
      }
    });

    // ── umpire_update (alternative delivery path) ──────────────────────────
    socket.on("umpire_update", async ({ matchId, deliveryData }) => {
      try {
        const match = await Match.findById(matchId);
        if (!match) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(match, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        const dismissedBatter    = deliveryData.dismissedBatter || deliveryData.batterDismissed || "";
        const dismissedPlayerType = deliveryData.dismissedPlayerType;
        const originalNonStriker  = match.current.nonStriker?.name;
        const isValidBall         = isValidBallType(deliveryData.extraType);

        const enrichedDelivery = {
          ...deliveryData,
          batterDismissed: dismissedBatter,
          striker:    match.current.striker?.name    || "",
          nonStriker: match.current.nonStriker?.name || "",
          bowler:     match.current.bowler?.name     || "",
        };
        match.timeline.push(enrichedDelivery);
        match.current.runs += deliveryData.runsOffBat + deliveryData.extraRuns;

        // Batter stats
        if (match.current.striker?.name) {
          const strikerPs = match.playerStats.find((p) => p.name === match.current.striker.name);
          if (strikerPs) {
            if (!strikerPs.batting) strikerPs.batting = {};
            if (deliveryData.extraType !== "wide") {
              strikerPs.batting.runs  = (strikerPs.batting.runs  || 0) + deliveryData.runsOffBat;
              if (deliveryData.runsOffBat === 4) strikerPs.batting.fours = (strikerPs.batting.fours || 0) + 1;
              if (deliveryData.runsOffBat === 6) strikerPs.batting.sixes = (strikerPs.batting.sixes || 0) + 1;
            }
            if (isValidBall) strikerPs.batting.balls = (strikerPs.batting.balls || 0) + 1;
          }
        }

        // Bowler stats (umpire_update path)
        if (match.current.bowler?.name) {
          const bowlerPs = match.playerStats.find((p) => p.name === match.current.bowler.name);
          if (bowlerPs) {
            if (!bowlerPs.bowling) bowlerPs.bowling = {};
            if (isValidBall) bowlerPs.bowling.balls = (bowlerPs.bowling.balls || 0) + 1;
            const isByeLikeU = deliveryData.extraType === "bye" || deliveryData.extraType === "leg-bye";
            if (!isByeLikeU) {
              bowlerPs.bowling.runs = (bowlerPs.bowling.runs || 0) + (deliveryData.runsOffBat || 0);
            }
            if (deliveryData.extraType === "wide")    bowlerPs.bowling.wides   = (bowlerPs.bowling.wides   || 0) + 1;
            if (deliveryData.extraType === "no-ball") bowlerPs.bowling.noBalls = (bowlerPs.bowling.noBalls || 0) + 1;
            if (deliveryData.extraType === "wide" || deliveryData.extraType === "no-ball") {
              bowlerPs.bowling.runs = (bowlerPs.bowling.runs || 0) + (deliveryData.extraRuns || 0);
            }
            if (deliveryData.isWicket && deliveryData.wicketType !== "run-out") {
              bowlerPs.bowling.wickets = (bowlerPs.bowling.wickets || 0) + 1;
            }
            // ✅ Recompute overs from total legal balls
            const uBowlerBalls = bowlerPs.bowling.balls || 0;
            bowlerPs.bowling.overs = Math.floor(uBowlerBalls / 6) + (uBowlerBalls % 6) / 10;
            bowlerPs.didBowl = true;
          }
        }

        if (deliveryData.isWicket) {
          const wicketState = applyWicketState(match, {
            dismissedBatter,
            dismissedPlayerType,
            wicketType: deliveryData.wicketType,
          });
          enrichedDelivery.batterDismissed = wicketState.dismissedBatter || "";
          const inningsClosed = await handleWicketInningsCompletion(match, matchId, io);
          if (inningsClosed) return;
          match.status = "innings";
        }

        let totalValidBalls = match.current.ballsBowled || 0;
        if (isValidBall) totalValidBalls += 1;

        const isRunOut         = deliveryData.isWicket && deliveryData.wicketType === "run-out";
        const nonStrikerRunOut = isRunOut && dismissedBatter === originalNonStriker;

        if (!deliveryData.isWicket || isRunOut) {
          const runsForRotation =
            deliveryData.extraType === "bye" || deliveryData.extraType === "leg-bye"
              ? deliveryData.runsOffBat + (deliveryData.extraRuns || 0)
              : deliveryData.runsOffBat;
          const rotates = nonStrikerRunOut
            ? runsForRotation % 2 === 1
            : shouldRotateStrike(runsForRotation, deliveryData.extraType, totalValidBalls);
          if (rotates) {
            const tmp = { ...match.current.striker };
            match.current.striker    = { ...match.current.nonStriker };
            match.current.nonStriker = tmp;
          }
        }

        match.current.oversBowled = calculateOvers(totalValidBalls);
        match.current.ballsBowled = totalValidBalls;

        const transitionedAtMaxOvers = await handleMaxOversTransition(match, matchId, io, totalValidBalls);
        if (transitionedAtMaxOvers) return;

        const completed = await finalizeSecondInningsIfMatchEnded(match, matchId, io, totalValidBalls);
        if (completed) return;

        await match.save();
        emitMatchState(io.to(matchId), match);
      } catch (error) {
        console.error("Error handling umpire_update:", error);
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
        await completeMatchWithStats({ matchId, resultMessage: "Match completed", io });
      } catch (error) {
        console.error("Error handling complete_match:", error);
      }
    });


    // ── undo_delivery ──────────────────────────────────────────────────────
    socket.on("undo_delivery", async ({ matchId }) => {
      try {
        const match = await Match.findById(matchId);
        if (!match || match.timeline.length === 0) return;

        const userId = socket.user?.userId;
        const isMember = await assertGroupMember(match, userId);
        if (!isMember) {
          socket.emit("matchError", { message: "Unauthorized" });
          return;
        }

        // Remove last ball
        match.timeline.pop();

        // ── Rebuild current.runs, wickets, balls from remaining timeline ──
        match.current.runs = match.timeline.reduce(
          (sum, d) => sum + (d.runsOffBat || 0) + (d.extraRuns || 0), 0
        );
        match.current.wickets = match.timeline.filter((d) => d.isWicket).length;

        const validBalls = match.timeline.filter((d) =>
          isValidBallType(d.extraType)
        ).length;
        match.current.ballsBowled = validBalls;
        match.current.oversBowled = calculateOvers(validBalls);

        // ── Rebuild all playerStats from scratch ──────────────────────────
        match.playerStats.forEach((ps) => {
          ps.isOut   = false;
          ps.didBat  = false;
          ps.didBowl = false;
          ps.batting = { runs: 0, balls: 0, fours: 0, sixes: 0, dismissalType: "" };
          ps.bowling = { overs: 0, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
        });

        match.timeline.forEach((delivery) => {
          const isValid = isValidBallType(delivery.extraType);

          if (delivery.striker) {
            const sp = match.playerStats.find((p) => p.name === delivery.striker);
            if (sp) {
              sp.didBat = true;
              if (delivery.extraType !== "wide") {
                sp.batting.runs  += delivery.runsOffBat || 0;
                if (delivery.runsOffBat === 4) sp.batting.fours += 1;
                if (delivery.runsOffBat === 6) sp.batting.sixes += 1;
              }
              if (isValid) sp.batting.balls += 1;
            }
          }

          if (delivery.isWicket && delivery.batterDismissed) {
            const dp = match.playerStats.find((p) => p.name === delivery.batterDismissed);
            if (dp) {
              dp.isOut = true;
              dp.batting.dismissalType = delivery.wicketType || "";
            }
          }

          if (delivery.bowler) {
            const bp = match.playerStats.find((p) => p.name === delivery.bowler);
            if (bp) {
              bp.didBowl = true;
              if (isValid) bp.bowling.balls += 1;
              const isByeLike = delivery.extraType === "bye" || delivery.extraType === "leg-bye";
              if (!isByeLike) bp.bowling.runs += delivery.runsOffBat || 0;
              if (delivery.extraType === "wide") {
                bp.bowling.wides += 1;
                bp.bowling.runs  += delivery.extraRuns || 0;
              }
              if (delivery.extraType === "no-ball") {
                bp.bowling.noBalls += 1;
                bp.bowling.runs    += delivery.extraRuns || 0;
              }
              if (delivery.isWicket && delivery.wicketType !== "run-out") {
                bp.bowling.wickets += 1;
              }
              const totalBp = bp.bowling.balls;
              bp.bowling.overs = Math.floor(totalBp / 6) + (totalBp % 6) / 10;
            }
          }
        });

        // ── Restore striker / nonStriker by replaying rotation ────────────
        // Each timeline entry now stores the pre-delivery striker & nonStriker.
        // Replay all rotations to arrive at the correct post-last-ball state.
        if (match.timeline.length > 0) {
          // Walk through every delivery and simulate strike rotation
          // so we know who ends up on strike after the remaining balls.
          let curStriker    = match.timeline[0].striker    || "";
          let curNonStriker = match.timeline[0].nonStriker || "";

          let runningValidBalls = 0;

          for (const d of match.timeline) {
            const isValid = isValidBallType(d.extraType);

            // Handle wicket: dismissed batter leaves, next batter TBD
            if (d.isWicket) {
              const dismissed = d.batterDismissed || "";
              // Figure out which position was dismissed
              const isRunOut = d.wicketType === "run-out";
              let outType = "striker"; // default
              if (dismissed === curNonStriker) outType = "nonStriker";

              if (outType === "nonStriker") {
                curNonStriker = ""; // new batter needed at nonStriker end
              } else {
                curStriker = "";   // new batter needed at striker end
              }

              // Run-out can still rotate
              if (isRunOut) {
                const runsForRotation = d.runsOffBat || 0;
                if (runsForRotation % 2 === 1) {
                  [curStriker, curNonStriker] = [curNonStriker, curStriker];
                }
              }
            } else {
              // Normal delivery — check rotation
              if (isValid) runningValidBalls += 1;
              const runsForRotation =
                d.extraType === "bye" || d.extraType === "leg-bye"
                  ? (d.runsOffBat || 0) + (d.extraRuns || 0)
                  : d.runsOffBat || 0;

              const rotates = shouldRotateStrike(
                runsForRotation,
                d.extraType,
                runningValidBalls,
              );
              if (rotates) {
                [curStriker, curNonStriker] = [curNonStriker, curStriker];
              }
            }
          }

          // Apply computed positions back to match
          const sEntry = match.playerStats.find((p) => p.name === curStriker);
          const nsEntry = match.playerStats.find((p) => p.name === curNonStriker);
          match.current.striker    = { name: curStriker    || null, playerId: sEntry?.playerId  || null };
          match.current.nonStriker = { name: curNonStriker || null, playerId: nsEntry?.playerId || null };

          // Restore nextBatterFor if a position is vacant (wicket was last event)
          if (!curStriker && curNonStriker)    match.current.nextBatterFor = "striker";
          else if (curStriker && !curNonStriker) match.current.nextBatterFor = "nonStriker";
          else                                  match.current.nextBatterFor = null;

          // Restore bowler from last ball
          const lastBall = match.timeline[match.timeline.length - 1];
          if (lastBall?.bowler) {
            const bEntry = match.playerStats.find((p) => p.name === lastBall.bowler);
            match.current.bowler = { name: lastBall.bowler, playerId: bEntry?.playerId || null };
          }
        } else {
          // All balls undone — clear live state but keep status at innings
          match.current.striker    = { name: null, playerId: null };
          match.current.nonStriker = { name: null, playerId: null };
          match.current.bowler     = { name: null, playerId: null };
          match.current.nextBatterFor = null;
        }

        // Restore status to "live" if wicket had paused it
        if (
          match.current.striker?.name &&
          match.current.nonStriker?.name &&
          match.status === "innings"
        ) {
          match.status = "live";
        }

        await match.save();
        emitMatchState(io.to(matchId), match);
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