import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useActiveGroup } from "../context/ActiveGroupContext";
import BottomNav from "../components/BottomNav";
import ProfileToolbarButton from "../components/ProfileToolbarButton";
import {
  getCompletedMatches,
  getLiveMatches,
  getMyGroups,
  getUpcomingMatches,
  startMatch,
} from "../services/api";
import usePageCache from "../hooks/usePageCache";

/* ─── helpers ────────────────────────────────────────────────────────────────── */
function calcOvers(ballsBowled) {
  if (ballsBowled == null) return null;
  return `${Math.floor(ballsBowled / 6)}.${ballsBowled % 6}`;
}

/* ─── PlayerAvatarStack ──────────────────────────────────────────────────────── */
function PlayerAvatarStack({ players = [], max = 6 }) {
  const valid = (players || []).filter((p) => p?.name);
  const shown = valid.slice(0, max);
  const overflow = Math.max(0, valid.length - shown.length);

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((player, i) => {
        const [err, setErr] = useState(false);
        const initials =
          player.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w.charAt(0))
            .join("")
            .toUpperCase() || "?";
        return (
          <span
            key={`${player.name}-${i}`}
            title={player.name}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#0d1117] overflow-hidden ring-1 ring-white/5"
          >
            {player.photoUrl && !err ? (
              <img
                src={player.photoUrl}
                alt={player.name}
                className="h-full w-full object-cover"
                onError={() => setErr(true)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-600 to-slate-800 text-[9px] font-bold text-slate-300">
                {initials}
              </span>
            )}
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#0d1117] bg-slate-800 text-[9px] font-bold text-slate-500 ring-1 ring-white/5">
          +{overflow}
        </span>
      )}
    </div>
  );
}

/* ─── LiveDot ────────────────────────────────────────────────────────────────── */
function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      <span className="text-[10px] font-black uppercase tracking-widest text-red-400">
        Live
      </span>
    </span>
  );
}

/* ─── SectionHeader ──────────────────────────────────────────────────────────── */
function SectionHeader({ label, accent, count, extra }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <p
          className={`text-[10px] font-black uppercase tracking-[0.18em] ${accent}`}
        >
          {label}
        </p>
        {count != null && count > 0 && (
          <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
            {count}
          </span>
        )}
      </div>
      {extra}
    </div>
  );
}

/* ─── LiveMatchCard ──────────────────────────────────────────────────────────── */
function LiveMatchCard({ match, onUmpireMode }) {
  const [openingUmpire, setOpeningUmpire] = useState(false);
  const overs = calcOvers(match.ballsBowled);
  function getPlayerStat(playerStats, name) {
    return (playerStats || []).find((p) => p?.name === name) || null;
  }

  const handleUmpire = async (event) => {
    event.preventDefault();
    if (openingUmpire) return;
    setOpeningUmpire(true);
    try {
      await onUmpireMode(match);
    } finally {
      setOpeningUmpire(false);
    }
  };

  const strikerStat = getPlayerStat(match.playerStats, match.currentStriker);
  const nonStrikerStat = getPlayerStat(
    match.playerStats,
    match.currentNonStriker,
  );
  const bowlerStat = getPlayerStat(match.playerStats, match.currentBowler);
  const bowlerBalls = Number(bowlerStat?.bowling?.balls || 0);
  const bowlerOvers = `${Math.floor(bowlerBalls / 6)}.${bowlerBalls % 6}`;

  const target = match.firstInningsScore + 1;
  const runsNeeded = Math.max(0, target - (match.totalRuns || 0));
  const ballsLeft = Math.max(
    0,
    (match.totalOvers || 0) * 6 - (match.ballsBowled || 0),
  );

  const hasScore =
    Number(match.totalRuns || 0) > 0 ||
    Number(match.wickets || 0) > 0 ||
    Number(match.ballsBowled || 0) > 0;

  return (
    <div className="rounded-2xl border border-red-800/30 bg-gradient-to-br from-red-950/25 via-slate-900/60 to-slate-900/40 p-4 transition-all hover:border-red-700/50 hover:from-red-950/35">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold leading-tight text-white">
            {match.team1Name}
            <span className="mx-2 text-slate-600 font-normal text-sm">vs</span>
            {match.team2Name}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {match.totalOvers} overs
          </p>
        </div>
        <LiveDot />
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-stretch gap-3">
          <div className="flex-1 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#f97316]">
              {match.battingTeam || match.team1Name}
            </p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span
                className="text-4xl font-extrabold leading-none text-white"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                {hasScore
                  ? `${match.totalRuns || 0}/${match.wickets || 0}`
                  : "0/0"}
              </span>
              {overs && (
                <span
                  className="text-lg font-semibold text-slate-500"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  ({overs}/{match.totalOvers})
                </span>
              )}
            </div>
            {typeof match.firstInningsScore === "number" && (
              <p className="mt-0.5 text-[11px] text-slate-600">
                Target:{" "}
                <span className="font-bold text-slate-400">
                  {match.firstInningsScore + 1}
                </span>
              </p>
            )}
          </div>

          <div className="w-[54%] min-w-0 space-y-1.5">
            {(match.currentStriker || match.currentNonStriker) && (
              <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/4 px-3 py-2">
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
                            {strikerStat?.batting?.runs ?? 0}(
                            {strikerStat?.batting?.balls ?? 0})
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
                          {nonStrikerStat?.batting?.runs ?? 0}(
                          {nonStrikerStat?.batting?.balls ?? 0})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {match.currentBowler && (
              <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/4 px-3 py-2">
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
          </div>
        </div>

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

      <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
        <button
          type="button"
          onClick={handleUmpire}
          disabled={openingUmpire}
          className="flex-1 rounded-xl bg-[#f97316] py-2 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-orange-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {openingUmpire ? "Opening..." : "🏏 Umpire Mode"}
        </button>
        <Link
          to={`/scoreboard/${match._id}?viewer=1`}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-400 transition-all hover:border-white/20 hover:text-slate-200"
        >
          View
        </Link>
      </div>
    </div>
  );
}

/* ─── UpcomingMatchCard ──────────────────────────────────────────────────────── */
function UpcomingMatchCard({ match, onUmpireMode }) {
  const [starting, setStarting] = useState(false);

  const t1Players = match.team1Players || [];
  const t2Players = match.team2Players || [];

  const handleUmpire = async (e) => {
    e.preventDefault();
    if (starting) return;
    setStarting(true);
    try {
      await onUmpireMode(match._id);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/6 bg-slate-900/50 transition-all hover:border-white/12 hover:bg-slate-900/80">
      {/* Main body */}
      <div className="px-4 pt-4 pb-3">
        {/* Teams */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold leading-tight text-white">
              {match.team1Name}
              <span className="mx-1.5 font-normal text-slate-600 text-sm">
                vs
              </span>
              {match.team2Name}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-600">
              {match.totalOvers} overs
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-sky-400">
            Soon
          </span>
        </div>

        {/* Player rosters */}
        <div className="mt-3 space-y-1.5">
          {t1Players.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="min-w-[52px] text-[10px] font-bold text-slate-600 truncate">
                {match.team1Name}
              </span>
              <PlayerAvatarStack players={t1Players} max={6} />
              <span className="text-[10px] text-slate-700">
                {t1Players.map((p) => p.name).join(", ")}
              </span>
            </div>
          )}
          {t2Players.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="min-w-[52px] text-[10px] font-bold text-slate-600 truncate">
                {match.team2Name}
              </span>
              <PlayerAvatarStack players={t2Players} max={6} />
              <span className="text-[10px] text-slate-700">
                {t2Players.map((p) => p.name).join(", ")}
              </span>
            </div>
          )}
          {t1Players.length === 0 && t2Players.length === 0 && (
            <p className="text-[11px] text-slate-700">
              No players assigned yet
            </p>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-white/5 px-4 py-3">
        {/* Umpire Mode - starts match */}
        <button
          type="button"
          onClick={handleUmpire}
          disabled={starting}
          className="flex-1 rounded-xl bg-[#f97316] py-2 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-orange-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? "Starting…" : "🏏 Umpire Mode"}
        </button>

        {/* View scoreboard */}
        <Link
          to={`/scoreboard/${match._id}?viewer=1`}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-400 transition-all hover:border-white/20 hover:text-slate-200"
        >
          View
        </Link>
      </div>
    </div>
  );
}

/* ─── CompletedMatchCard ─────────────────────────────────────────────────────── */
function CompletedMatchCard({ match }) {
  const result =
    match.resultMessage ||
    (typeof match.firstInningsScore === "number"
      ? Number(match.totalRuns || 0) > Number(match.firstInningsScore)
        ? `${match.battingTeam || "Chasing team"} won by ${Math.max(
            0,
            10 - Number(match.wickets || 0),
          )} wickets`
        : Number(match.totalRuns || 0) < Number(match.firstInningsScore)
          ? `${match.bowlingTeam || "Defending team"} won by ${
              Number(match.firstInningsScore) - Number(match.totalRuns || 0)
            } runs`
          : "Match Tied"
      : "Result unavailable");

  return (
    <Link
      to={`/scoreboard/${match._id}?viewer=1`}
      className="flex items-center gap-3 rounded-2xl border border-white/5 bg-slate-900/30 px-4 py-3 opacity-75 transition-all hover:opacity-100 hover:border-white/10 active:scale-[0.99]"
    >
      {/* Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/40 bg-slate-800/50">
        <span className="text-lg">🏆</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-400">
          {match.team1Name}
          <span className="mx-1.5 text-slate-700 font-normal">vs</span>
          {match.team2Name}
        </p>
        <p className="mt-0.5 truncate text-[11px] font-medium text-slate-600">
          {result}
        </p>
        <div className="mt-1 flex items-center gap-1">
          <PlayerAvatarStack
            players={[
              ...(match.team1Players || []),
              ...(match.team2Players || []),
            ]}
            max={5}
          />
        </div>
      </div>

      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-600 shrink-0">
        Done
      </span>
    </Link>
  );
}

/* ─── EmptyState ─────────────────────────────────────────────────────────────── */
function EmptyState({ icon, label }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/6 py-10 text-center">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm text-slate-700">{label}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════════ */
function HomePage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { activeGroupId, activeGroupName, switchGroup } = useActiveGroup();
  const cache = usePageCache("home_" + activeGroupId);
  const [groups, setGroups] = useState([]);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [completedMatches, setCompletedMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [compactSectionNav, setCompactSectionNav] = useState(false);
  const liveSectionRef = useRef(null);
  const upcomingSectionRef = useRef(null);
  const completedSectionRef = useRef(null);

  const handleStartMatch = async (matchId) => {
    try {
      setError("");
      await startMatch(matchId, token);
      navigate(`/umpire/toss/${matchId}`);
    } catch (requestError) {
      setError(requestError.message || "Unable to start match");
    }
  };

  const handleOpenLiveUmpire = async (match) => {
    try {
      setError("");
      if (match?.status === "toss") {
        navigate(`/umpire/toss/${match._id}`);
        return;
      }

      navigate(`/umpire/scorer/${match._id}`);
    } catch (requestError) {
      setError(requestError.message || "Unable to open umpire mode");
    }
  };

  useEffect(() => {
    let isMounted = true;
    let pollTimer = null;

    const loadMatches = async () => {
      const cached = cache.get();
      if (cached !== null) {
        setLiveMatches(cached[0]?.matches || []);
        setUpcomingMatches(cached[1]?.matches || []);
        setCompletedMatches(cached[2]?.matches || []);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const [liveResponse, upcomingResponse, completedResponse] =
          await Promise.all([
            getLiveMatches(activeGroupId, token),
            getUpcomingMatches(activeGroupId, token),
            getCompletedMatches(activeGroupId, token),
          ]);

        if (!isMounted) return;

        setLiveMatches(liveResponse.matches || []);
        setUpcomingMatches(upcomingResponse.matches || []);
        setCompletedMatches(completedResponse.matches || []);
        cache.set([liveResponse, upcomingResponse, completedResponse]);
        setLastRefresh(new Date());
        setError("");
      } catch (requestError) {
        if (isMounted)
          setError(requestError.message || "Unable to load matches");
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
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [activeGroupId]);

  // Load user's groups for dropdown
  useEffect(() => {
    if (!token) return;
    getMyGroups(token)
      .then((r) => setGroups(r.groups || []))
      .catch(() => {});
  }, [token]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showGroupDropdown) return;
    const close = (e) => {
      if (!e.target.closest("[data-group-switcher]"))
        setShowGroupDropdown(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showGroupDropdown]);

  useEffect(() => {
    const onScroll = () => {
      setCompactSectionNav(window.scrollY > 140);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const totalMatches =
    liveMatches.length + upcomingMatches.length + completedMatches.length;

  const scrollToSection = (section) => {
    const sectionMap = {
      live: liveSectionRef,
      upcoming: upcomingSectionRef,
      completed: completedSectionRef,
    };
    const targetRef = sectionMap[section];
    targetRef?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
      `}</style>

      {/* ══ STICKY HEADER ══ */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0d1117]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316]">
              <span className="text-[10px] font-black text-white">C</span>
            </div>
            <span className="text-sm font-black uppercase tracking-[0.15em] text-white">
              CricTrack
            </span>
          </Link>
          <span className="text-[11px] font-black uppercase tracking-widest text-[#f97316]">
            Viewer Mode
          </span>
          <div className="flex items-center gap-2">
            <ProfileToolbarButton className="btn-tap" />
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-tap text-[11px] font-medium text-slate-600 hover:text-slate-300 transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 pb-20">
        {/* ── Group Switcher ── */}
        <div className="relative mb-4" data-group-switcher>
          <button
            type="button"
            onClick={() => setShowGroupDropdown((v) => !v)}
            className="w-full flex items-center justify-between rounded-xl border border-[#f97316]/35 bg-[#f97316]/10 px-3 py-2.5 transition-all hover:border-[#f97316]/50 hover:bg-[#f97316]/15"
          >
            <div className="text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#f97316]">
                Active Group
              </p>
              <p className="score-num text-xl font-extrabold uppercase tracking-wide text-white">
                {activeGroupName || "No group selected"}
              </p>
            </div>
            <span className="text-[11px] font-black text-[#f97316]">
              {showGroupDropdown ? "▲" : "▼"}
            </span>
          </button>

          {showGroupDropdown && (
            <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] shadow-2xl shadow-black/60">
              {groups.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500">
                  No groups yet.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setShowGroupDropdown(false);
                      navigate("/groups");
                    }}
                    className="text-[#f97316] underline"
                  >
                    Create one
                  </button>
                </div>
              ) : (
                groups.map((g) => {
                  const isActive = g._id === activeGroupId;
                  return (
                    <button
                      key={g._id}
                      type="button"
                      onClick={() => {
                        switchGroup(g._id, g.name);
                        setShowGroupDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between border-b border-white/5 px-4 py-3 text-left last:border-0 transition-colors ${
                        isActive
                          ? "bg-[#f97316]/10 text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <div>
                        <p className="score-num text-base font-bold uppercase tracking-wide">
                          {g.name}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          {g.members?.length || 0} members · code{" "}
                          <span className="font-mono tracking-widest">
                            {g.inviteCode}
                          </span>
                        </p>
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#f97316]">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })
              )}
              <div className="border-t border-white/5 px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowGroupDropdown(false);
                    navigate("/groups");
                  }}
                  className="w-full rounded-lg py-1.5 text-[11px] font-black uppercase tracking-widest text-[#f97316] hover:bg-[#f97316]/10 transition-colors"
                >
                  + Manage Groups
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Hero greeting ── */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1
              className="text-3xl font-extrabold leading-tight text-white"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              Match Centre
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Follow live, upcoming &amp; completed matches
            </p>
          </div>
          {/* Auto-refresh indicator */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-700">
              <span className="h-3 w-3 animate-spin rounded-full border border-slate-700 border-t-slate-500" />
              Auto-refreshing
            </div>
            {lastRefresh && (
              <p className="text-[10px] text-slate-800">
                {lastRefresh.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-2.5">
            <span className="text-sm">⚠️</span>
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* ── Sticky section switcher ── */}
        {!loading && totalMatches > 0 && (
          <div
            className={`sticky z-30 mb-6 grid grid-cols-3 gap-2 rounded-xl border border-white/5 bg-[#0d1117]/95 p-1.5 backdrop-blur transition-all duration-150 ${
              compactSectionNav ? "top-[56px]" : "top-[76px]"
            }`}
          >
            {[
              {
                label: "Live",
                key: "live",
                value: liveMatches.length,
                color: "text-red-400",
                bg: "border-red-900/30 bg-red-950/20",
              },
              {
                label: "Upcoming",
                key: "upcoming",
                value: upcomingMatches.length,
                color: "text-sky-400",
                bg: "border-sky-900/30 bg-sky-950/20",
              },
              {
                label: "Completed",
                key: "completed",
                value: completedMatches.length,
                color: "text-slate-400",
                bg: "border-slate-700/40 bg-slate-800/30",
              },
            ].map(({ label, key, value, color, bg }) => (
              <button
                key={label}
                type="button"
                onClick={() => scrollToSection(key)}
                className={`btn-tap rounded-xl border text-center transition-all duration-150 ${bg} ${
                  compactSectionNav ? "px-2 py-1.5" : "px-3 py-2.5"
                }`}
              >
                <p
                  className={`${compactSectionNav ? "text-lg" : "text-2xl"} font-extrabold leading-none ${color}`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {value}
                </p>
                <p
                  className={`font-bold uppercase tracking-wide text-slate-600 ${
                    compactSectionNav ? "mt-0 text-[9px]" : "mt-0.5 text-[10px]"
                  }`}
                >
                  {label}
                </p>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
            <p className="text-sm text-slate-500">Loading matches…</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* ══ LIVE ══ */}
            <section ref={liveSectionRef} className="scroll-mt-24">
              <SectionHeader
                label="Live Matches"
                accent="text-red-400"
                count={liveMatches.length}
                extra={liveMatches.length > 0 ? <LiveDot /> : null}
              />
              {liveMatches.length === 0 ? (
                <EmptyState icon="📡" label="No live matches right now" />
              ) : (
                <div className="space-y-3">
                  {liveMatches.map((match) => (
                    <LiveMatchCard
                      key={match._id}
                      match={match}
                      onUmpireMode={handleOpenLiveUmpire}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ══ UPCOMING ══ */}
            <section ref={upcomingSectionRef} className="scroll-mt-24">
              <SectionHeader
                label="Upcoming Matches"
                accent="text-sky-400"
                count={upcomingMatches.length}
              />
              {upcomingMatches.length === 0 ? (
                <EmptyState icon="📋" label="No upcoming matches scheduled" />
              ) : (
                <div className="space-y-2.5">
                  {upcomingMatches.map((match) => (
                    <UpcomingMatchCard
                      key={match._id}
                      match={match}
                      onUmpireMode={handleStartMatch}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ══ COMPLETED ══ */}
            <section ref={completedSectionRef} className="scroll-mt-24">
              <SectionHeader
                label="Completed Matches"
                accent="text-slate-500"
                count={completedMatches.length}
              />
              {completedMatches.length === 0 ? (
                <EmptyState icon="🏆" label="No completed matches yet" />
              ) : (
                <div className="space-y-2.5">
                  {completedMatches.map((match) => (
                    <CompletedMatchCard key={match._id} match={match} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default HomePage;
