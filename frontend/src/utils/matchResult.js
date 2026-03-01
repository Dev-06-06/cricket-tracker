export function checkMatchEnd({
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
    return {
      isMatchOver: true,
      resultMessage: `Team B won by ${Math.max(0, allOutWicketCount - wicketsLost)} wickets`,
    };
  }

  const inningsComplete =
    wicketsLost >= allOutWicketCount ||
    (allottedOvers > 0 && ballsBowled >= allottedOvers * 6);

  if (!inningsComplete) {
    return { isMatchOver: false, resultMessage: "" };
  }

  if (chasingScore < firstInningsScore) {
    return {
      isMatchOver: true,
      resultMessage: `Team A won by ${firstInningsScore - chasingScore} runs`,
    };
  }

  if (chasingScore === firstInningsScore) {
    return { isMatchOver: true, resultMessage: "Match Tied" };
  }

  return { isMatchOver: false, resultMessage: "" };
}
