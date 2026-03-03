import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  API_BASE_URL,
  createUpcomingMatch,
  deleteMatch,
  getCompletedMatches,
  getLiveMatches,
  getPlayers,
  getUpcomingMatches,
  startMatch,
} from "../services/api";
import { UMPIRE_AUTH_KEY } from "./UmpireLoginPage";

function UmpireSetupPage() {
  const navigate = useNavigate();

  const [players, setPlayers] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [completedMatches, setCompletedMatches] = useState([]);

  const [team1Name, setTeam1Name] = useState("Team 1");
  const [team2Name, setTeam2Name] = useState("Team 2");
  const [team1Players, setTeam1Players] = useState([]);
  const [team2Players, setTeam2Players] = useState([]);
  const [totalOvers, setTotalOvers] = useState(5);

  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerPhotoUrl, setNewPlayerPhotoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    const [playersResponse, upcomingResponse, liveResponse, completedResponse] =
      await Promise.all([
        getPlayers(),
        getUpcomingMatches(),
        getLiveMatches(),
        getCompletedMatches(),
      ]);

    setPlayers(playersResponse.players || []);
    setUpcomingMatches(upcomingResponse.matches || []);
    setLiveMatches(liveResponse.matches || []);
    setCompletedMatches(completedResponse.matches || []);
  };

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        await loadDashboard();
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message || "Unable to load umpire dashboard");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  const playerById = useMemo(() => {
    const map = {};
    players.forEach((player) => {
      map[player._id] = player;
    });
    return map;
  }, [players]);

  const unassignedPlayers = players.filter(
    (player) =>
      !team1Players.includes(player._id) && !team2Players.includes(player._id),
  );

  const movePlayerTo = (playerId, destination) => {
    if (!playerId) return;

    if (destination === "team1") {
      setTeam1Players((prev) =>
        prev.includes(playerId) ? prev : [...prev, playerId],
      );
      setTeam2Players((prev) => prev.filter((id) => id !== playerId));
      return;
    }

    if (destination === "team2") {
      setTeam2Players((prev) =>
        prev.includes(playerId) ? prev : [...prev, playerId],
      );
      setTeam1Players((prev) => prev.filter((id) => id !== playerId));
      return;
    }

    setTeam1Players((prev) => prev.filter((id) => id !== playerId));
    setTeam2Players((prev) => prev.filter((id) => id !== playerId));
  };

  const addPlayer = async () => {
    const name = newPlayerName.trim();
    if (!name) return;

    try {
      setError("");
      const response = await fetch(`${API_BASE_URL}/api/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          photoUrl: newPlayerPhotoUrl.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "Unable to add player");
      }

      setPlayers((prev) => [...prev, data.player]);
      setNewPlayerName("");
      setNewPlayerPhotoUrl("");
    } catch (requestError) {
      setError(requestError.message || "Unable to add player");
    }
  };

  const resetForm = () => {
    setTeam1Name("Team 1");
    setTeam2Name("Team 2");
    setTeam1Players([]);
    setTeam2Players([]);
    setTotalOvers(5);
  };

  const handleCreateUpcoming = async () => {
    if (!team1Name.trim() || !team2Name.trim()) {
      setError("Both team names are required");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await createUpcomingMatch({
        team1Name: team1Name.trim(),
        team2Name: team2Name.trim(),
        team1PlayerIds: team1Players,
        team2PlayerIds: team2Players,
        totalOvers,
      });

      await loadDashboard();
      resetForm();
    } catch (requestError) {
      setError(requestError.message || "Unable to create upcoming match");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartMatch = async (matchId) => {
    try {
      setError("");
      await startMatch(matchId);
      await loadDashboard();
      navigate(`/umpire/toss/${matchId}`);
    } catch (requestError) {
      setError(requestError.message || "Unable to start match");
    }
  };

  const handleResumeMatch = (match) => {
    if (match.status === "toss") {
      navigate(`/umpire/toss/${match._id}`);
      return;
    }
    navigate(`/umpire/scorer/${match._id}`);
  };

  const handleDeleteMatch = async (match) => {
    const confirmed = window.confirm(
      `Delete match ${match.team1Name} vs ${match.team2Name}?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setError("");
      await deleteMatch(match._id);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message || "Unable to delete match");
    }
  };

  const handleExitUmpireMode = () => {
    sessionStorage.removeItem(UMPIRE_AUTH_KEY);
    navigate("/umpire/login", { replace: true });
  };

  if (loading) {
    return (
      <main className="app-shell">
        <p className="text-slate-700">Loading umpire dashboard...</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Umpire Dashboard</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExitUmpireMode}
            className="btn px-3 py-1 text-xs"
          >
            Exit Umpire Mode
          </button>
          <Link to="/" className="btn px-3 py-1 text-xs">
            Home
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <section className="panel mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Create Upcoming Match
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <input
            value={team1Name}
            onChange={(e) => setTeam1Name(e.target.value)}
            className="field"
            placeholder="Team 1"
          />
          <input
            value={team2Name}
            onChange={(e) => setTeam2Name(e.target.value)}
            className="field"
            placeholder="Team 2"
          />
          <input
            type="number"
            min={1}
            value={totalOvers}
            onChange={(e) => setTotalOvers(Number(e.target.value) || 1)}
            className="field"
            placeholder="Overs"
          />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            className="field"
            placeholder="Add player name"
            onKeyDown={(e) => e.key === "Enter" && addPlayer()}
          />
          <button type="button" onClick={addPlayer} className="btn btn-dark">
            Add Player
          </button>
        </div>

        <input
          value={newPlayerPhotoUrl}
          onChange={(e) => setNewPlayerPhotoUrl(e.target.value)}
          className="field mt-2"
          placeholder="Photo URL (optional)"
        />

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <PlayerColumn
            title="Unassigned"
            players={unassignedPlayers}
            onAssign={movePlayerTo}
            destinationButtons={["team1", "team2"]}
          />
          <PlayerColumn
            title={team1Name || "Team 1"}
            players={team1Players.map((id) => playerById[id]).filter(Boolean)}
            onAssign={movePlayerTo}
            destinationButtons={["pool", "team2"]}
          />
          <PlayerColumn
            title={team2Name || "Team 2"}
            players={team2Players.map((id) => playerById[id]).filter(Boolean)}
            onAssign={movePlayerTo}
            destinationButtons={["pool", "team1"]}
          />
        </div>

        <button
          type="button"
          onClick={handleCreateUpcoming}
          disabled={submitting}
          className="btn btn-primary mt-6"
        >
          {submitting ? "Creating..." : "Create Upcoming Match"}
        </button>
      </section>

      <section className="panel mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Upcoming Matches
        </h2>
        {upcomingMatches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No upcoming matches.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {upcomingMatches.map((match) => (
              <MatchCard
                key={match._id}
                match={match}
                actionLabel="Start Match"
                onAction={() => handleStartMatch(match._id)}
                onDelete={() => handleDeleteMatch(match)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Live / Resumable Matches
        </h2>
        {liveMatches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No live matches.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {liveMatches.map((match) => (
              <MatchCard
                key={match._id}
                match={match}
                actionLabel={match.status === "toss" ? "Open Toss" : "Resume"}
                onAction={() => handleResumeMatch(match)}
                onDelete={() => handleDeleteMatch(match)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Completed Matches
        </h2>
        {completedMatches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No completed matches.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {completedMatches.map((match) => (
              <MatchCard
                key={match._id}
                match={match}
                actionLabel="View Scoreboard"
                onAction={() => navigate(`/scoreboard/${match._id}?viewer=1`)}
                onDelete={() => handleDeleteMatch(match)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function PlayerColumn({ title, players, onAssign, destinationButtons }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="mt-2 space-y-2">
        {players.map((player) => (
          <li
            key={player._id}
            className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1"
          >
            <div className="flex items-center gap-2">
              <PlayerAvatar player={player} />
              <span className="text-sm text-slate-700">{player.name}</span>
              <Link
                to={`/players#player-${player._id}`}
                className="text-xs text-blue-600"
              >
                View
              </Link>
            </div>
            <div className="flex gap-1">
              {destinationButtons.includes("team1") ? (
                <button
                  type="button"
                  onClick={() => onAssign(player._id, "team1")}
                  className="btn px-2 py-1 text-xs"
                >
                  T1
                </button>
              ) : null}
              {destinationButtons.includes("team2") ? (
                <button
                  type="button"
                  onClick={() => onAssign(player._id, "team2")}
                  className="btn px-2 py-1 text-xs"
                >
                  T2
                </button>
              ) : null}
              {destinationButtons.includes("pool") ? (
                <button
                  type="button"
                  onClick={() => onAssign(player._id, "pool")}
                  className="btn px-2 py-1 text-xs"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </li>
        ))}
        {players.length === 0 ? (
          <li className="text-xs text-slate-400">No players</li>
        ) : null}
      </ul>
    </div>
  );
}

function MatchCard({ match, actionLabel, onAction, onDelete }) {
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
        <div className="flex items-center gap-2">
          <Link
            to={`/scoreboard/${match._id}?viewer=1`}
            className="btn px-3 py-1 text-xs"
          >
            View
          </Link>
          <button
            type="button"
            onClick={onAction}
            className="btn btn-dark px-3 py-1 text-xs"
          >
            {actionLabel}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="btn border-red-300 bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100"
          >
            Delete
          </button>
        </div>
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

function PlayerAvatar({ player }) {
  const src = player.photoUrl || "";
  if (src) {
    return (
      <img
        src={src}
        alt={player.name}
        className="h-6 w-6 rounded-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    );
  }

  const initial = (player.name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
      {initial}
    </span>
  );
}

export default UmpireSetupPage;
