import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createMatchSocket } from "../services/socket";
import { getMatch } from "../services/api";

const runOptions = [0, 1, 2, 3, 4, 6];

function UmpireScorerPage() {
  const { matchId } = useParams();
  console.log("matchId:", matchId);

  const socketRef = useRef(null);
  const [match, setMatch] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!matchId) {
      return;
    }

    let isMounted = true;
    const socket = createMatchSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      if (isMounted) setConnected(true);
    });
    socket.on("disconnect", () => {
      if (isMounted) setConnected(false);
    });

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

    console.log("Joining match:", matchId);
    socket.emit("joinMatch", { matchId });

    socket.on("matchState", (updatedMatch) => {
      if (isMounted) {
        setMatch(updatedMatch);
      }
    });

    socket.on("score_updated", (updatedMatch) => {
      if (isMounted) {
        setMatch(updatedMatch);
      }
    });

    return () => {
      isMounted = false;
      socket.off("connect");
      socket.off("disconnect");
      socket.off("matchState");
      socket.off("score_updated");
      socket.disconnect();
    };
  }, [matchId]);

  const recordDelivery = (runs) => {
    const socket = socketRef.current;
    if (!socket) {
      console.error("Socket not connected");
      return;
    }

    console.log("Delivery emitted", { matchId, runs });
    socket.emit("umpire_update", {
      matchId,
      deliveryData: {
        runsOffBat: runs,
        extraType: "none",
        extraRuns: 0,
        isWicket: false,
        wicketType: "none",
        batterDismissed: "",
      },
    });
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
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-slate-900">Umpire Scorer</h1>
        <div className="flex items-center gap-3">
          {!connected && (
            <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
              Disconnected
            </span>
          )}
          <Link
            to={`/scoreboard/${matchId}`}
            className="text-sm font-medium text-blue-600"
          >
            Open Scoreboard
          </Link>
        </div>
      </div>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xl font-semibold text-slate-900">
          {match.battingTeam} {match.totalRuns}/{match.wickets}
        </p>
        <p className="mt-1 text-slate-600">Overs: {match.oversBowled}</p>
        <p className="mt-1 text-sm text-slate-600">
          Striker:{" "}
          {match.currentStriker ?? (
            <span className="text-amber-600">not set</span>
          )}{" "}
          | Non-Striker:{" "}
          {match.currentNonStriker ?? (
            <span className="text-amber-600">not set</span>
          )}{" "}
          | Bowler:{" "}
          {match.currentBowler ?? (
            <span className="text-amber-600">not set</span>
          )}
        </p>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Record Runs
        </h2>
        <div className="flex flex-wrap gap-3">
          {runOptions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => recordDelivery(r)}
              className="h-16 w-16 rounded-xl border border-slate-300 bg-white text-xl font-bold text-slate-800 shadow-sm hover:bg-slate-900 hover:text-white active:scale-95"
            >
              {r}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

export default UmpireScorerPage;
