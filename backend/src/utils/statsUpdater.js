const Player = require('../models/Player');

/**
 * Updates career statistics for all players in a completed match.
 * @param {Object} match - Match object containing playerStats array
 */
async function updateCareerStats(match) {
  for (const ps of match.playerStats) {
    const player = await Player.findById(ps.playerId);
    if (!player) continue;

    if (ps.batting.didBat) {
      player.batting.matches += 1;
      player.batting.innings += 1;
      player.batting.runs += ps.batting.runs;
      player.batting.balls += ps.batting.balls;
      player.batting.fours += ps.batting.fours;
      player.batting.sixes += ps.batting.sixes;

      if (ps.batting.notOut) {
        player.batting.notOuts += 1;
      }

      if (ps.batting.runs > player.batting.highestScore) {
        player.batting.highestScore = ps.batting.runs;
      }

      if (ps.batting.runs >= 100) {
        player.batting.hundreds += 1;
      } else if (ps.batting.runs >= 50) {
        player.batting.fifties += 1;
      }
    }

    if (ps.bowling.didBowl) {
      player.bowling.matches += 1;
      player.bowling.innings += 1;
      player.bowling.balls += ps.bowling.balls;
      player.bowling.runs += ps.bowling.runs;
      player.bowling.wickets += ps.bowling.wickets;

      const isBetter =
        ps.bowling.wickets > player.bowling.bestFiguresWickets ||
        (ps.bowling.wickets === player.bowling.bestFiguresWickets &&
          ps.bowling.runs < player.bowling.bestFiguresRuns);

      if (isBetter) {
        player.bowling.bestFiguresWickets = ps.bowling.wickets;
        player.bowling.bestFiguresRuns = ps.bowling.runs;
      }

      if (ps.bowling.wickets >= 5) {
        player.bowling.fiveWickets += 1;
      } else if (ps.bowling.wickets === 4) {
        player.bowling.fourWickets += 1;
      }
    }

    await player.save();
  }
}

module.exports = { updateCareerStats };
