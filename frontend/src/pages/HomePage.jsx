import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getCompletedMatches,
  getLiveMatches,
  getUpcomingMatches,
} from "../services/api";

function HomePage() {
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [completedMatches, setCompletedMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    let pollTimer = null;

    const loadMatches = async () => {
      try {
        const [upcomingResponse, liveResponse, completedResponse] =
          await Promise.all([
            getUpcomingMatches(),
            getLiveMatches(),
            getCompletedMatches(),
          ]);

        if (!isMounted) {
          return;
        }

        setUpcomingMatches(upcomingResponse.matches || []);
        setLiveMatches(liveResponse.matches || []);
        setCompletedMatches(completedResponse.matches || []);
        setError("");
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message || "Unable to load matches");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          pollTimer = setTimeout(loadMatches, 5000);
        }
      }
    };

    loadMatches();

    return () => {
      isMounted = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, []);

  return (
    <main className="app-shell max-w-5xl">
      <h1 className="page-title">Viewer Mode</h1>
      <p className="page-subtitle">
        Follow live, upcoming, and completed matches in one place.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <section className="panel mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Live Matches</h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-600">Loading matches...</p>
        ) : liveMatches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No live matches yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {liveMatches.map((match) => (
              <MatchRow
                key={match._id}
                match={match}
                actionLabel="Open Scoreboard"
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Upcoming Matches
        </h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-600">Loading matches...</p>
        ) : upcomingMatches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No upcoming matches.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {upcomingMatches.map((match) => (
              <MatchRow
                key={match._id}
                match={match}
                actionLabel="Watch Toss"
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Completed Matches
        </h2>
        {loading ? (
          <p className="mt-3 text-sm text-slate-600">Loading matches...</p>
        ) : completedMatches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No completed matches.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {completedMatches.map((match) => (
              <MatchRow
                key={match._id}
                match={match}
                actionLabel="View Scoreboard"
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function MatchRow({ match, actionLabel }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">
            {match.team1Name} vs {match.team2Name}
          </p>
          <p className="text-xs text-slate-500">
            {match.status} • {match.totalOvers} overs
          </p>
        </div>
        {actionLabel ? (
          <Link
            to={`/scoreboard/${match._id}?viewer=1`}
            className="btn px-3 py-1 text-xs"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-600">
        {match.team1Name}:{" "}
        {(match.team1Players || []).map((p) => p.name).join(", ") || "—"}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        {match.team2Name}:{" "}
        {(match.team2Players || []).map((p) => p.name).join(", ") || "—"}
      </p>
    </article>
  );
}

export default HomePage;
