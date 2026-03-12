import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import GroupChip from "../components/GroupChip";
import ProfileToolbarButton from "../components/ProfileToolbarButton";
import { useAuth } from "../context/AuthContext";
import { useActiveGroup } from "../context/ActiveGroupContext";
import usePageCache from "../hooks/usePageCache";
import {
  API_BASE_URL,
  addGroupPlayer,
  createPlayer,
  createUpcomingMatch,
  deleteMatch,
  getCompletedMatches,
  getGroupPlayers,
  getLiveMatches,
  getMyGroups,
  getUpcomingMatches,
  removeGroupPlayer,
  startMatch,
} from "../services/api";

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
  onRemove,
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
              className={`flex flex-wrap items-center gap-2 rounded-xl border px-2 py-2 ${borderClass} ${bgClass}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <PlayerAvatar player={player} size="sm" />
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-300">
                  {player.name}
                </p>
              </div>
              <div className="flex w-full justify-end gap-1 sm:w-auto">
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
                  onClick={() => onRemove?.(player)}
                  className="rounded-lg border border-red-700/20 bg-red-900/15 px-1.5 py-0.5 text-[9px] font-bold text-red-700 hover:bg-red-900/30 transition-colors"
                  title="Remove from group"
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

function getLivePlayerStat(playerStats, name) {
  return (playerStats || []).find((p) => p?.name === name) || null;
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
  const strikerStat = getLivePlayerStat(
    match.playerStats,
    match.currentStriker,
  );
  const nonStrikerStat = getLivePlayerStat(
    match.playerStats,
    match.currentNonStriker,
  );
  const bowlerStat = getLivePlayerStat(match.playerStats, match.currentBowler);
  const bowlerBalls = Number(bowlerStat?.bowling?.balls || 0);
  const bowlerOvers = `${Math.floor(bowlerBalls / 6)}.${bowlerBalls % 6}`;
  const target = (match.firstInningsScore || 0) + 1;
  const runsNeeded = Math.max(0, target - (match.totalRuns || 0));
  const ballsLeft = Math.max(
    0,
    (match.totalOvers || 0) * 6 - (match.ballsBowled || 0),
  );

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
                  ({Math.floor(match.ballsBowled / 6)}.{match.ballsBowled % 6}/
                  {match.totalOvers})
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

            {(match.currentStriker || match.currentNonStriker) && (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/5 bg-white/4 px-3 py-2">
                <div className="grid grid-cols-2 w-full gap-2">
                  <div className="flex items-stretch gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#f97316] shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-[#f97316]/60">
                          STRIKER
                        </span>
                      </div>
                      {match.currentStriker && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-bold text-white truncate max-w-[88px]">
                            {match.currentStriker}
                          </span>
                          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                            {strikerStat
                              ? `${strikerStat?.batting?.runs ?? 0}(${strikerStat?.batting?.balls ?? 0})`
                              : "0(0)"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="w-px bg-slate-800 self-stretch shrink-0" />
                  </div>

                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-500 shrink-0" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                        NON-STRIKER
                      </span>
                    </div>
                    {match.currentNonStriker && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-semibold text-slate-300 truncate max-w-[88px]">
                          {match.currentNonStriker}
                        </span>
                        <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                          {nonStrikerStat
                            ? `${nonStrikerStat?.batting?.runs ?? 0}(${nonStrikerStat?.batting?.balls ?? 0})`
                            : "0(0)"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {match.currentBowler && (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/5 bg-white/4 px-3 py-2">
                <div className="grid grid-cols-2 w-full gap-2">
                  <div className="flex items-stretch gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400/60">
                          BOWLING
                        </span>
                      </div>
                      <span className="text-[12px] font-semibold text-slate-300 truncate max-w-[110px]">
                        {match.currentBowler}
                      </span>
                    </div>
                    <div className="w-px bg-slate-800 self-stretch shrink-0" />
                  </div>

                  <div className="flex flex-col gap-0.5 items-end">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                      FIGURES
                    </span>
                    <span className="text-[12px] font-bold text-slate-300 tabular-nums">
                      <span className="text-slate-300">{bowlerOvers}</span>
                      <span className="text-slate-700"> · </span>
                      <span className="text-slate-300">
                        {bowlerStat?.bowling?.wickets ?? 0}/
                        {bowlerStat?.bowling?.runs ?? 0}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {typeof match.firstInningsScore === "number" && (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-indigo-500/20 bg-indigo-500/8 px-3 py-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400/70 self-center">
                    NEED
                  </span>
                  <span className="score-num text-xl font-extrabold text-indigo-300 tabular-nums">
                    {runsNeeded}
                  </span>
                  <span className="text-[9px] text-indigo-400/50 self-end mb-0.5">
                    runs
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="score-num text-xl font-extrabold text-indigo-300 tabular-nums">
                    {ballsLeft}
                  </span>
                  <span className="text-[9px] text-indigo-400/50 self-end mb-0.5">
                    balls left
                  </span>
                </div>
              </div>
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
        {!isLive && (
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
        )}

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

function RemovePlayerConfirmModal({ player, removing, onCancel, onConfirm }) {
  if (!player) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-2 pb-2 sm:items-center sm:px-4 sm:pb-0">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#101722] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/40 sm:p-5 sm:pb-5">
        <div className="mb-2 inline-flex items-center rounded-full border border-red-500/30 bg-red-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-red-400">
          Remove Player
        </div>
        <h3 className="text-base font-extrabold text-white">
          Remove from this group?
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          <span className="font-bold text-slate-200">{player.name}</span> will
          be removed from the group's player pool. Their career stats are
          unaffected.
        </p>
        <p className="mt-3 text-xs text-slate-600">
          You can add them back at any time.
        </p>
        <div className="mt-5 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={removing}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-300 transition-all hover:border-white/20 hover:text-white disabled:opacity-40 sm:w-auto sm:py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={removing}
            className="w-full rounded-xl border border-red-500/40 bg-red-600/20 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-300 transition-all hover:border-red-400/60 hover:bg-red-600/30 hover:text-red-200 disabled:opacity-40 sm:w-auto sm:py-2"
          >
            {removing ? "Removing…" : "Remove"}
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
  const { token } = useAuth();
  const {
    activeGroupId: selectedGroupId,
    switchGroup: setSelectedGroupFromContext,
  } = useActiveGroup();

  /* ── group state ── */
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

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
  const [oversInput, setOversInput] = useState(String(totalOvers));
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerPhotoUrl, setNewPlayerPhotoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deletingMatchId, setDeletingMatchId] = useState("");
  const [removePlayerCandidate, setRemovePlayerCandidate] = useState(null);
  const [removingPlayer, setRemovingPlayer] = useState(false);

  const groupsCache = usePageCache("umpire_groups", 120);
  const playersCache = usePageCache("umpire_players_" + selectedGroupId, 120);
  const matchesCache = usePageCache("umpire_matches_" + selectedGroupId, 60);

  /* ── UI-only state ── */
  const [activeTab, setActiveTab] = useState("create");

  /* ── load groups on mount ── */
  useEffect(() => {
    if (!token) return;

    const cachedGroups = groupsCache.get();
    if (cachedGroups) {
      setGroups(cachedGroups);
      setLoadingGroups(false);
      if (!selectedGroupId && cachedGroups.length > 0) {
        setSelectedGroupFromContext(
          cachedGroups[0]._id,
          cachedGroups[0].name || "",
        );
      }

      getMyGroups(token)
        .then((r) => {
          const fresh = r.groups || [];
          setGroups(fresh);
          groupsCache.set(fresh);
        })
        .catch(() => {});
      return;
    }

    setLoadingGroups(true);
    getMyGroups(token)
      .then((r) => {
        const g = r.groups || [];
        setGroups(g);
        groupsCache.set(g);
        if (!selectedGroupId && g.length > 0) {
          setSelectedGroupFromContext(g[0]._id, g[0].name || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoadingGroups(false));
  }, [token]);

  /* ── load group player pool when group changes ── */
  useEffect(() => {
    if (!selectedGroupId || !token) {
      setPlayers([]);
      return;
    }
    setTeam1Players([]);
    setTeam2Players([]);

    const cachedPlayers = playersCache.get();
    if (cachedPlayers) {
      setPlayers(cachedPlayers);
      getGroupPlayers(selectedGroupId, token)
        .then((r) => {
          const fresh = r.players || [];
          setPlayers(fresh);
          playersCache.set(fresh);
        })
        .catch(() => {});
      return;
    }

    getGroupPlayers(selectedGroupId, token)
      .then((r) => {
        const fresh = r.players || [];
        setPlayers(fresh);
        playersCache.set(fresh);
      })
      .catch(() => setPlayers([]));
  }, [selectedGroupId, token]);

  /* ── load match lists ── */
  const loadDashboard = async () => {
    const [upcomingResponse, liveResponse, completedResponse] =
      await Promise.all([
        getUpcomingMatches(selectedGroupId, token),
        getLiveMatches(selectedGroupId, token),
        getCompletedMatches(selectedGroupId, token),
      ]);
    const freshMatches = {
      upcoming: upcomingResponse.matches || [],
      live: liveResponse.matches || [],
      completed: completedResponse.matches || [],
    };
    setUpcomingMatches(freshMatches.upcoming);
    setLiveMatches(freshMatches.live);
    setCompletedMatches(freshMatches.completed);
    return freshMatches;
  };

  const mergeMatchesCache = (partialMatches) => {
    const cachedMatches = matchesCache.get() || {};
    matchesCache.set({
      upcoming: cachedMatches.upcoming || upcomingMatches,
      live: cachedMatches.live || liveMatches,
      completed: cachedMatches.completed || completedMatches,
      ...partialMatches,
    });
  };

  const refreshUpcoming = async () => {
    const response = await getUpcomingMatches(selectedGroupId, token);
    const matches = response.matches || [];
    setUpcomingMatches(matches);
    mergeMatchesCache({ upcoming: matches });
    return matches;
  };

  const refreshLive = async () => {
    const response = await getLiveMatches(selectedGroupId, token);
    const matches = response.matches || [];
    setLiveMatches(matches);
    mergeMatchesCache({ live: matches });
    return matches;
  };

  const refreshCompleted = async () => {
    const response = await getCompletedMatches(selectedGroupId, token);
    const matches = response.matches || [];
    setCompletedMatches(matches);
    mergeMatchesCache({ completed: matches });
    return matches;
  };

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      const cachedMatches = matchesCache.get();
      if (cachedMatches) {
        if (isMounted) {
          setUpcomingMatches(cachedMatches.upcoming || []);
          setLiveMatches(cachedMatches.live || []);
          setCompletedMatches(cachedMatches.completed || []);
          setLoading(false);
        }

        loadDashboard()
          .then((freshMatches) => {
            if (isMounted) matchesCache.set(freshMatches);
          })
          .catch((requestError) => {
            if (isMounted)
              setError(
                requestError.message || "Unable to load umpire dashboard",
              );
          });
        return;
      }

      try {
        if (isMounted) setLoading(true);
        const freshMatches = await loadDashboard();
        if (isMounted) matchesCache.set(freshMatches);
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
  }, [selectedGroupId]);

  /* ── original computed (unchanged) ── */
  const playerById = useMemo(() => {
    const map = {};
    players.forEach((player) => {
      map[player._id] = player;
    });
    return map;
  }, [players.map(p => p._id).join(",")]);

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
    if (!selectedGroupId) {
      setError("Select a group first before adding players");
      return;
    }
    try {
      setError("");
      // 1. Create player globally
      const data = await createPlayer(
        { name, photoUrl: newPlayerPhotoUrl.trim() },
        token,
      );
      // 2. Add player to this group's pool
      await addGroupPlayer(selectedGroupId, data.player._id, token);
      // 3. Refresh player list from group
      const poolRes = await getGroupPlayers(selectedGroupId, token);
      setPlayers(poolRes.players || []);
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
    setOversInput("5");
  };

  const handleOversBlur = () => {
    const parsed = Number.parseInt(oversInput, 10);
    if (!Number.isFinite(parsed)) {
      setTotalOvers(1);
      setOversInput("1");
      return;
    }
    const clamped = Math.min(50, Math.max(1, parsed));
    setTotalOvers(clamped);
    setOversInput(String(clamped));
  };

  const handleCreateUpcoming = async () => {
    if (!selectedGroupId) {
      setError("Select a group before creating a match");
      return;
    }
    if (!team1Name.trim() || !team2Name.trim()) {
      setError("Both team names are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createUpcomingMatch(
        {
          groupId: selectedGroupId,
          team1Name: team1Name.trim(),
          team2Name: team2Name.trim(),
          team1PlayerIds: team1Players,
          team2PlayerIds: team2Players,
          totalOvers,
        },
        token,
      );
      await refreshUpcoming();
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
      await startMatch(matchId, token);
      await Promise.all([refreshUpcoming(), refreshLive()]);
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
      await deleteMatch(deleteCandidate._id, token);
      if (deleteCandidate.status === "upcoming") {
        await refreshUpcoming();
      } else if (
        deleteCandidate.status === "live" ||
        deleteCandidate.status === "innings"
      ) {
        await refreshLive();
      } else if (deleteCandidate.status === "completed") {
        await refreshCompleted();
      }
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

  const handleRemovePlayer = async () => {
    if (!removePlayerCandidate?._id || !selectedGroupId) return;
    try {
      setRemovingPlayer(true);
      setError("");
      await removeGroupPlayer(
        selectedGroupId,
        removePlayerCandidate._id,
        token,
      );
      setTeam1Players((prev) =>
        prev.filter((id) => id !== removePlayerCandidate._id),
      );
      setTeam2Players((prev) =>
        prev.filter((id) => id !== removePlayerCandidate._id),
      );
      const poolRes = await getGroupPlayers(selectedGroupId, token);
      setPlayers(poolRes.players || []);
      setRemovePlayerCandidate(null);
    } catch (err) {
      setError(err.message || "Unable to remove player");
    } finally {
      setRemovingPlayer(false);
    }
  };

  /* ── loading screen ── */
  if (loading)
    return (
      <main
        className="flex h-screen items-center justify-center bg-[#0d1117]"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
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
        input::placeholder { color: #475569; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.3; }
      `}</style>

      {/* ══ STICKY HEADER ══ */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0d1117]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316]">
              <span className="text-[10px] font-black text-white">C</span>
            </div>
            <span className="text-sm font-black uppercase tracking-[0.15em] text-white">
              CricTrack
            </span>
          </Link>
          <span className="order-3 w-full text-center text-[10px] font-black uppercase tracking-widest text-[#f97316] sm:order-none sm:w-auto sm:text-[11px]">
            Umpire Dashboard
          </span>
          {/* Nav */}
          <div className="flex items-center gap-2">
            <GroupChip />
            <ProfileToolbarButton className="btn-tap" />
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
        <div className="mx-auto max-w-4xl px-4 overflow-x-auto">
          <div className="flex min-w-max">
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
      <main className="mx-auto max-w-4xl px-4 py-5 pb-20">
        {/* ─── CREATE TAB ─── */}
        {activeTab === "create" && (
          <div className="space-y-4">
            {/* ── Group Selector ── */}
            <section className="rounded-2xl border border-[#f97316]/25 bg-[#f97316]/5 p-5">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
                Playing For Group
              </p>
              {loadingGroups ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
                  Loading groups…
                </div>
              ) : groups.length === 0 ? (
                <p className="text-sm text-slate-500">
                  You have no groups.{" "}
                  <Link to="/groups" className="text-[#f97316] underline">
                    Create or join a group
                  </Link>{" "}
                  to get started.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const isSel = g._id === selectedGroupId;
                    return (
                      <button
                        key={g._id}
                        type="button"
                        onClick={() => {
                          setSelectedGroupFromContext(g._id, g.name || "");
                        }}
                        className={`rounded-xl border px-4 py-2 text-sm font-black uppercase tracking-widest transition-all ${
                          isSel
                            ? "border-[#f97316]/60 bg-[#f97316] text-[#0d1117]"
                            : "border-white/10 bg-white/5 text-slate-400 hover:border-[#f97316]/40 hover:text-[#f97316]"
                        }`}
                      >
                        {g.name}
                        {isSel && <span className="ml-1.5">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedGroupId && (
                <p className="mt-2.5 text-[11px] text-slate-600">
                  Player pool shows only players in this group ·{" "}
                  <Link
                    to="/groups"
                    className="text-slate-500 underline hover:text-slate-300"
                  >
                    Manage groups
                  </Link>
                </p>
              )}
            </section>
            <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
                Match Setup
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={1}
                    value={oversInput}
                    onChange={(e) => setOversInput(e.target.value)}
                    onBlur={handleOversBlur}
                    placeholder="5"
                    className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                  />
                  <div className="flex gap-2 mt-2">
                    {[5, 10, 15, 20].map((over) => (
                      <button
                        key={over}
                        type="button"
                        onClick={() => {
                          setTotalOvers(over);
                          setOversInput(String(over));
                        }}
                        className={`rounded-full border px-3 py-1 text-xs font-bold transition-all ${
                          totalOvers === over
                            ? "border-[#f97316]/50 bg-[#f97316]/10 text-[#f97316]"
                            : "border-white/10 bg-white/5 text-slate-400 hover:border-[#f97316]/40 hover:text-[#f97316]"
                        }`}
                      >
                        {over}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Add player */}
            <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
                Add Players to Pool
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
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
                  className="btn-tap shrink-0 rounded-xl bg-[#f97316] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  + Add
                </button>
              </div>
            </section>

            {/* Player kanban */}
            {!selectedGroupId ? (
              <div className="rounded-2xl border border-dashed border-white/8 py-10 text-center text-sm text-slate-600">
                Select a group above to see its player pool
              </div>
            ) : players.length > 0 ? (
              <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
                <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
                  Assign Players to Teams
                </p>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
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
                    onRemove={(player) => setRemovePlayerCandidate(player)}
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
                    onRemove={(player) => setRemovePlayerCandidate(player)}
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
                    onRemove={(player) => setRemovePlayerCandidate(player)}
                    isTeamColumn
                  />
                </div>
              </section>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/8 py-10 text-center text-sm text-slate-600">
                No players in this group yet — add some above
              </div>
            )}

            {/* Create button */}
            <button
              type="button"
              onClick={handleCreateUpcoming}
              disabled={
                submitting ||
                !team1Name.trim() ||
                !team2Name.trim() ||
                !selectedGroupId
              }
              className="btn-tap w-full rounded-2xl bg-[#f97316] py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-900/30 transition-all hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting
                ? "Creating…"
                : !selectedGroupId
                  ? "Select a group first"
                  : "🏏  Create Upcoming Match"}
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

      <RemovePlayerConfirmModal
        player={removePlayerCandidate}
        removing={removingPlayer}
        onCancel={() => {
          if (!removingPlayer) setRemovePlayerCandidate(null);
        }}
        onConfirm={handleRemovePlayer}
      />

      <BottomNav />
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
