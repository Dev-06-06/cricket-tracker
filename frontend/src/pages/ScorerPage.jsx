import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMatch } from "../services/api";
import { createMatchSocket } from "../services/socket";

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

function ballColor(label) {
  if (label === "W") return "#7f1d1d";
  if (label === "4") return "#1e3a5f";
  if (label === "6") return "#1a3a1a";
  if (label.startsWith("Wd") || label.startsWith("Nb")) return "#3b2a00";
  if (label.startsWith("B")) return "#1f2937";
  if (label === "0") return "rgba(255,255,255,0.08)";
  return "rgba(255,255,255,0.12)";
}

function calcBowlerStats(timeline, bowlerName) {
  const bowlerBalls = (timeline || []).filter((b) => b.bowler === bowlerName);
  const balls = bowlerBalls.filter(
    (b) => b.extraType !== "wide" && b.extraType !== "no-ball",
  ).length;
  const runs = bowlerBalls.reduce((sum, b) => {
    const extras =
      b.extraType !== "bye" && b.extraType !== "leg-bye"
        ? b.extraRuns || 0
        : 0;
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
        if (updatedMatch.striker === null && updatedMatch.status === "innings") {
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
    socket.on("score_updated", (updatedMatch) => {
      setMatch(updatedMatch);
    });

    return () => {
      isMounted = false;
      socket.off("matchState");
      socket.off("score_updated");
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
    return match.playerStats.filter(
      (p) =>
        p.team === match.battingTeam &&
        !p.isOut &&
        p.name !== match.currentNonStriker,
    );
  }, [match]);

  const availableBowlers = useMemo(() => {
    if (!match?.playerStats) return [];
    return match.playerStats.filter((p) => p.team === match.bowlingTeam);
  }, [match]);

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

  const submitDelivery = () => {
    if (!socketRef.current || !matchId) {
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
      batterDismissed: delivery.isWicket ? dismissedBatter : "",
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

  if (error) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10">
        <p className="rounded-lg bg-red-100 p-4 text-red-700">{error}</p>
      </main>
    );
  }

  if (!match) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10">
        <p className="text-slate-700">Loading match...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-slate-900">Scorer Panel</h1>
        <Link
          to={`/scoreboard/${matchId}`}
          className="text-sm font-medium text-blue-600"
        >
          Open Scoreboard
        </Link>
      </div>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xl font-semibold text-slate-900">
          {match.battingTeam} {match.totalRuns}/{match.wickets}
        </p>
        <p className="mt-1 text-slate-600">Overs: {match.oversBowled}</p>
        <p className="mt-1 text-sm text-slate-600">
          Striker: {match.currentStriker} | Non-Striker:{" "}
          {match.currentNonStriker} | Bowler: {match.currentBowler}
        </p>
      </section>

      <BowlerStatsRow match={match} />

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Enter Delivery</h2>

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-slate-700">Runs</p>
          <div className="flex flex-wrap gap-2">
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
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  delivery.runsOffBat === runs
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
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
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                delivery.extraType === "none"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700"
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
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  delivery.extraType === extra.value
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                {extra.label}
              </button>
            ))}
          </div>
          <div className="mt-3 max-w-44">
            <label className="block text-sm text-slate-700">
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring"
              />
            </label>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 p-4">
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

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block">
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring disabled:bg-slate-100"
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

            {delivery.isWicket && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Dismissed batter
                </span>
                <select
                  value={dismissedBatter}
                  onChange={(event) => setDismissedBatter(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring"
                >
                  <option value="">Select batter</option>
                  {dismissableBatters.map((batter) => (
                    <option key={batter.name} value={batter.name}>
                      {batter.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={submitDelivery}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Submit Ball
          </button>
          <button
            type="button"
            onClick={undoLastDelivery}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Undo Last Ball
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Current Over</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">
            Over {match.oversBowled + 1}:
          </span>
          {currentOverBalls.map((ball, index) => {
            const label = ballLabel(ball);
            return (
              <span
                key={index}
                style={{ backgroundColor: ballColor(label) }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
              >
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

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
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
                  const sr =
                    balls > 0 ? ((runs / balls) * 100).toFixed(1) : "-";
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
                      <td className="py-2 capitalize text-slate-500">
                        {status}
                      </td>
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

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
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
              Select New Batter
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose the next batter to replace the dismissed player.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Batter
              </span>
              <select
                value={selectedBatter}
                onChange={(event) => setSelectedBatter(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring"
              >
                <option value="">Select a batter</option>
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
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}

      {/* Bowler modal is suppressed while the batter modal is visible — batter takes priority */}
      {showBowlerModal && !showBatterModal ? (
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring"
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
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
