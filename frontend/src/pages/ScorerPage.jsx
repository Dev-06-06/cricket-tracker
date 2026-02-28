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
  batterDismissed: "",
};

function ScorerPage() {
  const { matchId } = useParams();
  const socketRef = useRef(null);

  const [match, setMatch] = useState(null);
  const [delivery, setDelivery] = useState(initialDelivery);
  const [error, setError] = useState("");
  const [showBatterModal, setShowBatterModal] = useState(false);
  const [selectedBatter, setSelectedBatter] = useState("");

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

  const currentOverBalls = useMemo(() => {
    if (!match?.timeline?.length) {
      return [];
    }

    const validTimeline = match.timeline.filter(
      (ball) =>
        ball.extraType === "none" ||
        ball.extraType === "bye" ||
        ball.extraType === "leg-bye",
    );

    return validTimeline.slice(-6).map((ball) => {
      if (ball.isWicket) {
        return "W";
      }

      return ball.runsOffBat + ball.extraRuns;
    });
  }, [match]);

  const submitDelivery = () => {
    if (!socketRef.current || !matchId) {
      return;
    }

    const payload = {
      runsOffBat: Number(delivery.runsOffBat),
      extraType: delivery.extraType,
      extraRuns: Number(delivery.extraRuns),
      isWicket: Boolean(delivery.isWicket),
      wicketType: delivery.isWicket ? delivery.wicketType : "none",
      batterDismissed: delivery.isWicket ? delivery.batterDismissed : "",
    };

    socketRef.current.emit("umpire_update", {
      matchId,
      deliveryData: payload,
    });

    setDelivery((previous) => ({
      ...initialDelivery,
      extraType: previous.extraType,
    }));
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
              onChange={(event) =>
                setDelivery((previous) => ({
                  ...previous,
                  isWicket: event.target.checked,
                  wicketType: event.target.checked
                    ? previous.wicketType
                    : "none",
                  batterDismissed: event.target.checked
                    ? previous.batterDismissed
                    : "",
                }))
              }
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

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Batter dismissed
              </span>
              <input
                type="text"
                disabled={disableWicketFields}
                value={delivery.batterDismissed}
                onChange={(event) =>
                  setDelivery((previous) => ({
                    ...previous,
                    batterDismissed: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring disabled:bg-slate-100"
              />
            </label>
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
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, index) => {
            const ballValue = currentOverBalls[index];

            return (
              <span
                key={index}
                className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                  ballValue === undefined
                    ? "border-slate-300 bg-white text-slate-400"
                    : "border-slate-900 bg-slate-900 text-white"
                }`}
              >
                {ballValue === undefined
                  ? "○"
                  : ballValue === 0
                    ? "•"
                    : ballValue}
              </span>
            );
          })}
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
    </main>
  );
}

export default ScorerPage;
