import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createMatchSocket } from "../services/socket";

function isValidBall(ball) {
  return (
    ball.extraType === "none" ||
    ball.extraType === "bye" ||
    ball.extraType === "leg-bye"
  );
}

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

function buildCurrentOver(timeline = []) {
  let validBallCount = 0;
  let overBalls = [];

  for (const ball of timeline) {
    if (validBallCount === 0) {
      overBalls = [];
    }

    overBalls.push(getBallLabel(ball));

    if (isValidBall(ball)) {
      validBallCount += 1;

      if (validBallCount === 6) {
        validBallCount = 0;
      }
    }
  }

  return overBalls;
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

function buildBowlingRows(match) {
  const playerStats = match.playerStats || [];
  const timeline = match.timeline || [];

  const bowlers = playerStats.filter((p) => p.didBowl);

  return bowlers.map((p) => {
    const bowlerBalls = timeline.filter((ball) => ball.bowler === p.name);

    const balls = bowlerBalls.filter(
      (ball) => ball.extraType !== "wide" && ball.extraType !== "no-ball",
    ).length;

    const runs = bowlerBalls.reduce((sum, ball) => {
      const extraRuns =
        ball.extraType !== "bye" && ball.extraType !== "leg-bye"
          ? ball.extraRuns || 0
          : 0;
      return sum + (ball.runsOffBat || 0) + extraRuns;
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
      const isValid =
        ball.extraType !== "wide" && ball.extraType !== "no-ball";
      if (isValid) {
        overMap[key].validBalls += 1;
        const extraRuns =
          ball.extraType !== "bye" && ball.extraType !== "leg-bye"
            ? ball.extraRuns || 0
            : 0;
        overMap[key].runs += (ball.runsOffBat || 0) + extraRuns;
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

  const batters = playerStats.filter((p) => p.didBat);

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
  const socketRef = useRef(null);

  const [match, setMatch] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("batting");

  useEffect(() => {
    if (!matchId) {
      return;
    }

    const socket = createMatchSocket();
    socketRef.current = socket;

    socket.emit("joinMatch", { matchId });
    socket.on("matchState", (updatedMatch) => {
      setMatch(updatedMatch);
    });
    socket.on("connect_error", (err) => {
      setError(err.message);
    });

    return () => {
      socket.off("matchState");
      socket.off("connect_error");
      socket.disconnect();
    };
  }, [matchId]);

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
  const battingRows = buildBattingRows(match);
  const bowlingRows = buildBowlingRows(match);

  const extras = (match.timeline || []).reduce(
    (sum, ball) => sum + (ball.extraRuns || 0),
    0,
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
  const currentBowlerRow = bowlingRows.find(
    (p) => p.name === match.currentBowler,
  );
  const totalValidBalls = match.ballsBowled || 0;
  const runRate =
    totalValidBalls > 0
      ? ((match.totalRuns / totalValidBalls) * 6).toFixed(2)
      : "0.00";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Live Scoreboard
          </h1>
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
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-black/30">
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
                      const isStriker =
                        player.name === match.currentStriker;
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
                    <td
                      colSpan={7}
                      className="pt-3 text-sm text-slate-400"
                    >
                      Extras: {extras}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={7}
                      className="pt-1 text-sm font-medium text-slate-300"
                    >
                      Total: {match.totalRuns}/{match.wickets} (
                      {oversBowled}.{ballsInOver} Ov, RR: {runRate})
                    </td>
                  </tr>
                </tfoot>
              </table>
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
                  {bowlingRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-4 text-center text-slate-400"
                      >
                        No bowlers yet
                      </td>
                    </tr>
                  ) : (
                    bowlingRows.map((player) => {
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
                {calcOvers(currentBowlerRow._balls)}-
                {currentBowlerRow._wickets}/{currentBowlerRow._runs}
              </p>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">
            Recent Deliveries
          </h2>
          <ul className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
            {match.timeline
              .slice()
              .reverse()
              .slice(0, 12)
              .map((ball, index) => {
                const display = getBallLabel(ball);
                return (
                  <li
                    key={`${ball.overNumber}-${ball.ballInOver}-${index}`}
                    className="rounded-md border border-slate-800 bg-slate-950/60 p-3"
                  >
                    {display}
                    {ball.isWicket && ball.wicketType !== "none"
                      ? ` · ${ball.wicketType}`
                      : ""}
                  </li>
                );
              })}
            {match.timeline.length === 0 ? <li>No balls yet.</li> : null}
          </ul>
        </section>
      </div>
    </main>
  );
}

export default ScoreboardPage;
