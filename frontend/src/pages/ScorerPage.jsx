import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMatch } from "../services/api";
import { createMatchSocket } from "../services/socket";
import { checkMatchEnd } from "../utils/matchResult";

const initialDelivery = {
  runsOffBat: 0,
  extraType: "none",
  extraRuns: 0,
  isWicket: false,
  wicketType: "none",
};

function isValidBall(ball) {
  return (
    ball.extraType === "none" ||
    ball.extraType === "bye" ||
    ball.extraType === "leg-bye"
  );
}

function buildCurrentOver(timeline) {
  let validCount = 0;
  let currentOverBalls = [];
  for (const ball of timeline) {
    currentOverBalls.push(ball);
    if (isValidBall(ball)) {
      validCount += 1;
      if (validCount > 0 && validCount % 6 === 0) {
        currentOverBalls = [];
      }
    }
  }
  return currentOverBalls;
}

function ballLabel(ball) {
  if (ball.extraType === "wide") {
    return ball.extraRuns === 1 ? "Wd" : "Wd+" + (ball.extraRuns - 1);
  }
  if (ball.extraType === "no-ball") {
    return ball.runsOffBat === 0 ? "Nb" : "Nb+" + ball.runsOffBat;
  }
  if (ball.extraType === "bye") {
    return "B" + ball.extraRuns;
  }
  if (ball.isWicket) {
    return "W";
  }
  const runs = ball.runsOffBat + ball.extraRuns;
  if (runs === 0) {
    return "0";
  }
  return String(runs);
}

function ballToneClass(label) {
  if (label === "W") return "bg-red-900";
  if (label === "4") return "bg-blue-900";
  if (label === "6") return "bg-emerald-900";
  if (label.startsWith("Wd") || label.startsWith("Nb")) return "bg-amber-900";
  if (label.startsWith("B")) return "bg-slate-800";
  if (label === "0") return "bg-slate-600";
  return "bg-slate-700";
}

function calcBowlerStats(timeline, bowlerName) {
  const bowlerBalls = (timeline || []).filter((b) => b.bowler === bowlerName);
  const balls = bowlerBalls.filter(
    (b) => b.extraType !== "wide" && b.extraType !== "no-ball",
  ).length;
  const runs = bowlerBalls.reduce((sum, b) => {
    const extras =
      b.extraType !== "bye" && b.extraType !== "leg-bye" ? b.extraRuns || 0 : 0;
    return sum + (b.runsOffBat || 0) + extras;
  }, 0);
  const wickets = bowlerBalls.filter(
    (b) => b.isWicket && b.wicketType !== "run-out",
  ).length;
  return { balls, runs, wickets };
}

function BowlerStatsRow({ match }) {
  const bowlerName = match.currentBowler;
  if (!bowlerName) return null;
  const { balls, runs, wickets } = calcBowlerStats(match.timeline, bowlerName);
  const overs = `${Math.floor(balls / 6)}.${balls % 6}`;
  const econ = balls === 0 ? "-" : (runs / (balls / 6)).toFixed(2);
  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Bowling
      </p>
      <p className="mt-2 text-sm text-slate-800">
        <span className="font-medium">{bowlerName}</span> &mdash; {overs} ov{" "}
        {wickets}/{runs}&nbsp;&nbsp;Econ: {econ}
      </p>
    </section>
  );
}

function ScorerPage() {
  const { matchId } = useParams();
  const socketRef = useRef(null);

  const [match, setMatch] = useState(null);
  const [delivery, setDelivery] = useState(initialDelivery);
  const [dismissedBatter, setDismissedBatter] = useState("");
  const [error, setError] = useState("");
  const [showBatterModal, setShowBatterModal] = useState(false);
  const [selectedBatter, setSelectedBatter] = useState("");
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  const [selectedBowler, setSelectedBowler] = useState("");
  const [showSecondInningsModal, setShowSecondInningsModal] = useState(false);
  const [secondInningsStriker, setSecondInningsStriker] = useState("");
  const [secondInningsNonStriker, setSecondInningsNonStriker] = useState("");
  const [secondInningsBowler, setSecondInningsBowler] = useState("");
  const [matchEndStatus, setMatchEndStatus] = useState({
    isMatchOver: false,
    resultMessage: "",
  });

  useEffect(() => {
    if (!matchId) {
      return;
    }

    let isMounted = true;
    const socket = createMatchSocket();
    socketRef.current = socket;

    const loadMatch = async () => {
      try {
        const response = await getMatch(matchId);
        if (isMounted) {
          setMatch(response.match);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message);
        }
      }
    };

    loadMatch();

    socket.emit("join_match", matchId);
    socket.on("matchState", (updatedMatch) => {
      if (isMounted) {
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

        if (updatedMatch.status === "innings_complete") {
          setShowBatterModal(false);
          setShowBowlerModal(false);
          setShowSecondInningsModal(true);
          setSecondInningsStriker("");
          setSecondInningsNonStriker("");
          setSecondInningsBowler("");
          return;
        }

        setShowSecondInningsModal(false);
        if (
          (updatedMatch.striker === null || updatedMatch.nonStriker === null) &&
          updatedMatch.status === "innings"
        ) {
          setShowBatterModal(true);
          setSelectedBatter("");
        } else {
          setShowBatterModal(false);
        }
        if (
          updatedMatch.ballsBowled > 0 &&
          updatedMatch.ballsBowled % 6 === 0 &&
          updatedMatch.status === "innings"
        ) {
          setShowBowlerModal(true);
          setSelectedBowler("");
        }
      }
    });
    socket.on("innings_complete", () => {
      if (isMounted) {
        setShowBatterModal(false);
        setShowBowlerModal(false);
        setShowSecondInningsModal(true);
        setSecondInningsStriker("");
        setSecondInningsNonStriker("");
        setSecondInningsBowler("");
      }
    });
    socket.on("score_updated", (updatedMatch) => {
      setMatch(updatedMatch);
    });
    socket.on("match_completed", (payload) => {
      if (!isMounted) {
        return;
      }

      if (payload) {
        setMatch(payload);
      }

      if (payload?.resultMessage) {
        setMatchEndStatus({
          isMatchOver: true,
          resultMessage: payload.resultMessage,
        });
      }
    });

    return () => {
      isMounted = false;
      socket.off("matchState");
      socket.off("innings_complete");
      socket.off("score_updated");
      socket.off("match_completed");
      socket.disconnect();
    };
  }, [matchId]);

  const disableWicketFields = !delivery.isWicket;

  const runOptions = [0, 1, 2, 3, 4, 6];
  const extraOptions = [
    { label: "Wide", value: "wide" },
    { label: "No Ball", value: "no-ball" },
    { label: "Bye", value: "bye" },
    { label: "Leg Bye", value: "leg-bye" },
  ];

  const availableBatters = useMemo(() => {
    if (!match?.playerStats) return [];
    const occupiedBatter =
      match.currentStriker === null
        ? match.currentNonStriker
        : match.currentStriker;
    return match.playerStats.filter(
      (p) =>
        p.team === match.battingTeam && !p.isOut && p.name !== occupiedBatter,
    );
  }, [match]);

  const availableBowlers = useMemo(() => {
    if (!match?.playerStats) return [];
    return match.playerStats.filter((p) => p.team === match.bowlingTeam);
  }, [match]);

  const secondInningsBatters = useMemo(() => {
    if (!match?.playerStats) return [];
    return match.playerStats.filter((p) => p.team === match.battingTeam);
  }, [match]);

  const secondInningsStrikerOptions = useMemo(
    () =>
      secondInningsBatters.filter((p) => p.name !== secondInningsNonStriker),
    [secondInningsBatters, secondInningsNonStriker],
  );

  const secondInningsNonStrikerOptions = useMemo(
    () => secondInningsBatters.filter((p) => p.name !== secondInningsStriker),
    [secondInningsBatters, secondInningsStriker],
  );

  const dismissableBatters = useMemo(() => {
    if (!match?.playerStats) return [];
    return match.playerStats.filter(
      (p) => p.team === match.battingTeam && !p.isOut,
    );
  }, [match]);

  const currentOverBalls = useMemo(() => {
    if (!match?.timeline?.length) {
      return [];
    }
    return buildCurrentOver(match.timeline);
  }, [match]);

  const battingTeamStats = useMemo(() => {
    if (!match?.playerStats) return [];
    return match.playerStats.filter(
      (p) => p.team === match.battingTeam && p.didBat,
    );
  }, [match]);

  const nextBatterRole =
    match?.nextBatterFor === "nonStriker" ? "Non-Striker" : "Striker";

  const submitDelivery = () => {
    if (!socketRef.current || !matchId) {
      return;
    }

    if (matchEndStatus.isMatchOver) {
      return;
    }

    if (match?.status === "completed") {
      return;
    }

    if (showSecondInningsModal || match?.status === "innings_complete") {
      return;
    }

    if (delivery.isWicket && !dismissedBatter) {
      return;
    }

    const payload = {
      runsOffBat: Number(delivery.runsOffBat),
      extraType: delivery.extraType,
      extraRuns: Number(delivery.extraRuns),
      isWicket: Boolean(delivery.isWicket),
      wicketType: delivery.isWicket ? delivery.wicketType : "none",
      dismissedBatter: delivery.isWicket ? dismissedBatter : "",
      dismissedPlayerType: delivery.isWicket
        ? dismissedBatter === match?.currentNonStriker
          ? "nonStriker"
          : "striker"
        : undefined,
    };

    socketRef.current.emit("umpire_update", {
      matchId,
      deliveryData: payload,
    });

    setDelivery((previous) => ({
      ...initialDelivery,
      extraType: previous.extraType,
    }));
    setDismissedBatter("");
  };

  const undoLastDelivery = () => {
    if (!socketRef.current || !matchId) {
      return;
    }

    socketRef.current.emit("undo_delivery", { matchId });
  };

  const confirmNewBatter = () => {
    if (!selectedBatter || !socketRef.current) {
      return;
    }
    socketRef.current.emit("setNewBatter", { matchId, batter: selectedBatter });
    setShowBatterModal(false);
  };

  const confirmNewBowler = () => {
    if (!selectedBowler || !socketRef.current) {
      return;
    }
    socketRef.current.emit("setNewBowler", { matchId, bowler: selectedBowler });
    setShowBowlerModal(false);
  };

  const confirmSecondInningsOpeners = () => {
    if (
      !secondInningsStriker ||
      !secondInningsNonStriker ||
      !secondInningsBowler ||
      !socketRef.current
    ) {
      return;
    }

    if (secondInningsStriker === secondInningsNonStriker) {
      return;
    }

    socketRef.current.emit("setOpeners", {
      matchId,
      striker: secondInningsStriker,
      nonStriker: secondInningsNonStriker,
      bowler: secondInningsBowler,
    });

    setShowSecondInningsModal(false);
    setSecondInningsStriker("");
    setSecondInningsNonStriker("");
    setSecondInningsBowler("");
  };

  if (error) {
    return (
      <main className="app-shell max-w-4xl">
        <p className="rounded-lg bg-red-100 p-4 text-red-700">{error}</p>
      </main>
    );
  }

  if (!match) {
    return (
      <main className="app-shell max-w-4xl">
        <p className="text-slate-700">Loading match...</p>
      </main>
    );
  }

  const targetScore = match.targetScore || null;
  const runsNeeded = targetScore
    ? Math.max(0, targetScore - match.totalRuns)
    : null;
  const ballsLeft = targetScore
    ? Math.max(0, (match.totalOvers || 0) * 6 - (match.ballsBowled || 0))
    : null;
  const requiredRunRate = targetScore
    ? ballsLeft > 0
      ? ((runsNeeded * 6) / ballsLeft).toFixed(2)
      : runsNeeded > 0
        ? "-"
        : "0.00"
    : null;
  const currentRunRate =
    (match.ballsBowled || 0) > 0
      ? ((match.totalRuns * 6) / match.ballsBowled).toFixed(2)
      : "0.00";

  return (
    <main className="app-shell max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Scorer Panel</h1>
        <Link
          to={`/scoreboard/${matchId}`}
          className="text-sm font-medium text-blue-600"
        >
          Open Scoreboard
        </Link>
      </div>

      <section className="panel mb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          {match.battingTeam}
        </p>
        <p className="score-hero mt-1 text-slate-900">
          {match.totalRuns}/{match.wickets}
        </p>
        <p className="mt-1 text-sm font-medium text-slate-700">
          Over: {Math.floor((match.ballsBowled || 0) / 6)}.
          {(match.ballsBowled || 0) % 6}/{match.totalOvers}{" "}
          <span className="mx-2 text-slate-300">|</span> RR: {currentRunRate}
        </p>
        {targetScore && (
          <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700">
            Target: {targetScore} | Need {runsNeeded} from {ballsLeft} | RRR{" "}
            {requiredRunRate}
          </p>
        )}
        {matchEndStatus.isMatchOver && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            {matchEndStatus.resultMessage}
          </p>
        )}
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Striker:</span>
            <span>{match.currentStriker || "—"}</span>
            <button
              type="button"
              onClick={() =>
                socketRef.current?.emit("swapStriker", { matchId })
              }
              disabled={
                match.status !== "live" ||
                !match.currentStriker ||
                !match.currentNonStriker
              }
              className="btn ml-auto px-3 py-1 text-xs"
            >
              Swap Striker
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Bowler:</span>{" "}
            {match.currentBowler || "—"}
          </p>
        </div>
      </section>

      <BowlerStatsRow match={match} />

      <section className="panel p-6">
        <h2 className="text-lg font-semibold text-slate-900">Enter Delivery</h2>

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-slate-700">Runs</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {runOptions.map((runs) => (
              <button
                key={runs}
                type="button"
                onClick={() =>
                  setDelivery((previous) => ({
                    ...previous,
                    runsOffBat: runs,
                  }))
                }
                className={`btn w-full px-0 py-3 text-lg font-bold ${
                  delivery.runsOffBat === runs
                    ? "border-slate-900 bg-slate-900 text-white"
                    : ""
                }`}
              >
                {runs}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-slate-700">Extras</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDelivery((previous) => ({
                  ...previous,
                  extraType: "none",
                  extraRuns: 0,
                }))
              }
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                delivery.extraType === "none"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              None
            </button>
            {extraOptions.map((extra) => (
              <button
                key={extra.value}
                type="button"
                onClick={() =>
                  setDelivery((previous) => ({
                    ...previous,
                    extraType: extra.value,
                    extraRuns: previous.extraRuns > 0 ? previous.extraRuns : 1,
                  }))
                }
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                  delivery.extraType === extra.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {extra.label}
              </button>
            ))}
          </div>
          {delivery.extraType !== "none" ? (
            <div className="mt-3 w-full max-w-40">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Extra runs
                <input
                  type="number"
                  min={0}
                  value={delivery.extraRuns}
                  onChange={(event) =>
                    setDelivery((previous) => ({
                      ...previous,
                      extraRuns: Number(event.target.value || 0),
                    }))
                  }
                  className="field mt-1 py-1.5 text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={delivery.isWicket}
              onChange={(event) => {
                if (!event.target.checked) {
                  setDismissedBatter("");
                }
                setDelivery((previous) => ({
                  ...previous,
                  isWicket: event.target.checked,
                  wicketType: event.target.checked
                    ? previous.wicketType
                    : "none",
                }));
              }}
            />
            Wicket
          </label>

          {delivery.isWicket ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-1">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Wicket type
                </span>
                <select
                  disabled={disableWicketFields}
                  value={delivery.wicketType}
                  onChange={(event) =>
                    setDelivery((previous) => ({
                      ...previous,
                      wicketType: event.target.value,
                    }))
                  }
                  className="field disabled:bg-slate-100"
                >
                  <option value="none">None</option>
                  <option value="bowled">Bowled</option>
                  <option value="caught">Caught</option>
                  <option value="lbw">LBW</option>
                  <option value="run-out">Run Out</option>
                  <option value="stumped">Stumped</option>
                  <option value="hit-wicket">Hit Wicket</option>
                </select>
              </label>

              <label className="block md:col-span-1">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Dismissed batter
                </span>
                <select
                  value={dismissedBatter}
                  onChange={(event) => setDismissedBatter(event.target.value)}
                  className="field"
                >
                  <option value="">Select batter</option>
                  {dismissableBatters.map((batter) => (
                    <option key={batter.name} value={batter.name}>
                      {batter.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={submitDelivery}
            className="btn btn-dark w-full py-3 text-base font-semibold"
          >
            Submit Ball
          </button>
          <button
            type="button"
            onClick={undoLastDelivery}
            className="btn mt-3 w-full border-slate-300 bg-transparent"
          >
            Undo Last Ball
          </button>
        </div>
      </section>

      <section className="panel mt-6">
        <h2 className="text-lg font-semibold text-slate-900">Current Over</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">
            Over {match.oversBowled + 1}:
          </span>
          {currentOverBalls.map((ball, index) => {
            const label = ballLabel(ball);
            return (
              <span key={index} className={`chip-ball ${ballToneClass(label)}`}>
                {label}
              </span>
            );
          })}
          {Array.from({
            length: Math.max(
              0,
              6 - currentOverBalls.filter(isValidBall).length,
            ),
          }).map((_, index) => (
            <span
              key={`placeholder-${index}`}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 text-sm"
            >
              ○
            </span>
          ))}
        </div>
      </section>

      <section className="panel mt-6">
        <h2 className="text-lg font-semibold text-slate-900">Batsman Stats</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="pb-2 text-left">Batter</th>
                <th className="pb-2 text-left">Status</th>
                <th className="pb-2 pr-2 text-right">R</th>
                <th className="pb-2 pr-2 text-right">B</th>
                <th className="pb-2 pr-2 text-right">4s</th>
                <th className="pb-2 pr-2 text-right">6s</th>
                <th className="pb-2 text-right">SR</th>
              </tr>
            </thead>
            <tbody>
              {battingTeamStats.map((p) => {
                const runs = p.batting?.runs ?? 0;
                const balls = p.batting?.balls ?? 0;
                const sr = balls > 0 ? ((runs / balls) * 100).toFixed(1) : "-";
                const isStriker = p.name === match.currentStriker;
                const isNonStriker = p.name === match.currentNonStriker;
                const status = p.isOut
                  ? p.dismissalType || "out"
                  : isStriker || isNonStriker
                    ? "batting"
                    : "not out";
                return (
                  <tr
                    key={p.name}
                    className={`border-b border-slate-100 ${isStriker ? "bg-emerald-50" : ""}`}
                  >
                    <td className="py-2 font-medium">
                      {p.name}
                      {isStriker && (
                        <span className="ml-1 text-emerald-600">*</span>
                      )}
                    </td>
                    <td className="py-2 capitalize text-slate-500">{status}</td>
                    <td className="py-2 pr-2 text-right">{runs}</td>
                    <td className="py-2 pr-2 text-right">{balls}</td>
                    <td className="py-2 pr-2 text-right">
                      {p.batting?.fours ?? 0}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {p.batting?.sixes ?? 0}
                    </td>
                    <td className="py-2 text-right">{sr}</td>
                  </tr>
                );
              })}
              {battingTeamStats.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-2 text-center text-slate-400">
                    No batters yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel mt-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Recent Deliveries
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {match.timeline
            .slice()
            .reverse()
            .slice(0, 10)
            .map((ball, index) => (
              <li
                key={`${ball.overNumber}-${ball.ballInOver}-${index}`}
                className="rounded-md bg-slate-50 p-3"
              >
                Over {ball.overNumber}.{ball.ballInOver} | Runs:{" "}
                {ball.runsOffBat} + Extras: {ball.extraRuns} ({ball.extraType})
                {ball.isWicket ? ` | Wicket: ${ball.wicketType}` : ""}
              </li>
            ))}
          {match.timeline.length === 0 ? <li>No deliveries yet.</li> : null}
        </ul>
      </section>

      {showBatterModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Select New {nextBatterRole}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose the next batter for the {nextBatterRole.toLowerCase()}{" "}
              position.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                {nextBatterRole}
              </span>
              <select
                value={selectedBatter}
                onChange={(event) => setSelectedBatter(event.target.value)}
                className="field"
              >
                <option value="">Select {nextBatterRole.toLowerCase()}</option>
                {availableBatters.map((p) => (
                  <option key={p._id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={confirmNewBatter}
              disabled={!selectedBatter}
              className="btn btn-dark mt-5 w-full disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}

      {showSecondInningsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Set Second Innings Openers
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Select striker, non-striker, and bowler to start the second
              innings.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Striker
              </span>
              <select
                value={secondInningsStriker}
                onChange={(event) => {
                  const nextStriker = event.target.value;
                  setSecondInningsStriker(nextStriker);
                  if (nextStriker && nextStriker === secondInningsNonStriker) {
                    setSecondInningsNonStriker("");
                  }
                }}
                className="field"
              >
                <option value="">Select striker</option>
                {secondInningsStrikerOptions.map((p) => (
                  <option key={p._id || p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Non-striker
              </span>
              <select
                value={secondInningsNonStriker}
                onChange={(event) => {
                  const nextNonStriker = event.target.value;
                  setSecondInningsNonStriker(nextNonStriker);
                  if (
                    nextNonStriker &&
                    nextNonStriker === secondInningsStriker
                  ) {
                    setSecondInningsStriker("");
                  }
                }}
                className="field"
              >
                <option value="">Select non-striker</option>
                {secondInningsNonStrikerOptions.map((p) => (
                  <option key={p._id || p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Bowler
              </span>
              <select
                value={secondInningsBowler}
                onChange={(event) => setSecondInningsBowler(event.target.value)}
                className="field"
              >
                <option value="">Select bowler</option>
                {availableBowlers.map((p) => (
                  <option key={p._id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={confirmSecondInningsOpeners}
              disabled={
                !secondInningsStriker ||
                !secondInningsNonStriker ||
                !secondInningsBowler ||
                secondInningsStriker === secondInningsNonStriker
              }
              className="btn btn-dark mt-5 w-full disabled:opacity-50"
            >
              Start Second Innings
            </button>
          </div>
        </div>
      ) : null}

      {/* Bowler modal is suppressed while the batter modal is visible — batter takes priority */}
      {showBowlerModal && !showBatterModal && !showSecondInningsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Select New Bowler
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose the bowler for the next over.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Bowler
              </span>
              <select
                value={selectedBowler}
                onChange={(event) => setSelectedBowler(event.target.value)}
                className="field"
              >
                <option value="">Select a bowler</option>
                {availableBowlers.map((p) => (
                  <option key={p._id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={confirmNewBowler}
              disabled={!selectedBowler}
              className="btn btn-dark mt-5 w-full disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default ScorerPage;
