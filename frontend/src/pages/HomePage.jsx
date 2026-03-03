import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getCompletedMatches,
  getLiveMatches,
  getUpcomingMatches,
} from "../services/api";

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
function LiveMatchCard({ match }) {
  const overs = calcOvers(match.ballsBowled);
  const hasScore =
    Number(match.totalRuns || 0) > 0 ||
    Number(match.wickets || 0) > 0 ||
    Number(match.ballsBowled || 0) > 0;

  return (
    <Link
      to={`/scoreboard/${match._id}?viewer=1`}
      className="block rounded-2xl border border-red-800/30 bg-gradient-to-br from-red-950/25 via-slate-900/60 to-slate-900/40 p-4 transition-all hover:border-red-700/50 hover:from-red-950/35 active:scale-[0.99]"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Teams */}
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

      {/* Score hero */}
      <div className="mt-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#f97316]">
          {match.battingTeam || match.team1Name}
        </p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span
            className="text-4xl font-extrabold leading-none text-white"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {hasScore ? `${match.totalRuns || 0}/${match.wickets || 0}` : "0/0"}
          </span>
          {overs && (
            <span
              className="text-lg font-semibold text-slate-500"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              ({overs})
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

      {/* Player stacks */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[10px] font-semibold text-slate-600 truncate">
            {match.team1Name}
          </span>
          <PlayerAvatarStack players={match.team1Players || []} />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[10px] font-semibold text-slate-600 truncate">
            {match.team2Name}
          </span>
          <PlayerAvatarStack players={match.team2Players || []} />
        </div>
      </div>

      {/* CTA */}
      <div className="mt-3 flex items-center justify-end">
        <span className="rounded-full bg-[#f97316]/15 border border-[#f97316]/30 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#f97316]">
          Open Scoreboard →
        </span>
      </div>
    </Link>
  );
}

/* ─── UpcomingMatchCard ──────────────────────────────────────────────────────── */
function UpcomingMatchCard({ match }) {
  return (
    <Link
      to={`/scoreboard/${match._id}?viewer=1`}
      className="flex items-center gap-3 rounded-2xl border border-white/6 bg-slate-900/50 px-4 py-3 transition-all hover:border-white/12 hover:bg-slate-900/80 active:scale-[0.99]"
    >
      {/* Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10">
        <span className="text-lg">🏏</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-200">
          {match.team1Name}
          <span className="mx-1.5 text-slate-600 font-normal">vs</span>
          {match.team2Name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[10px] text-slate-600">
            {match.totalOvers} overs
          </span>
          <span className="text-slate-800 text-[10px]">·</span>
          <div className="flex items-center gap-1">
            <PlayerAvatarStack
              players={[
                ...(match.team1Players || []),
                ...(match.team2Players || []),
              ]}
              max={5}
            />
          </div>
        </div>
      </div>

      <span className="inline-flex items-center rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-sky-400 shrink-0">
        Soon
      </span>
    </Link>
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

        if (!isMounted) return;

        setUpcomingMatches(upcomingResponse.matches || []);
        setLiveMatches(liveResponse.matches || []);
        setCompletedMatches(completedResponse.matches || []);
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
  }, []);

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
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316]">
              <span className="text-[10px] font-black text-white">C</span>
            </div>
            <span className="text-sm font-black uppercase tracking-[0.15em] text-white">
              CricTrack
            </span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-widest text-[#f97316]">
            Viewer Mode
          </span>
          <Link
            to="/"
            className="btn-tap text-[11px] font-medium text-slate-600 hover:text-slate-300 transition-colors"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 pb-16">
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
                    <LiveMatchCard key={match._id} match={match} />
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
                    <UpcomingMatchCard key={match._id} match={match} />
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
    </div>
  );
}

export default HomePage;
