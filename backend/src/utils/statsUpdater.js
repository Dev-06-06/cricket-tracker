const Player = require("../models/Player");

const isValidBallType = (extraType) =>
  extraType === "none" || extraType === "bye" || extraType === "leg-bye";

function calculateOversFromBalls(totalBalls) {
  const balls = Number(totalBalls) || 0;
  return Math.floor(balls / 6) + (balls % 6) / 10;
}

function buildBowlingByName(match) {
  const bowlingByName = {};

  (match.timeline || []).forEach((delivery) => {
    const bowler = delivery.bowler;
    if (!bowler) return;

    if (!bowlingByName[bowler]) {
      bowlingByName[bowler] = { balls: 0, runs: 0, wickets: 0 };
    }

    if (isValidBallType(delivery.extraType)) {
      bowlingByName[bowler].balls += 1;
    }

    if (delivery.extraType !== "wide" && delivery.extraType !== "no-ball") {
      bowlingByName[bowler].runs += Number(delivery.runsOffBat) || 0;
    }

    bowlingByName[bowler].runs += Number(delivery.extraRuns) || 0;

    if (delivery.isWicket) {
      bowlingByName[bowler].wickets += 1;
    }
  });

  return bowlingByName;
}

/**
 * Updates career statistics for all players in a completed match.
 * @param {Object} match - Match object containing playerStats array
 */
async function updateCareerStats(match) {
  if (!match || !Array.isArray(match.playerStats)) {
    return;
  }

  const bowlingByName = buildBowlingByName(match);

  for (const ps of match.playerStats) {
    const player = await Player.findById(ps.playerId);
    if (!player) continue;

    const battingStats = ps.batting || {};
    const bowlingStats = bowlingByName[ps.name] || {
      balls: 0,
      runs: 0,
      wickets: 0,
    };

    const didBat = Boolean(ps.didBat);
    const didBowl = Boolean(ps.didBowl);

    if (didBat) {
      player.batting.matches += 1;
      player.batting.innings += 1;
      player.batting.runs += Number(battingStats.runs) || 0;
      player.batting.balls += Number(battingStats.balls) || 0;
      player.batting.fours += Number(battingStats.fours) || 0;
      player.batting.sixes += Number(battingStats.sixes) || 0;

      if (!ps.isOut) {
        player.batting.notOuts += 1;
      }

      if ((Number(battingStats.runs) || 0) > player.batting.highestScore) {
        player.batting.highestScore = Number(battingStats.runs) || 0;
      }

      if ((Number(battingStats.runs) || 0) >= 100) {
        player.batting.hundreds += 1;
      } else if ((Number(battingStats.runs) || 0) >= 50) {
        player.batting.fifties += 1;
      }
    }

    if (didBowl) {
      player.bowling.matches += 1;
      player.bowling.innings += 1;
      player.bowling.balls += bowlingStats.balls;
      player.bowling.runs += bowlingStats.runs;
      player.bowling.wickets += bowlingStats.wickets;
      player.bowling.overs = calculateOversFromBalls(player.bowling.balls);

      const isBetter =
        bowlingStats.wickets > player.bowling.bestFiguresWickets ||
        (bowlingStats.wickets === player.bowling.bestFiguresWickets &&
          bowlingStats.runs < player.bowling.bestFiguresRuns);

      if (isBetter) {
        player.bowling.bestFiguresWickets = bowlingStats.wickets;
        player.bowling.bestFiguresRuns = bowlingStats.runs;
      }

      if (bowlingStats.wickets >= 5) {
        player.bowling.fiveWickets += 1;
      } else if (bowlingStats.wickets === 4) {
        player.bowling.fourWickets += 1;
      }
    }

    await player.save();
  }
}

module.exports = { updateCareerStats };
