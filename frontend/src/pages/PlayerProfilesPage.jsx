import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import GroupChip from "../components/GroupChip";
import ProfileToolbarButton from "../components/ProfileToolbarButton";
import { getGroupPlayersWithStats } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useActiveGroup } from "../context/ActiveGroupContext";
import usePageCache from "../hooks/usePageCache";

const BATTING_FILTER_OPTIONS = [
  { value: "runs", label: "Runs" },
  { value: "matches", label: "Matches" },
  { value: "innings", label: "Innings" },
  { value: "average", label: "Average" },
  { value: "fours", label: "4s" },
  { value: "sixes", label: "6s" },
  { value: "hundreds", label: "100s" },
  { value: "fifties", label: "50s" },
  { value: "thirties", label: "30s" },
  { value: "strikeRate", label: "Strike Rate" },
];

const BOWLING_FILTER_OPTIONS = [
  { value: "wickets", label: "Wickets" },
  { value: "economy", label: "Economy" },
  { value: "overs", label: "Overs" },
  { value: "balls", label: "Balls" },
  { value: "runs", label: "Runs" },
  { value: "matches", label: "Matches" },
  { value: "average", label: "Average" },
  { value: "threeWickets", label: "3fers" },
  { value: "fourWickets", label: "4fers" },
  { value: "fiveWickets", label: "5fers" },
];

/* ─── helpers ────────────────────────────────────────────────────────────────── */
function formatNum(value, digits = 2) {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function battingAverage(_, computedBatting) {
  if (Number.isFinite(Number(computedBatting?.average))) {
    return formatNum(Number(computedBatting.average), 2);
  }
  return "-";
}

function strikeRate(_, computedBatting) {
  if (Number.isFinite(Number(computedBatting?.strikeRate))) {
    return formatNum(Number(computedBatting.strikeRate), 2);
  }
  return "-";
}

function bowlingAverage(_, computedBowling) {
  if (Number.isFinite(Number(computedBowling?.average))) {
    return formatNum(Number(computedBowling.average), 2);
  }
  return "-";
}

function economyRate(_, computedBowling) {
  if (Number.isFinite(Number(computedBowling?.economy))) {
    return formatNum(Number(computedBowling.economy), 2);
  }
  return "-";
}

/* ─── Avatar ─────────────────────────────────────────────────────────────────── */
function PlayerAvatar({ player, size = "md", ring = false }) {
  const [err, setErr] = useState(false);
  const sizeMap = {
    xs: "h-7 w-7 text-[11px]",
    sm: "h-9 w-9 text-sm",
    md: "h-12 w-12 text-base",
    lg: "h-16 w-16 text-xl",
    xl: "h-24 w-24 text-3xl",
  };
  const cls = sizeMap[size] || sizeMap.md;
  const initial = player?.name?.trim()?.charAt(0)?.toUpperCase() || "?";

  return (
    <span
      className={`inline-flex shrink-0 ${cls} rounded-full overflow-hidden ${ring ? "ring-2 ring-[#f97316]" : "ring-1 ring-white/10"}`}
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

/* ─── Stat pill ──────────────────────────────────────────────────────────────── */
function StatPill({ label, value, highlight }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border px-3 py-2.5 min-w-[64px] ${highlight ? "border-[#f97316]/40 bg-[#f97316]/10" : "border-white/6 bg-white/4"}`}
    >
      <span
        className={`score-num text-xl font-extrabold leading-none ${highlight ? "text-[#f97316]" : "text-white"}`}
      >
        {value}
      </span>
      <span className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-600">
        {label}
      </span>
    </div>
  );
}

/* ─── Flippable Player Card ──────────────────────────────────────────────────── */
function PlayerDetailCard({
  player,
  onClose,
  onPrev,
  onNext,
  hasNext,
  hasPrev,
}) {
  const [flipped, setFlipped] = useState(false);
  const touchStartX = useRef(null);

  const batting = player.batting || {};
  const bowling = player.bowling || {};

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      dx < 0 ? onNext?.() : onPrev?.();
    }
    touchStartX.current = null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0d1117]/95 backdrop-blur-sm px-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        .card-scene { perspective: 1000px; }
        .card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 0.6s cubic-bezier(0.4,0,0.2,1);
        }
        .card-inner.is-flipped { transform: rotateY(180deg); }
        .card-front, .card-back {
          position: absolute; inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .card-back { transform: rotateY(180deg); }
        @keyframes cardIn {
          from { opacity: 0; transform: scale(0.92) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .card-pop { animation: cardIn 0.35s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      {/* Backdrop close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 w-full h-full cursor-default"
        aria-label="Close"
      />

      {/* Close + nav */}
      <div className="relative z-10 w-full max-w-sm flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-white/20 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
        >
          ←
        </button>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
          Tap card to flip
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-white/20 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
        >
          →
        </button>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm" style={{ height: 480 }}>
        <div className="card-scene w-full h-full card-pop">
          <div
            className={`card-inner w-full h-full ${flipped ? "is-flipped" : ""}`}
            onClick={() => setFlipped((f) => !f)}
          >
            {/* ── FRONT: Profile + Batting ── */}
            <div className="card-front">
              <div className="w-full h-full rounded-3xl border border-white/8 bg-gradient-to-b from-slate-900 to-[#0d1117] overflow-hidden flex flex-col shadow-2xl">
                {/* Hero */}
                <div className="relative px-6 pt-7 pb-5 flex flex-col items-center gap-3 border-b border-white/6">
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      background:
                        "radial-gradient(ellipse at 50% 0%, #f97316 0%, transparent 70%)",
                    }}
                  />
                  <PlayerAvatar player={player} size="xl" ring />
                  <div className="text-center">
                    <p className="score-num text-2xl font-extrabold text-white leading-tight">
                      {player.name}
                    </p>
                    <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#f97316]">
                      Batting Stats
                    </p>
                  </div>
                  {/* Flip hint */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full border border-white/8 bg-white/5 px-2 py-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                      flip →
                    </span>
                  </div>
                </div>

                {/* Batting grid */}
                <div className="flex-1 flex flex-col justify-center px-5 py-4 gap-3">
                  <div className="grid grid-cols-5 gap-2">
                    <StatPill label="Mat" value={batting.matches || 0} />
                    <StatPill label="Inns" value={batting.innings || 0} />
                    <StatPill
                      label="Runs"
                      value={batting.runs || 0}
                      highlight
                    />
                    <StatPill
                      label="Avg"
                      value={battingAverage(
                        batting,
                        player.computedStats?.batting,
                      )}
                      highlight
                    />
                    <StatPill
                      label="SR"
                      value={strikeRate(batting, player.computedStats?.batting)}
                      highlight
                    />
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    <StatPill label="4s" value={batting.fours || 0} />
                    <StatPill label="6s" value={batting.sixes || 0} />
                    <StatPill label="30s" value={batting.thirties || 0} />
                    <StatPill label="50s" value={batting.fifties || 0} />
                    <StatPill
                      label="100s"
                      value={batting.hundreds || 0}
                      highlight
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── BACK: Bowling ── */}
            <div className="card-back">
              <div className="w-full h-full rounded-3xl border border-white/8 bg-gradient-to-b from-[#0d1117] to-slate-900 overflow-hidden flex flex-col shadow-2xl">
                {/* Hero */}
                <div className="relative px-6 pt-7 pb-5 flex flex-col items-center gap-3 border-b border-white/6">
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      background:
                        "radial-gradient(ellipse at 50% 0%, #38bdf8 0%, transparent 70%)",
                    }}
                  />
                  <PlayerAvatar player={player} size="xl" />
                  <div className="text-center">
                    <p className="score-num text-2xl font-extrabold text-white leading-tight">
                      {player.name}
                    </p>
                    <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-sky-400">
                      Bowling Stats
                    </p>
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full border border-white/8 bg-white/5 px-2 py-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                      flip →
                    </span>
                  </div>
                </div>

                {/* Bowling grid */}
                <div className="flex-1 flex flex-col justify-center px-5 py-4 gap-3">
                  <div className="grid grid-cols-5 gap-2">
                    <StatPill label="Mat" value={bowling.matches || 0} />
                    <StatPill label="Overs" value={bowling.overs || 0} />
                    <StatPill label="Balls" value={bowling.balls || 0} />
                    <StatPill
                      label="Econ"
                      value={economyRate(
                        bowling,
                        player.computedStats?.bowling,
                      )}
                      highlight
                    />
                    <StatPill
                      label="Wkts"
                      value={bowling.wickets || 0}
                      highlight
                    />
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    <StatPill
                      label="Avg"
                      value={bowlingAverage(
                        bowling,
                        player.computedStats?.bowling,
                      )}
                      highlight
                    />
                    <StatPill label="Runs" value={bowling.runs || 0} />
                    <StatPill label="3fers" value={bowling.threeWickets || 0} />
                    <StatPill label="4fers" value={bowling.fourWickets || 0} />
                    <StatPill label="5fers" value={bowling.fiveWickets || 0} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-5 flex items-center gap-3">
        <div className="h-px w-10 bg-white/8" />
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">
          swipe left / right to browse
        </span>
        <div className="h-px w-10 bg-white/8" />
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="relative z-10 mt-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-500 transition-all hover:border-red-800/60 hover:text-red-500"
      >
        ✕
      </button>
    </div>
  );
}

/* ─── Row in the main table ──────────────────────────────────────────────────── */
function PlayerRow({ player, onClick, index }) {
  const batting = player.batting || {};
  const bowling = player.bowling || {};
  return (
    <tr
      onClick={onClick}
      className="group cursor-pointer border-b border-white/5 last:border-0 transition-colors hover:bg-white/4"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <td className="py-3 pl-4 pr-3">
        <div className="flex items-center gap-2.5">
          <PlayerAvatar player={player} size="sm" />
          <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
            {player.name}
          </span>
        </div>
      </td>
      <td className="py-3 pr-3 text-right text-sm tabular-nums text-slate-400">
        {batting.matches || 0}
      </td>
      <td className="py-3 pr-3 text-right text-sm tabular-nums text-slate-400">
        {batting.runs || 0}
      </td>
      <td className="py-3 pr-3 text-right text-sm tabular-nums font-bold text-[#f97316]">
        {battingAverage(batting, player.computedStats?.batting)}
      </td>
      <td className="py-3 pr-3 text-right text-sm tabular-nums text-slate-400">
        {strikeRate(batting, player.computedStats?.batting)}
      </td>
      <td className="py-3 pr-3 text-right text-sm tabular-nums text-slate-400">
        {batting.highestScore || 0}
      </td>
      <td className="py-3 pr-3 text-right text-sm tabular-nums text-slate-400">
        {bowling.wickets || 0}
      </td>
      <td className="py-3 pr-3 text-right text-sm tabular-nums font-bold text-sky-400">
        {economyRate(bowling, player.computedStats?.bowling)}
      </td>
      <td className="py-3 pr-4 text-right">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 group-hover:text-[#f97316] transition-colors">
          View →
        </span>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════════ */
export default function PlayerProfilesPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { activeGroupId, activeGroupName } = useActiveGroup();
  const cache = usePageCache("dugout_" + activeGroupId);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePlayer, setActivePlayer] = useState(null); // index into sortedPlayers
  const [search, setSearch] = useState("");
  const [filterBy, setFilterBy] = useState("runs");
  const [activeTab, setActiveTab] = useState("batting"); // "batting" | "bowling"

  useEffect(() => {
    let mounted = true;

    if (!activeGroupId || !token) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }
    setError("");

    const fetchFresh = () =>
      getGroupPlayersWithStats(activeGroupId, token)
        .then((res) => {
          if (!mounted) return;
          setPlayers(res.players || []);
          cache.set(res);
        })
        .catch((err) => {
          if (mounted) setError(err.message || "Unable to load players");
        });

    const cached = cache.get();
    if (cached !== null) {
      setPlayers(cached.players || cached || []);
      setLoading(false);
      fetchFresh();
    } else {
      setLoading(true);
      fetchFresh().finally(() => {
        if (mounted) setLoading(false);
      });
    }
    return () => {
      mounted = false;
    };
  }, [activeGroupId, token]);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );

  const filteredPlayers = useMemo(
    () =>
      sortedPlayers.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [sortedPlayers, search],
  );

  useEffect(() => {
    const validOptions =
      activeTab === "batting" ? BATTING_FILTER_OPTIONS : BOWLING_FILTER_OPTIONS;
    const isValid = validOptions.some((option) => option.value === filterBy);
    if (!isValid) {
      setFilterBy(activeTab === "batting" ? "runs" : "wickets");
    }
  }, [activeTab, filterBy]);

  const currentFilterLabel =
    (activeTab === "batting"
      ? BATTING_FILTER_OPTIONS
      : BOWLING_FILTER_OPTIONS
    ).find((option) => option.value === filterBy)?.label || "Runs";

  const asNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const battingSortValue = (player) => {
    const battingData = player.batting || {};
    const computedBatting = player.computedStats?.batting || {};
    switch (filterBy) {
      case "matches":
        return asNumber(battingData.matches);
      case "innings":
        return asNumber(battingData.innings);
      case "average":
        return asNumber(computedBatting.average);
      case "fours":
        return asNumber(battingData.fours);
      case "sixes":
        return asNumber(battingData.sixes);
      case "hundreds":
        return asNumber(battingData.hundreds);
      case "fifties":
        return asNumber(battingData.fifties);
      case "thirties":
        return asNumber(battingData.thirties);
      case "strikeRate":
        return asNumber(computedBatting.strikeRate);
      case "runs":
      default:
        return asNumber(battingData.runs);
    }
  };

  const bowlingSortValue = (player) => {
    const bowlingData = player.bowling || {};
    const computedBowling = player.computedStats?.bowling || {};
    switch (filterBy) {
      case "economy": {
        const economy = asNumber(computedBowling.economy);
        return economy > 0 ? economy : Number.MAX_SAFE_INTEGER;
      }
      case "overs":
        return asNumber(bowlingData.overs);
      case "balls":
        return asNumber(bowlingData.balls);
      case "runs":
        return asNumber(bowlingData.runs);
      case "matches":
        return asNumber(bowlingData.matches);
      case "average":
        return asNumber(computedBowling.average);
      case "threeWickets":
        return asNumber(bowlingData.threeWickets);
      case "fourWickets":
        return asNumber(bowlingData.fourWickets);
      case "fiveWickets":
        return asNumber(bowlingData.fiveWickets);
      case "wickets":
      default:
        return asNumber(bowlingData.wickets);
    }
  };

  const battingSorted = useMemo(
    () => {
      if (activeTab !== "batting") return [];
      return [...filteredPlayers].sort(
        (a, b) => battingSortValue(b) - battingSortValue(a),
      );
    },
    [filteredPlayers, filterBy, activeTab],
  );

  const bowlingSorted = useMemo(
    () => {
      if (activeTab !== "bowling") return [];
      return [...filteredPlayers].sort((a, b) => {
        if (filterBy === "economy") {
          return bowlingSortValue(a) - bowlingSortValue(b);
        }
        return bowlingSortValue(b) - bowlingSortValue(a);
      });
    },
    [filteredPlayers, filterBy, activeTab],
  );

  const displayList = activeTab === "batting" ? battingSorted : bowlingSorted;

  function openPlayer(globalIndex) {
    // find in displayList
    setActivePlayer(globalIndex);
  }

  const batting = (player) => player.batting || {};
  const bowling = (player) => player.bowling || {};

  return (
    <div
      className="min-h-screen bg-[#0d1117] text-white"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800;900&display=swap');
        .score-num { font-family: 'Barlow Condensed', sans-serif; }
        .btn-tap { transition: transform 0.08s, opacity 0.1s; }
        .btn-tap:active { transform: scale(0.95); opacity: 0.85; }
        @keyframes rowIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .row-fade { animation: rowIn 0.3s ease both; }
        input::placeholder { color: #334155; }
      `}</style>

      {/* ══ STICKY HEADER ══ */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0d1117]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316]">
              <span className="text-[10px] font-black text-white">C</span>
            </div>
            <span className="text-sm font-black uppercase tracking-[0.15em] text-white">
              CricTrack
            </span>
          </Link>
          <span className="text-[11px] font-black uppercase tracking-widest text-[#f97316]">
            Dugout
          </span>
          <div className="flex items-center gap-2">
            <ProfileToolbarButton />
            <GroupChip />
            <button
              type="button"
              onClick={() => navigate("/")}
              className="btn-tap text-[11px] font-medium text-slate-600 hover:text-slate-300 transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-20">
        {/* ── Hero ── */}
        <div className="mb-7">
          <div className="flex flex-col items-start gap-1">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#f97316]">
              Player Hub
            </p>
            <h1 className="score-num text-5xl font-extrabold leading-none text-white">
              The Dugout
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {activeGroupName ? (
                <>
                  Career stats for{" "}
                  <span className="font-bold text-slate-300">
                    {activeGroupName}
                  </span>
                </>
              ) : (
                "Career stats for your active group"
              )}
            </p>
          </div>
        </div>

        {/* ── Search + Tab ── */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 text-xs">
              🔍
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player…"
              className="w-full rounded-xl border border-white/8 bg-white/5 pl-8 pr-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#f97316] transition-all"
            />
          </div>

          {/* Tabs */}
          <div className="flex rounded-xl border border-white/8 bg-white/4 p-1 gap-1">
            {[
              { key: "batting", label: "🏏 Batting" },
              { key: "bowling", label: "⚾ Bowling" },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveTab(key);
                  setFilterBy(key === "batting" ? "runs" : "wickets");
                }}
                className={`btn-tap rounded-lg px-4 py-1.5 text-[11px] font-black uppercase tracking-widest transition-all ${
                  activeTab === key
                    ? "bg-[#f97316] text-white shadow-md shadow-orange-900/30"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
              Filter by
            </span>
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[11px] font-bold text-slate-200 outline-none focus:ring-2 focus:ring-[#f97316]"
            >
              {(activeTab === "batting"
                ? BATTING_FILTER_OPTIONS
                : BOWLING_FILTER_OPTIONS
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── States ── */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
            <p className="text-sm text-slate-500">Loading players…</p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && !activeGroupId && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="text-4xl">🏏</span>
            <p className="text-sm text-slate-600">
              No active group selected.{" "}
              <Link to="/groups" className="text-[#f97316] underline">
                Join or create a group
              </Link>{" "}
              to see player stats.
            </p>
          </div>
        )}

        {!loading && !error && activeGroupId && sortedPlayers.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="text-4xl">🏏</span>
            <p className="text-sm text-slate-600">
              No players in{" "}
              <span className="font-bold text-slate-400">
                {activeGroupName || "this group"}
              </span>{" "}
              yet. Add players from umpire mode first.
            </p>
          </div>
        )}

        {/* ── Main Table ── */}
        {!loading && !error && displayList.length > 0 && (
          <div className="rounded-2xl border border-white/8 bg-slate-900/50 overflow-hidden">
            {/* Hint */}
            <div className="border-b border-white/5 px-4 py-2.5 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                Sorted by {currentFilterLabel.toLowerCase()} ·{" "}
                {displayList.length} players
              </p>
              <span className="text-[10px] text-slate-700">
                Click a player to view full card
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/6">
                    <th className="py-2.5 pl-4 pr-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-600">
                      Player
                    </th>
                    {activeTab === "batting" ? (
                      <>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Mat
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Inns
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Runs
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-[#f97316]/60">
                          Avg
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          SR
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          4s
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          6s
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          30s
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          50s
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          100s
                        </th>
                        <th className="py-2.5 pr-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-700"></th>
                      </>
                    ) : (
                      <>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Mat
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Overs
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Balls
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Econ
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-[#f97316]/60">
                          Wkts
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Avg
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Runs
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          3fers
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          4fers
                        </th>
                        <th className="py-2.5 pr-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-600">
                          5fers
                        </th>
                        <th className="py-2.5 pr-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-700"></th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {displayList.map((player, i) => {
                    if (activeTab === "batting") {
                      const b = player.batting || {};
                      return (
                        <tr
                          key={player._id}
                          onClick={() => setActivePlayer(i)}
                          className="row-fade group cursor-pointer border-b border-white/4 last:border-0 transition-colors hover:bg-white/4"
                          style={{
                            animationDelay: `${Math.min(i * 25, 400)}ms`,
                          }}
                        >
                          <td className="py-3 pl-4 pr-3">
                            <div className="flex items-center gap-2.5">
                              <span className="score-num w-5 text-right text-[11px] font-bold text-slate-700">
                                {i + 1}
                              </span>
                              <PlayerAvatar player={player} size="sm" />
                              <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                                {player.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-500">
                            {b.matches || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-500">
                            {b.innings || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums font-bold text-white">
                            {b.runs || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums font-bold text-[#f97316]">
                            {battingAverage(b, player.computedStats?.batting)}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {strikeRate(b, player.computedStats?.batting)}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {b.fours || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-500">
                            {b.sixes || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {b.thirties || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {b.fifties || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {b.hundreds || 0}
                          </td>
                          <td className="py-3 pr-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-700 group-hover:text-[#f97316] transition-colors">
                            →
                          </td>
                        </tr>
                      );
                    } else {
                      const bow = player.bowling || {};
                      return (
                        <tr
                          key={player._id}
                          onClick={() => setActivePlayer(i)}
                          className="row-fade group cursor-pointer border-b border-white/4 last:border-0 transition-colors hover:bg-white/4"
                          style={{
                            animationDelay: `${Math.min(i * 25, 400)}ms`,
                          }}
                        >
                          <td className="py-3 pl-4 pr-3">
                            <div className="flex items-center gap-2.5">
                              <span className="score-num w-5 text-right text-[11px] font-bold text-slate-700">
                                {i + 1}
                              </span>
                              <PlayerAvatar player={player} size="sm" />
                              <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                                {player.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-500">
                            {bow.matches || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {bow.overs || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {bow.balls || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums font-bold text-sky-400">
                            {economyRate(bow, player.computedStats?.bowling)}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums font-bold text-[#f97316]">
                            {bow.wickets || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {bowlingAverage(bow, player.computedStats?.bowling)}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-white">
                            {bow.runs || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {bow.threeWickets || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {bow.fourWickets || 0}
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-400">
                            {bow.fiveWickets || 0}
                          </td>
                          <td className="py-3 pr-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-700 group-hover:text-[#f97316] transition-colors">
                            →
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── No search results ── */}
        {!loading &&
          !error &&
          sortedPlayers.length > 0 &&
          displayList.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="text-3xl">🔍</span>
              <p className="text-sm text-slate-600">
                No players match this filter
              </p>
            </div>
          )}
      </main>

      {/* ── Player Detail Modal ── */}
      {activePlayer !== null && displayList[activePlayer] && (
        <PlayerDetailCard
          player={displayList[activePlayer]}
          onClose={() => setActivePlayer(null)}
          onPrev={() =>
            setActivePlayer(
              (i) => (i - 1 + displayList.length) % displayList.length,
            )
          }
          onNext={() => setActivePlayer((i) => (i + 1) % displayList.length)}
          hasPrev={displayList.length > 1}
          hasNext={displayList.length > 1}
        />
      )}

      <BottomNav />
    </div>
  );
}
