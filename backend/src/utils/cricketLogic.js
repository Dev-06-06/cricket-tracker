/**
 * Calculates cricket overs from total valid balls
 * @param {number} totalValidBalls - Total number of valid balls bowled
 * @returns {number} Overs in cricket format (e.g., 1.1 means 1 over and 1 ball)
 */
function calculateOvers(totalValidBalls) {
  const overs = Math.floor(totalValidBalls / 6);
  const balls = totalValidBalls % 6;
  return parseFloat(`${overs}.${balls}`);
}

/**
 * Determines if batters should rotate strike
 * @param {number} runsOffBat - Runs used for odd-run rotation check.
 *   For bye/leg-bye deliveries the caller should include extraRuns in this value.
 *   For wide/no-ball deliveries only the actual bat runs should be passed.
 * @param {string} extraType - Delivery extra type ('none'|'bye'|'leg-bye'|'wide'|'no-ball')
 * @param {number} totalValidBallsAfterThisDelivery - Total valid balls after this delivery
 * @returns {boolean} Whether strike should rotate
 */
function shouldRotateStrike(
  runsOffBat,
  extraType,
  totalValidBallsAfterThisDelivery,
) {
  const isValidBall =
    extraType === "none" || extraType === "bye" || extraType === "leg-bye";
  let strikeRotates = false;

  // Rule A: Odd runs rotate strike
  if (runsOffBat % 2 === 1) {
    strikeRotates = true;
  }

  // Rule B: Over completion rotation
  if (isValidBall && totalValidBallsAfterThisDelivery % 6 === 0) {
    strikeRotates = !strikeRotates;
  }

  return strikeRotates;
}

/**
 * Determines second-innings match result where Team A batted first and Team B is chasing.
 * @param {Object} params
 * @param {number} params.teamAScore - Team A (first-innings) score
 * @param {number} params.teamBScore - Team B (chasing) score
 * @param {number} params.teamBWickets - Team B wickets lost
 * @param {number} [params.teamBPlayersCount=11] - Team B total players in the playing side
 * @param {number} params.totalValidBalls - Valid balls bowled in Team B innings
 * @param {number} params.totalOvers - Allotted overs for the innings
 * @returns {{ isMatchOver: boolean, resultMessage: string }}
 */
function checkMatchEnd({
  teamAScore,
  teamBScore,
  teamBWickets,
  teamBPlayersCount = 11,
  totalValidBalls,
  totalOvers,
}) {
  const firstInningsScore = Number(teamAScore) || 0;
  const chasingScore = Number(teamBScore) || 0;
  const wicketsLost = Number(teamBWickets) || 0;
  const chasingTeamPlayers =
    Number(teamBPlayersCount) > 1 ? Number(teamBPlayersCount) : 11;
  const allOutWicketCount = chasingTeamPlayers - 1;
  const ballsBowled = Number(totalValidBalls) || 0;
  const allottedOvers = Number(totalOvers) || 0;

  if (chasingScore > firstInningsScore) {
    const wicketsRemaining = Math.max(0, allOutWicketCount - wicketsLost);
    return {
      isMatchOver: true,
      resultMessage: `Team B won by ${wicketsRemaining} wickets`,
    };
  }

  const inningsComplete =
    wicketsLost >= allOutWicketCount ||
    (allottedOvers > 0 && ballsBowled >= allottedOvers * 6);
  if (!inningsComplete) {
    return { isMatchOver: false, resultMessage: "" };
  }

  if (chasingScore < firstInningsScore) {
    const runsMargin = firstInningsScore - chasingScore;
    return {
      isMatchOver: true,
      resultMessage: `Team A won by ${runsMargin} runs`,
    };
  }

  if (chasingScore === firstInningsScore) {
    return { isMatchOver: true, resultMessage: "Match Tied" };
  }

  return { isMatchOver: false, resultMessage: "" };
}

module.exports = {
  calculateOvers,
  shouldRotateStrike,
  checkMatchEnd,
};
