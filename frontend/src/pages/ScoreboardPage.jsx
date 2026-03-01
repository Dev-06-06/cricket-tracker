import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { createMatchSocket } from "../services/socket";
import { getMatch } from "../services/api";
import { checkMatchEnd } from "../utils/matchResult";

function getBallLabel(ball) {
  if (ball.extraType === "wide") {
    return "Wd";
  }

  if (ball.isWicket) {
    return "W";
  }

  const runs = Number(ball.runsOffBat || 0) + Number(ball.extraRuns || 0);
  return runs === 0 ? "•" : String(runs);
}

function isValidBall(ball) {
  if (typeof ball?.isValidBall === "boolean") {
    return ball.isValidBall;
  }

  return ball.extraType !== "wide" && ball.extraType !== "no-ball";
}

function buildCurrentOver(timeline = []) {
  if (timeline.length === 0) return [];

  let currentOverBalls = [];
  let validBallCount = 0;

  for (const ball of timeline) {
    currentOverBalls.push(getBallLabel(ball));

    if (isValidBall(ball)) {
      validBallCount += 1;
      if (validBallCount % 6 === 0) {
        currentOverBalls = [];
      }
    }
  }

  return currentOverBalls;
}

function getOrdinalLabel(value) {
  const v = Number(value) || 0;
  if (v % 100 >= 11 && v % 100 <= 13) return `${v}th`;
  const last = v % 10;
  if (last === 1) return `${v}st`;
  if (last === 2) return `${v}nd`;
  if (last === 3) return `${v}rd`;
  return `${v}th`;
}

function buildOversSummary(timeline = []) {
  if (!timeline.length) return [];

  const overs = [];
  let currentOver = [];
  let validBallCount = 0;

  for (const ball of timeline) {
    currentOver.push(getBallLabel(ball));

    if (isValidBall(ball)) {
      validBallCount += 1;
      if (validBallCount % 6 === 0) {
        overs.push(currentOver);
        currentOver = [];
      }
    }
  }

  if (currentOver.length) {
    overs.push(currentOver);
  }

  return overs.map((balls, index) => ({
    overNumber: index + 1,
    balls,
  }));
}

function getDismissal(player, striker, nonStriker) {
  if (!player.isOut) {
    if (player.name === striker || player.name === nonStriker) {
      return "batting";
    }
    return "not out";
  }
  const dt = player.batting?.dismissalType || "";
  if (!dt) return "Out";
  return dt.charAt(0).toUpperCase() + dt.slice(1);
}

function calcSR(runs, balls) {
  if (!balls) return "-";
  return ((runs / balls) * 100).toFixed(0);
}

function calcOvers(balls) {
  return Math.floor(balls / 6) + "." + (balls % 6);
}

function calcEcon(runs, balls) {
  if (balls === 0) return "-";
  return (runs / (balls / 6)).toFixed(2);
}

function formatStrikeRate(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  return Number(value).toFixed(2);
}

function buildBowlingRows(match) {
  const playerStats = match.playerStats || [];
  const timeline = match.timeline || [];
  const bowlingTeam = match.bowlingTeam;

  const bowlers = playerStats.filter(
    (p) => p.team === bowlingTeam && p.didBowl,
  );

  return bowlers.map((p) => {
    const bowlerBalls = timeline.filter((ball) => ball.bowler === p.name);

    const balls = bowlerBalls.filter(
      (ball) => ball.extraType !== "wide" && ball.extraType !== "no-ball",
    ).length;

    const runs = bowlerBalls.reduce((sum, ball) => {
      if (ball.extraType === "bye" || ball.extraType === "leg-bye") {
        return sum;
      }
      return sum + (ball.runsOffBat || 0) + (ball.extraRuns || 0);
    }, 0);

    const wickets = bowlerBalls.filter(
      (ball) => ball.isWicket && ball.wicketType !== "run-out",
    ).length;

    const wides = bowlerBalls.filter(
      (ball) => ball.extraType === "wide",
    ).length;

    const noBalls = bowlerBalls.filter(
      (ball) => ball.extraType === "no-ball",
    ).length;

    // Group valid balls by overNumber; a maiden is a complete over with 0 runs charged to bowler
    const overMap = {};
    bowlerBalls.forEach((ball) => {
      const key = ball.overNumber;
      if (!overMap[key]) overMap[key] = { validBalls: 0, runs: 0 };
      const isValid = ball.extraType !== "wide" && ball.extraType !== "no-ball";
      if (isValid) {
        overMap[key].validBalls += 1;
        if (ball.extraType !== "bye" && ball.extraType !== "leg-bye") {
          overMap[key].runs += (ball.runsOffBat || 0) + (ball.extraRuns || 0);
        }
      }
    });

    const maidens = Object.values(overMap).filter(
      (over) => over.validBalls === 6 && over.runs === 0,
    ).length;

    return {
      ...p,
      _balls: balls,
      _runs: runs,
      _wickets: wickets,
      _wides: wides,
      _noBalls: noBalls,
      _maidens: maidens,
    };
  });
}

function buildBattingRows(match) {
  const playerStats = match.playerStats || [];
  const striker = match.currentStriker || null;
  const nonStriker = match.currentNonStriker || null;
  const battingTeam = match.battingTeam;

  const batters = playerStats.filter((p) => p.team === battingTeam && p.didBat);

  // Build dismissal order map (timeline index where each batter was dismissed)
  const dismissalOrder = {};
  (match.timeline || []).forEach((ball, index) => {
    if (ball.isWicket && ball.batterDismissed) {
      dismissalOrder[ball.batterDismissed] = index;
    }
  });

  return [...batters].sort((a, b) => {
    const aIsStriker = a.name === striker;
    const bIsStriker = b.name === striker;
    const aIsNonStriker = a.name === nonStriker;
    const bIsNonStriker = b.name === nonStriker;

    if (aIsStriker) return -1;
    if (bIsStriker) return 1;
    if (aIsNonStriker) return -1;
    if (bIsNonStriker) return 1;

    // Dismissed batters: reverse order (most recently dismissed first)
    const aOrder = dismissalOrder[a.name] ?? -1;
    const bOrder = dismissalOrder[b.name] ?? -1;
    return bOrder - aOrder;
  });
}

function ScoreboardPage() {
  const { matchId } = useParams();
  const [searchParams] = useSearchParams();
  const socketRef = useRef(null);

  const [match, setMatch] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("batting");
  const [matchEndStatus, setMatchEndStatus] = useState({
    isMatchOver: false,
    resultMessage: "",
  });
  const isViewerMode = searchParams.get("viewer") === "1";

  useEffect(() => {
    if (!matchId) {
      return;
    }

    const socket = createMatchSocket();
    socketRef.current = socket;

    const applyMatchUpdate = (updatedMatch) => {
      setMatch(updatedMatch);

      const shouldEvaluateResult =
        (updatedMatch.inningsNumber === 2 ||
          typeof updatedMatch.firstInningsScore === "number") &&
        typeof updatedMatch.firstInningsScore === "number";

      if (shouldEvaluateResult) {
        const teamBPlayersCount = (updatedMatch.playerStats || []).filter(
          (player) => player.team === updatedMatch.battingTeam,
        ).length;

        setMatchEndStatus(
          checkMatchEnd({
            teamAScore: updatedMatch.firstInningsScore,
            teamBScore: updatedMatch.totalRuns,
            teamBWickets: updatedMatch.wickets,
            teamBPlayersCount,
            totalValidBalls: updatedMatch.ballsBowled,
            totalOvers: updatedMatch.totalOvers,
          }),
        );
      } else {
        setMatchEndStatus({ isMatchOver: false, resultMessage: "" });
      }
    };

    socket.emit("joinMatch", { matchId });
    socket.on("matchState", applyMatchUpdate);
    socket.on("score_updated", applyMatchUpdate);
    socket.on("match_completed", (payload) => {
      if (payload?.resultMessage) {
        setMatchEndStatus({
          isMatchOver: true,
          resultMessage: payload.resultMessage,
        });
      }
    });
    socket.on("connect_error", (err) => {
      setError(err.message);
    });

    let pollInterval;
    if (isViewerMode) {
      pollInterval = setInterval(async () => {
        try {
          const response = await getMatch(matchId);
          if (response?.match) {
            applyMatchUpdate(response.match);
          }
        } catch {
          // Keep socket as primary source; ignore polling failures.
        }
      }, 3000);
    }

    return () => {
      socket.off("matchState");
      socket.off("score_updated");
      socket.off("match_completed");
      socket.off("connect_error");
      socket.disconnect();
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isViewerMode, matchId]);

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <div className="mx-auto w-full max-w-6xl">
          <p className="rounded-lg border border-red-500/40 bg-red-900/40 p-4 text-red-200">
            {error}
          </p>
        </div>
      </main>
    );
  }

  if (!match) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-slate-300">Loading scoreboard...</p>
        </div>
      </main>
    );
  }

  const currentOver = buildCurrentOver(match.timeline || []);
  const oversSummary = buildOversSummary(match.timeline || []);
  const battingRows = buildBattingRows(match);
  const bowlingRows = buildBowlingRows(match);
  const firstInningsSummary = match.firstInningsSummary || null;

  const yetToBat = (match.playerStats || []).filter(
    (p) => p.team === match.battingTeam && !p.didBat,
  );

  const { extras, extrasByType } = (match.timeline || []).reduce(
    (acc, ball) => {
      acc.extras += ball.extraRuns || 0;
      if (ball.extraType && ball.extraType !== "none" && ball.extraRuns > 0) {
        acc.extrasByType[ball.extraType] =
          (acc.extrasByType[ball.extraType] || 0) + ball.extraRuns;
      }
      return acc;
    },
    { extras: 0, extrasByType: {} },
  );
  const oversBowled = Math.floor((match.ballsBowled || 0) / 6);
  const ballsInOver = (match.ballsBowled || 0) % 6;
  const remainingDots =
    // When an over has just completed (ballsInOver resets to 0 but balls have been bowled),
    // don't show any placeholders; otherwise fill up to 6 valid-ball slots
    match.ballsBowled > 0 && ballsInOver === 0 ? 0 : 6 - ballsInOver;
  const strikerPlayer = (match.playerStats || []).find(
    (p) => p.name === match.currentStriker,
  );
  const nonStrikerPlayer = (match.playerStats || []).find(
    (p) => p.name === match.currentNonStriker,
  );
  const currentBowlerProfile = (match.playerStats || []).find(
    (p) => p.team === match.bowlingTeam && p.name === match.currentBowler,
  );
  const currentBowlerRow =
    bowlingRows.find((p) => p.name === match.currentBowler) ||
    (currentBowlerProfile
      ? {
          ...currentBowlerProfile,
          _balls: 0,
          _runs: 0,
          _wickets: 0,
          _wides: 0,
          _noBalls: 0,
          _maidens: 0,
        }
      : null);
  const bowlingRowsForDisplay = currentBowlerRow
    ? [
        currentBowlerRow,
        ...bowlingRows.filter((p) => p.name !== currentBowlerRow.name),
      ]
    : bowlingRows;
  const totalValidBalls = match.ballsBowled || 0;
  const runRate =
    totalValidBalls > 0
      ? ((match.totalRuns / totalValidBalls) * 6).toFixed(2)
      : "0.00";
  const targetScore = match.targetScore || null;
  const runsNeeded = targetScore
    ? Math.max(0, targetScore - match.totalRuns)
    : null;
  const ballsLeft = targetScore
    ? Math.max(0, (match.totalOvers || 0) * 6 - totalValidBalls)
    : null;
  const requiredRunRate = targetScore
    ? ballsLeft > 0
      ? ((runsNeeded * 6) / ballsLeft).toFixed(2)
      : runsNeeded > 0
        ? "-"
        : "0.00"
    : null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Live Scoreboard
          </h1>
          {!isViewerMode ? (
            <div className="flex items-center gap-4 text-sm">
              <Link
                to={`/scorer/${matchId}`}
                className="font-medium text-emerald-300 hover:text-emerald-200"
              >
                Scorer Panel
              </Link>
              <Link
                to="/"
                className="font-medium text-sky-300 hover:text-sky-200"
              >
                Home
              </Link>
            </div>
          ) : null}
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/30">
          {matchEndStatus.isMatchOver && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-900/20 px-4 py-2 text-center text-sm font-medium text-amber-300">
              {matchEndStatus.resultMessage}
            </div>
          )}
          {match.status === "completed" && (
            <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-900/30 px-4 py-2 text-center text-sm font-semibold uppercase tracking-widest text-emerald-300">
              {match.wickets >= 10 ? "All Out" : "Innings Complete"}
            </div>
          )}
          {match.status === "innings" && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-900/20 px-4 py-2 text-center text-sm font-medium text-amber-300">
              Innings Break
            </div>
          )}
          <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
            {match.battingTeam} vs {match.bowlingTeam}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <p className="text-5xl font-extrabold text-white">
              {match.totalRuns}/{match.wickets}
            </p>
            <p className="pb-1 text-lg text-slate-300">
              Overs {match.oversBowled}
            </p>
          </div>
          {targetScore && (
            <p className="mt-2 text-sm font-medium text-indigo-300">
              Target: {targetScore} | Runs Req: {runsNeeded} | Balls Req:{" "}
              {ballsLeft} | RRR: {requiredRunRate}
            </p>
          )}

          {/* Tab switcher */}
          <div className="mt-6 flex gap-1 border-b border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab("batting")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "batting"
                  ? "border-b-2 border-emerald-400 text-emerald-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Batting
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("bowling")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "bowling"
                  ? "border-b-2 border-emerald-400 text-emerald-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Bowling
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "overview"
                  ? "border-b-2 border-emerald-400 text-emerald-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Overview
            </button>
            {firstInningsSummary ? (
              <button
                type="button"
                onClick={() => setActiveTab("first-innings")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "first-innings"
                    ? "border-b-2 border-emerald-400 text-emerald-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                1st Innings
              </button>
            ) : null}
          </div>

          {/* Batting tab */}
          {activeTab === "batting" && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="pb-2 pr-4">Batter</th>
                    <th className="pb-2 pr-4">Dismissal</th>
                    <th className="pb-2 pr-3 text-right">R</th>
                    <th className="pb-2 pr-3 text-right">B</th>
                    <th className="pb-2 pr-3 text-right">4s</th>
                    <th className="pb-2 pr-3 text-right">6s</th>
                    <th className="pb-2 text-right">SR</th>
                  </tr>
                </thead>
                <tbody>
                  {battingRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-4 text-center text-slate-400"
                      >
                        No batters yet
                      </td>
                    </tr>
                  ) : (
                    battingRows.map((player) => {
                      const isStriker = player.name === match.currentStriker;
                      const runs = player.batting?.runs ?? 0;
                      const balls = player.batting?.balls ?? 0;
                      const fours = player.batting?.fours ?? 0;
                      const sixes = player.batting?.sixes ?? 0;
                      return (
                        <tr
                          key={player._id || player.name}
                          className={`border-b border-slate-800/60 ${
                            isStriker ? "bg-emerald-900/20" : ""
                          }`}
                        >
                          <td className="py-2 pr-4 font-medium text-white">
                            {player.name}
                            {isStriker ? (
                              <span className="ml-1 text-emerald-400">*</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-4 text-slate-300">
                            {getDismissal(
                              player,
                              match.currentStriker,
                              match.currentNonStriker,
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-white">
                            {runs}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {balls}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {fours}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {sixes}
                          </td>
                          <td className="py-2 text-right text-slate-300">
                            {calcSR(runs, balls)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-700">
                    <td colSpan={7} className="pt-3 text-sm text-slate-400">
                      Extras: Wides ({extrasByType.wide || 0}), No Balls (
                      {extrasByType["no-ball"] || 0}), Byes (
                      {extrasByType.bye || 0}), Leg Byes (
                      {extrasByType["leg-bye"] || 0}), Total ({extras})
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={7}
                      className="pt-1 text-sm font-medium text-slate-300"
                    >
                      Total: {match.totalRuns}/{match.wickets} ({oversBowled}.
                      {ballsInOver} Ov, RR: {runRate})
                    </td>
                  </tr>
                </tfoot>
              </table>
              {yetToBat.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Yet to bat
                  </p>
                  <p className="text-sm text-slate-300">
                    {yetToBat.map((p) => p.name).join(", ")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Bowling tab */}
          {activeTab === "bowling" && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="pb-2 pr-4">Bowler</th>
                    <th className="pb-2 pr-3 text-right">O</th>
                    <th className="pb-2 pr-3 text-right">M</th>
                    <th className="pb-2 pr-3 text-right">R</th>
                    <th className="pb-2 pr-3 text-right">W</th>
                    <th className="pb-2 pr-3 text-right">ECON</th>
                    <th className="pb-2 pr-3 text-right">WD</th>
                    <th className="pb-2 text-right">NB</th>
                  </tr>
                </thead>
                <tbody>
                  {bowlingRowsForDisplay.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-4 text-center text-slate-400"
                      >
                        No bowlers yet
                      </td>
                    </tr>
                  ) : (
                    bowlingRowsForDisplay.map((player) => {
                      const isCurrent = player.name === match.currentBowler;
                      return (
                        <tr
                          key={player._id || player.name}
                          className={`border-b border-slate-800/60 ${
                            isCurrent ? "bg-emerald-900/20" : ""
                          }`}
                        >
                          <td className="py-2 pr-4 font-medium text-white">
                            {player.name}
                            {isCurrent ? (
                              <span className="ml-1 text-emerald-400">*</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {calcOvers(player._balls)}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {player._maidens}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-white">
                            {player._runs}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-white">
                            {player._wickets}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {calcEcon(player._runs, player._balls)}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {player._wides}
                          </td>
                          <td className="py-2 text-right text-slate-300">
                            {player._noBalls}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Overview tab */}
          {activeTab === "overview" && (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Batters
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {match.currentStriker} *
                </p>
                <p className="mt-1 text-slate-300">{match.currentNonStriker}</p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Current Bowler
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {match.currentBowler}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Current Over
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentOver.length > 0 ? (
                    currentOver.map((ballLabel, index) => (
                      <span
                        key={`${ballLabel}-${index}`}
                        className={`flex min-w-10 items-center justify-center rounded-full border px-3 py-1 text-sm font-semibold ${
                          ballLabel === "W"
                            ? "border-red-500/70 bg-red-500/20 text-red-200"
                            : ballLabel === "Wd"
                              ? "border-amber-400/70 bg-amber-400/20 text-amber-100"
                              : "border-slate-700 bg-slate-900 text-slate-100"
                        }`}
                      >
                        {ballLabel}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-400">No balls yet</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "first-innings" && firstInningsSummary && (
            <div className="mt-4 space-y-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                  {firstInningsSummary.battingTeam} 1st Innings
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {firstInningsSummary.totalRuns}/{firstInningsSummary.wickets}{" "}
                  ({firstInningsSummary.oversBowled} Ov)
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-4">Batter</th>
                      <th className="pb-2 pr-4">Dismissal</th>
                      <th className="pb-2 pr-3 text-right">R</th>
                      <th className="pb-2 pr-3 text-right">B</th>
                      <th className="pb-2 pr-3 text-right">4s</th>
                      <th className="pb-2 pr-3 text-right">6s</th>
                      <th className="pb-2 text-right">SR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firstInningsSummary.battingRows?.length ? (
                      firstInningsSummary.battingRows.map((player) => (
                        <tr
                          key={`first-innings-bat-${player.name}`}
                          className="border-b border-slate-800/60"
                        >
                          <td className="py-2 pr-4 font-medium text-white">
                            {player.name}
                          </td>
                          <td className="py-2 pr-4 text-slate-300 capitalize">
                            {player.dismissal}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-white">
                            {player.runs}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {player.balls}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {player.fours}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {player.sixes}
                          </td>
                          <td className="py-2 text-right text-slate-300">
                            {formatStrikeRate(player.strikeRate)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-4 text-center text-slate-400"
                        >
                          No batting data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-4">Bowler</th>
                      <th className="pb-2 pr-3 text-right">O</th>
                      <th className="pb-2 pr-3 text-right">M</th>
                      <th className="pb-2 pr-3 text-right">R</th>
                      <th className="pb-2 pr-3 text-right">W</th>
                      <th className="pb-2 pr-3 text-right">ECON</th>
                      <th className="pb-2 pr-3 text-right">WD</th>
                      <th className="pb-2 text-right">NB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firstInningsSummary.bowlingRows?.length ? (
                      firstInningsSummary.bowlingRows.map((player) => (
                        <tr
                          key={`first-innings-bowl-${player.name}`}
                          className="border-b border-slate-800/60"
                        >
                          <td className="py-2 pr-4 font-medium text-white">
                            {player.name}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {calcOvers(player.balls || 0)}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {player.maidens || 0}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-white">
                            {player.runs || 0}
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-white">
                            {player.wickets || 0}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {player.economy === null ||
                            player.economy === undefined
                              ? "-"
                              : Number(player.economy).toFixed(2)}
                          </td>
                          <td className="py-2 pr-3 text-right text-slate-300">
                            {player.wides || 0}
                          </td>
                          <td className="py-2 text-right text-slate-300">
                            {player.noBalls || 0}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-4 text-center text-slate-400"
                        >
                          No bowling data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Current over + mini batsman/bowler summary */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-300">
              Over {oversBowled + 1}:
            </p>
            <div className="flex flex-wrap gap-2">
              {currentOver.map((label, i) => (
                <span
                  key={`over-ball-${i}`}
                  className={`flex min-w-10 items-center justify-center rounded-full border px-3 py-1 text-sm font-semibold ${
                    label === "W"
                      ? "border-red-500/70 bg-red-500/20 text-red-200"
                      : label === "Wd"
                        ? "border-amber-400/70 bg-amber-400/20 text-amber-100"
                        : "border-slate-700 bg-slate-900 text-slate-100"
                  }`}
                >
                  {label}
                </span>
              ))}
              {Array.from({ length: remainingDots }).map((_, i) => (
                <span
                  key={`over-dot-${i}`}
                  className="flex min-w-10 items-center justify-center rounded-full border border-slate-700/40 px-3 py-1 text-sm font-semibold text-slate-600"
                >
                  ·
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 text-sm">
            {strikerPlayer && (
              <p className="text-white">
                <span className="font-medium">{match.currentStriker}*</span>{" "}
                {strikerPlayer.batting?.runs ?? 0}(
                {strikerPlayer.batting?.balls ?? 0})
              </p>
            )}
            {nonStrikerPlayer && (
              <p className="mt-1 text-slate-300">
                <span className="font-medium">{match.currentNonStriker}</span>{" "}
                {nonStrikerPlayer.batting?.runs ?? 0}(
                {nonStrikerPlayer.batting?.balls ?? 0})
              </p>
            )}
            {currentBowlerRow && (
              <p className="mt-2 text-slate-400">
                {match.currentBowler} &mdash;{" "}
                {calcOvers(currentBowlerRow._balls)}-{currentBowlerRow._wickets}
                /{currentBowlerRow._runs}
              </p>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">Overs Summary</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {oversSummary.length > 0 ? (
              [...oversSummary].reverse().map((over) => (
                <li
                  key={`over-summary-${over.overNumber}`}
                  className="rounded-md border border-slate-800 bg-slate-950/60 p-3"
                >
                  <span className="font-semibold text-slate-200">
                    {getOrdinalLabel(over.overNumber)} Over:
                  </span>{" "}
                  {over.balls.join(" ")}
                </li>
              ))
            ) : (
              <li>No balls yet.</li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}

export default ScoreboardPage;
