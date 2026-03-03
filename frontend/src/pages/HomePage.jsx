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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
            Live Matches
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              <span className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          </h2>
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            Auto-refreshing
          </div>
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-slate-600">Loading matches...</p>
        ) : liveMatches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No live matches yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {liveMatches.map((match) => (
              <MatchRow
                key={match._id}
                match={match}
                actionLabel="Open Scoreboard"
                variant="live"
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
          <div className="mt-4 space-y-2.5">
            {upcomingMatches.map((match) => (
              <MatchRow
                key={match._id}
                match={match}
                actionLabel="Watch Toss"
                variant="upcoming"
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
          <div className="mt-4 space-y-2.5">
            {completedMatches.map((match) => (
              <MatchRow
                key={match._id}
                match={match}
                actionLabel="View Scoreboard"
                variant="completed"
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function MatchRow({ match, actionLabel, variant = "upcoming" }) {
  const players1 = match.team1Players || [];
  const players2 = match.team2Players || [];
  const hasInningsStarted =
    Number(match.totalRuns || 0) > 0 ||
    Number(match.wickets || 0) > 0 ||
    Number(match.ballsBowled || 0) > 0;
  const liveScoreValue = hasInningsStarted
    ? `${match.totalRuns || 0}/${match.wickets || 0}`
    : "0/0";
  const liveOversValue =
    match.oversBowled !== undefined && match.oversBowled !== null
      ? `(${match.oversBowled} ov)`
      : "";

  const completedResultValue =
    match.resultMessage ||
    (typeof match.firstInningsScore === "number"
      ? Number(match.totalRuns || 0) > Number(match.firstInningsScore)
        ? `${match.battingTeam || "Chasing team"} won by ${Math.max(0, 10 - Number(match.wickets || 0))} wickets`
        : Number(match.totalRuns || 0) < Number(match.firstInningsScore)
          ? `${match.bowlingTeam || "Defending team"} won by ${Number(match.firstInningsScore) - Number(match.totalRuns || 0)} runs`
          : "Match Tied"
      : "Result unavailable");

  if (variant === "live") {
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold tracking-tight text-slate-900">
              {match.team1Name}{" "}
              <span className="mx-1.5 text-slate-400">vs</span>{" "}
              {match.team2Name}
            </p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums text-slate-900">
              {liveScoreValue}
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-500">
              {liveOversValue}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="status-live">LIVE</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {match.totalOvers} overs
              </span>
            </div>
          </div>
          {actionLabel ? (
            <Link
              to={`/scoreboard/${match._id}?viewer=1`}
              className="btn btn-primary ml-auto"
            >
              {actionLabel}
            </Link>
          ) : null}
        </div>

        <div className="mt-4 space-y-2.5">
          <PlayerAvatars teamName={match.team1Name} players={players1} />
          <PlayerAvatars teamName={match.team2Name} players={players2} />
        </div>
      </article>
    );
  }

  if (variant === "completed") {
    return (
      <article className="rounded-xl border border-slate-200 bg-slate-100/80 p-3 opacity-85">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {match.team1Name} vs {match.team2Name}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-600">
              {completedResultValue}
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
        <div className="mt-2 space-y-2">
          <PlayerAvatars teamName={match.team1Name} players={players1} muted />
          <PlayerAvatars teamName={match.team2Name} players={players2} muted />
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-slate-900">
            {match.team1Name} vs {match.team2Name}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {match.totalOvers} overs
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
      <div className="mt-2 space-y-2">
        <PlayerAvatars teamName={match.team1Name} players={players1} />
        <PlayerAvatars teamName={match.team2Name} players={players2} />
      </div>
    </article>
  );
}

function PlayerAvatars({ teamName, players, muted = false }) {
  const allPlayers = (players || []).filter((player) => player?.name);
  const visiblePlayers = allPlayers.slice(0, 6);
  const overflowCount = Math.max(0, allPlayers.length - visiblePlayers.length);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`text-xs font-medium ${muted ? "text-slate-500" : "text-slate-600"}`}
      >
        {teamName}
      </span>
      <div className="flex items-center -space-x-1">
        {visiblePlayers.length > 0 ? (
          visiblePlayers.map((player, index) => (
            <span
              key={`${player.name}-${index}`}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                muted
                  ? "border-slate-200 bg-slate-200 text-slate-600"
                  : "border-slate-300 bg-slate-100 text-slate-700"
              }`}
              title={player.name}
            >
              {player.name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part.charAt(0))
                .join("")
                .toUpperCase() || "?"}
            </span>
          ))
        ) : (
          <span
            className={`text-xs ${muted ? "text-slate-400" : "text-slate-500"}`}
          >
            —
          </span>
        )}
      </div>
      {overflowCount > 0 ? (
        <span
          className={`text-[11px] font-medium ${muted ? "text-slate-500" : "text-slate-600"}`}
        >
          +{overflowCount} more
        </span>
      ) : null}
    </div>
  );
}

export default HomePage;
