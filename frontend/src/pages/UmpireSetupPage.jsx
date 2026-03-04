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

/* ─── PlayerAvatar ──────────────────────────────────────────────────────────── */
function PlayerAvatar({ player, size = "sm" }) {
  const [err, setErr] = useState(false);
  const sz =
    {
      xs: "h-6 w-6 text-[10px]",
      sm: "h-8 w-8 text-xs",
      md: "h-10 w-10 text-sm",
    }[size] ?? "h-8 w-8 text-xs";
  const initial = (player?.name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      className={`inline-flex shrink-0 ${sz} rounded-full overflow-hidden ring-2 ring-white/10`}
    >
      {player?.photoUrl && !err ? (
        <img
          src={player.photoUrl}
          alt={player.name}
          className="h-full w-full object-cover"
          onError={() => setErr(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-600 to-slate-800 font-bold text-slate-200">
          {initial}
        </span>
      )}
    </span>
  );
}

/* ─── StatusBadge ───────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  if (status === "live" || status === "innings")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/25 bg-red-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-400">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
        </span>
        {status === "innings" ? "Break" : "Live"}
      </span>
    );
  if (status === "completed")
    return (
      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-700/50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
        Done
      </span>
    );
  if (status === "toss")
    return (
      <span className="inline-flex items-center rounded-full border border-indigo-500/25 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-400">
        Toss
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full border border-sky-500/25 bg-sky-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-sky-400">
      Soon
    </span>
  );
}

/* ─── KanbanColumn ──────────────────────────────────────────────────────────── */
function KanbanColumn({
  title,
  accentClass,
  borderClass,
  bgClass,
  emptyBorderClass,
  emptyTextClass,
  countBg,
  players,
  onAssign,
  showT1T2,
  isTeamColumn,
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p
          className={`max-w-[85%] truncate text-[10px] font-black uppercase tracking-widest ${accentClass}`}
        >
          {title}
        </p>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${countBg}`}
        >
          {players.length}
        </span>
      </div>
      <div className="min-h-[44px] space-y-1.5">
        {players.length === 0 ? (
          <div
            className={`rounded-xl border border-dashed py-5 text-center text-[11px] ${emptyBorderClass} ${emptyTextClass}`}
          >
            No players
          </div>
        ) : (
          players.map((player) => (
            <div
              key={player._id}
              className={`flex items-center gap-2 rounded-xl border px-2 py-2 ${borderClass} ${bgClass}`}
            >
              <PlayerAvatar player={player} size="sm" />
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-300">
                {player.name}
              </p>
              <div className="flex shrink-0 gap-1">
                {showT1T2 && (
                  <>
                    <button
                      type="button"
                      onClick={() => onAssign(player._id, "team1")}
                      className="rounded-lg border border-indigo-600/40 bg-indigo-600/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-400 hover:bg-indigo-600/35 transition-colors"
                    >
                      T1
                    </button>
                    <button
                      type="button"
                      onClick={() => onAssign(player._id, "team2")}
                      className="rounded-lg border border-cyan-600/40 bg-cyan-600/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400 hover:bg-cyan-600/35 transition-colors"
                    >
                      T2
                    </button>
                  </>
                )}
                {isTeamColumn && (
                  <button
                    type="button"
                    onClick={() => onAssign(player._id, "pool")}
                    className="rounded-lg bg-slate-700/50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 hover:bg-slate-700 transition-colors"
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onAssign(player._id, "pool")}
                  className="rounded-lg border border-red-700/20 bg-red-900/15 px-1.5 py-0.5 text-[9px] font-bold text-red-700 hover:bg-red-900/30 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── MatchCard ─────────────────────────────────────────────────────────────── */
function MatchCard({
  match,
  actionLabel,
  actionClass,
  onAction,
  onDelete,
  navigate,
}) {
  const isLive = match.status === "live" || match.status === "innings";
  const isCompleted = match.status === "completed";
  const t1Players = match.team1Players || [];
  const t2Players = match.team2Players || [];
  const allPlayers = [...t1Players, ...t2Players];

  return (
    <article
      className={`rounded-2xl border transition-all ${isLive ? "border-red-800/40 bg-gradient-to-r from-red-950/30 to-slate-900/50" : isCompleted ? "border-slate-800/60 bg-slate-900/30" : "border-slate-800 bg-slate-900/60"}`}
    >
      <div className="px-4 pt-4 pb-3">
        {/* Teams + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`score-num text-xl font-extrabold leading-tight ${isCompleted ? "text-slate-500" : "text-white"}`}
              >
                {match.team1Name}
              </span>
              <span className="text-xs font-bold text-slate-700">vs</span>
              <span
                className={`score-num text-xl font-extrabold leading-tight ${isCompleted ? "text-slate-500" : "text-white"}`}
              >
                {match.team2Name}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-600">
              {match.totalOvers} overs
              {match.status === "innings" && (
                <span className="ml-2 text-amber-500">· Innings Break</span>
              )}
            </p>
          </div>
          <StatusBadge status={match.status} />
        </div>

        {/* Live score */}
        {isLive && match.totalRuns != null && (
          <div className="mt-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-600">
              {match.battingTeam}
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="score-num text-3xl font-extrabold text-white">
                {match.totalRuns}/{match.wickets}
              </span>
              {match.ballsBowled != null && (
                <span className="score-num text-base text-slate-500">
                  ({Math.floor(match.ballsBowled / 6)}.{match.ballsBowled % 6})
                </span>
              )}
            </div>
            {match.firstInningsScore != null && (
              <p className="mt-0.5 text-[11px] text-slate-600">
                Target:{" "}
                <span className="font-bold text-slate-400">
                  {match.firstInningsScore + 1}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Result */}
        {isCompleted && match.resultMessage && (
          <div className="mt-2 rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-1.5">
            <p className="text-xs font-semibold text-slate-400">
              🏆 {match.resultMessage}
            </p>
          </div>
        )}

        {/* Player rosters (original logic preserved) */}
        <div className="mt-3 space-y-0.5">
          <p className="text-[11px] text-slate-600">
            <span className="font-semibold text-slate-500">
              {match.team1Name}:{" "}
            </span>
            {t1Players.map((p) => p.name).join(", ") || "—"}
          </p>
          <p className="text-[11px] text-slate-600">
            <span className="font-semibold text-slate-500">
              {match.team2Name}:{" "}
            </span>
            {t2Players.map((p) => p.name).join(", ") || "—"}
          </p>
        </div>

        {/* Avatar strip */}
        {allPlayers.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1">
            {allPlayers.slice(0, 9).map((p, i) => (
              <PlayerAvatar key={i} player={p} size="xs" />
            ))}
            {allPlayers.length > 9 && (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/5 bg-slate-800 text-[10px] font-bold text-slate-500">
                +{allPlayers.length - 9}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-white/5 px-4 py-3">
        <button
          type="button"
          onClick={onAction}
          className={`flex-1 rounded-xl py-2 text-xs font-black uppercase tracking-widest transition-all active:scale-95 ${actionClass}`}
        >
          {actionLabel}
        </button>
        <Link
          to={`/scoreboard/${match._id}?viewer=1`}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-400 transition-all hover:border-white/20 hover:text-slate-200"
        >
          View
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs font-bold text-red-700 transition-all hover:border-red-800/60 hover:text-red-500"
        >
          ✕
        </button>
      </div>
    </article>
  );
}

function DeleteMatchConfirmModal({ match, deleting, onCancel, onConfirm }) {
  if (!match) return null;

  const statusLabel =
    match.status === "completed"
      ? "Completed"
      : match.status === "live" || match.status === "innings"
        ? "In Progress"
        : "Upcoming";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-2 pb-2 sm:items-center sm:px-4 sm:pb-0">
      <button
        type="button"
        aria-label="Close delete confirmation"
        onClick={onCancel}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#101722] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/40 sm:p-5 sm:pb-5">
        <div className="mb-2 inline-flex items-center rounded-full border border-red-500/30 bg-red-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-red-400">
          Delete Match
        </div>

        <h3 className="text-base font-extrabold text-white sm:text-lg">
          Remove this match permanently?
        </h3>

        <p className="mt-2 text-sm text-slate-400">
          <span className="font-bold text-slate-200">{match.team1Name}</span>
          <span className="mx-2 text-slate-600">vs</span>
          <span className="font-bold text-slate-200">{match.team2Name}</span>
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2 py-1 font-bold uppercase tracking-wider text-slate-400">
            {statusLabel}
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2 py-1 font-bold uppercase tracking-wider text-slate-500">
            {match.totalOvers} Overs
          </span>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          This action cannot be undone.
        </p>

        <div className="mt-5 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="btn-tap w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-300 transition-all hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="btn-tap w-full rounded-xl border border-red-500/40 bg-red-600/20 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-300 transition-all hover:border-red-400/60 hover:bg-red-600/30 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:py-2"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════════ */
const TABS = [
  { key: "create", label: "New Match" },
  { key: "live", label: "Live" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

function UmpireSetupPage() {
  const navigate = useNavigate();

  /* ── all original state (unchanged) ── */
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
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deletingMatchId, setDeletingMatchId] = useState("");

  /* ── UI-only state ── */
  const [activeTab, setActiveTab] = useState("create");

  /* ── original loadDashboard (unchanged) ── */
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
        if (isMounted)
          setError(requestError.message || "Unable to load umpire dashboard");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  /* ── original computed (unchanged) ── */
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

  /* ── original handlers (unchanged) ── */
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
        body: JSON.stringify({ name, photoUrl: newPlayerPhotoUrl.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success)
        throw new Error(data?.message || "Unable to add player");
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
      setActiveTab("upcoming");
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

  const handleDeleteMatch = async () => {
    if (!deleteCandidate?._id) return;
    try {
      setDeletingMatchId(deleteCandidate._id);
      setError("");
      await deleteMatch(deleteCandidate._id);
      await loadDashboard();
      setDeleteCandidate(null);
    } catch (requestError) {
      setError(requestError.message || "Unable to delete match");
    } finally {
      setDeletingMatchId("");
    }
  };

  const openDeleteConfirm = (match) => {
    if (!match?._id) return;
    setDeleteCandidate(match);
  };

  const closeDeleteConfirm = () => {
    if (deletingMatchId) return;
    setDeleteCandidate(null);
  };

  const handleExitUmpireMode = () => {
    sessionStorage.removeItem(UMPIRE_AUTH_KEY);
    navigate("/umpire/login", { replace: true });
  };

  /* ── loading screen ── */
  if (loading)
    return (
      <main
        className="flex h-screen items-center justify-center bg-[#0d1117]"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800&display=swap');`}</style>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
          <p className="text-sm text-slate-500">Loading dashboard…</p>
        </div>
      </main>
    );

  const team1PlayerObjects = team1Players
    .map((id) => playerById[id])
    .filter(Boolean);
  const team2PlayerObjects = team2Players
    .map((id) => playerById[id])
    .filter(Boolean);

  /* ── render ── */
  return (
    <div
      className="min-h-screen bg-[#0d1117] text-white"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800&display=swap');
        .score-num { font-family: 'Barlow Condensed', sans-serif; }
        .btn-tap { transition: transform 0.08s, opacity 0.1s; }
        .btn-tap:active { transform: scale(0.95); opacity: 0.85; }
        input::placeholder { color: #475569; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.3; }
      `}</style>

      {/* ══ STICKY HEADER ══ */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0d1117]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316]">
              <span className="text-[10px] font-black text-white">C</span>
            </div>
            <span className="text-sm font-black uppercase tracking-[0.15em] text-white">
              CricTrack
            </span>
          </Link>
          <span className="text-[11px] font-black uppercase tracking-widest text-[#f97316]">
            Umpire Dashboard
          </span>
          {/* Nav */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleExitUmpireMode}
              className="btn-tap text-[11px] font-medium text-slate-600 hover:text-slate-300 transition-colors"
            >
              Exit Umpire Mode
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-tap text-[11px] text-slate-600 hover:text-slate-300 transition-colors"
            >
              Back
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex">
            {TABS.map((tab) => {
              const count =
                tab.key === "live"
                  ? liveMatches.length
                  : tab.key === "upcoming"
                    ? upcomingMatches.length
                    : tab.key === "completed"
                      ? completedMatches.length
                      : null;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`btn-tap px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
                    activeTab === tab.key
                      ? "border-b-2 border-[#f97316] text-[#f97316]"
                      : "text-slate-600 hover:text-slate-400"
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black ${tab.key === "live" ? "bg-red-500/20 text-red-400" : "bg-slate-800 text-slate-500"}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ══ ERROR BANNER ══ */}
      {error && (
        <div className="mx-auto max-w-4xl px-4 pt-4">
          <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-2.5">
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              className="btn-tap ml-3 text-lg leading-none text-red-600 hover:text-red-400"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ══ MAIN ══ */}
      <main className="mx-auto max-w-4xl px-4 py-5 pb-16">
        {/* ─── CREATE TAB ─── */}
        {activeTab === "create" && (
          <div className="space-y-4">
            {/* Match config */}
            <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
                Match Setup
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Team 1 Name
                  </label>
                  <input
                    value={team1Name}
                    onChange={(e) => setTeam1Name(e.target.value)}
                    placeholder="e.g. Challengers"
                    className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Team 2 Name
                  </label>
                  <input
                    value={team2Name}
                    onChange={(e) => setTeam2Name(e.target.value)}
                    placeholder="e.g. Warriors"
                    className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Overs
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={totalOvers}
                    onChange={(e) => setTotalOvers(Number(e.target.value) || 1)}
                    placeholder="5"
                    className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                  />
                </div>
              </div>
            </section>

            {/* Add player */}
            <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
                Add Players to Pool
              </p>
              <div className="flex gap-2">
                <input
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                  placeholder="Player name"
                  className="flex-1 rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                />
                <input
                  value={newPlayerPhotoUrl}
                  onChange={(e) => setNewPlayerPhotoUrl(e.target.value)}
                  placeholder="Photo URL (optional)"
                  className="flex-1 rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                />
                <button
                  type="button"
                  onClick={addPlayer}
                  disabled={!newPlayerName.trim()}
                  className="btn-tap shrink-0 rounded-xl bg-[#f97316] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + Add
                </button>
              </div>
            </section>

            {/* Player kanban — only show if there are players */}
            {players.length > 0 && (
              <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
                <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
                  Assign Players to Teams
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <KanbanColumn
                    title="Unassigned"
                    accentClass="text-slate-500"
                    borderClass="border-slate-800"
                    bgClass="bg-slate-800/40"
                    emptyBorderClass="border-slate-800"
                    emptyTextClass="text-slate-700"
                    countBg="bg-slate-800 text-slate-500"
                    players={unassignedPlayers}
                    onAssign={movePlayerTo}
                    showT1T2
                  />
                  <KanbanColumn
                    title={team1Name || "Team 1"}
                    accentClass="text-indigo-400"
                    borderClass="border-indigo-800/40"
                    bgClass="bg-indigo-900/20"
                    emptyBorderClass="border-indigo-900/40"
                    emptyTextClass="text-indigo-900"
                    countBg="bg-indigo-900/40 text-indigo-400"
                    players={team1PlayerObjects}
                    onAssign={movePlayerTo}
                    isTeamColumn
                  />
                  <KanbanColumn
                    title={team2Name || "Team 2"}
                    accentClass="text-cyan-400"
                    borderClass="border-cyan-800/40"
                    bgClass="bg-cyan-900/20"
                    emptyBorderClass="border-cyan-900/40"
                    emptyTextClass="text-cyan-900"
                    countBg="bg-cyan-900/40 text-cyan-400"
                    players={team2PlayerObjects}
                    onAssign={movePlayerTo}
                    isTeamColumn
                  />
                </div>
              </section>
            )}

            {/* Create button */}
            <button
              type="button"
              onClick={handleCreateUpcoming}
              disabled={submitting || !team1Name.trim() || !team2Name.trim()}
              className="btn-tap w-full rounded-2xl bg-[#f97316] py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-900/30 transition-all hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Creating…" : "🏏  Create Upcoming Match"}
            </button>
          </div>
        )}

        {/* ─── LIVE TAB ─── */}
        {activeTab === "live" &&
          (liveMatches.length === 0 ? (
            <EmptyState icon="🏏" label="No live matches right now" />
          ) : (
            <div className="space-y-3">
              {liveMatches.map((match) => (
                <MatchCard
                  key={match._id}
                  match={match}
                  actionLabel={
                    match.status === "toss" ? "Open Toss" : "Resume Scoring"
                  }
                  actionClass="bg-[#f97316] text-white hover:bg-orange-500"
                  onAction={() => handleResumeMatch(match)}
                  onDelete={() => openDeleteConfirm(match)}
                  navigate={navigate}
                />
              ))}
            </div>
          ))}

        {/* ─── UPCOMING TAB ─── */}
        {activeTab === "upcoming" &&
          (upcomingMatches.length === 0 ? (
            <EmptyState icon="📋" label="No upcoming matches. Create one!" />
          ) : (
            <div className="space-y-3">
              {upcomingMatches.map((match) => (
                <MatchCard
                  key={match._id}
                  match={match}
                  actionLabel="Start Match"
                  actionClass="bg-[#f97316] text-white hover:bg-orange-500"
                  onAction={() => handleStartMatch(match._id)}
                  onDelete={() => openDeleteConfirm(match)}
                  navigate={navigate}
                />
              ))}
            </div>
          ))}

        {/* ─── COMPLETED TAB ─── */}
        {activeTab === "completed" &&
          (completedMatches.length === 0 ? (
            <EmptyState icon="🏆" label="No completed matches yet" />
          ) : (
            <div className="space-y-3">
              {completedMatches.map((match) => (
                <MatchCard
                  key={match._id}
                  match={match}
                  actionLabel="View Scoreboard"
                  actionClass="border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  onAction={() => navigate(`/scoreboard/${match._id}?viewer=1`)}
                  onDelete={() => openDeleteConfirm(match)}
                  navigate={navigate}
                />
              ))}
            </div>
          ))}
      </main>

      <DeleteMatchConfirmModal
        match={deleteCandidate}
        deleting={deletingMatchId === deleteCandidate?._id}
        onCancel={closeDeleteConfirm}
        onConfirm={handleDeleteMatch}
      />
    </div>
  );
}

function EmptyState({ icon, label }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}

export default UmpireSetupPage;
