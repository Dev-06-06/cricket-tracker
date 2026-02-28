import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMatch } from "../services/api";
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

function ScoreboardPage() {
  const { matchId } = useParams();
  const socketRef = useRef(null);

  const [match, setMatch] = useState(null);
  const [error, setError] = useState("");

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
    socket.on("score_updated", (updatedMatch) => {
      setMatch(updatedMatch);
    });

    return () => {
      isMounted = false;
      socket.off("score_updated");
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

          <div className="mt-6 grid gap-4 md:grid-cols-3">
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
