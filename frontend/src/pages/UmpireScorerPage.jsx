import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { createMatchSocket } from "../services/socket";
import { getMatch } from "../services/api";
import { checkMatchEnd } from "../utils/matchResult";

/* ─── constants ─────────────────────────────────────────────────────────────── */
const RUN_OPTIONS = [0, 1, 2, 3, 4, 6];
const WICKET_TYPES = [
  "bowled",
  "caught",
  "lbw",
  "run-out",
  "stumped",
  "hit-wicket",
];

/* ─── helpers ───────────────────────────────────────────────────────────────── */
function calcOvers(b) {
  return `${Math.floor(b / 6)}.${b % 6}`;
}
function calcEcon(r, b) {
  return b === 0 ? "—" : (r / (b / 6)).toFixed(1);
}

function getBallLabel(ball) {
  if (ball.isWicket) return "W";
  if (ball.extraType === "wide")
    return ball.extraRuns > 1 ? `Wd+${ball.extraRuns - 1}` : "Wd";
  if (ball.extraType === "no-ball")
    return ball.runsOffBat > 0 ? `Nb+${ball.runsOffBat}` : "Nb";
  if (ball.extraType === "bye") return `B${ball.extraRuns || 0}`;
  if (ball.extraType === "leg-bye") return `LB${ball.extraRuns || 0}`;
  const runs = ball.runsOffBat ?? ball.runs ?? 0;
  return runs === 0 ? "0" : String(runs);
}

function isValidBall(ball) {
  if (typeof ball?.isValidBall === "boolean") return ball.isValidBall;
  return ball.extraType !== "wide" && ball.extraType !== "no-ball";
}

function buildCurrentOver(timeline = []) {
  if (!timeline.length) return [];
  let cur = [],
    valid = 0;
  for (const ball of timeline) {
    cur.push({ label: getBallLabel(ball), ball });
    if (isValidBall(ball)) {
      valid++;
      if (valid % 6 === 0) cur = [];
    }
  }
  return cur;
}

function getBatterStat(match, name) {
  if (!name) return { runs: 0, balls: 0, fours: 0, sixes: 0 };
  const p = (match?.playerStats || []).find((x) => x.name === name);
  return {
    runs: p?.batting?.runs ?? 0,
    balls: p?.batting?.balls ?? 0,
    fours: p?.batting?.fours ?? 0,
    sixes: p?.batting?.sixes ?? 0,
  };
}

function getBowlerStat(match, name) {
  if (!name) return { balls: 0, wickets: 0, runs: 0 };
  const p = (match?.playerStats || []).find((x) => x.name === name);
  return {
    balls: p?.bowling?.balls ?? 0,
    wickets: p?.bowling?.wickets ?? 0,
    runs: p?.bowling?.runs ?? 0,
  };
}

function normalizeMatch(m) {
  if (!m) return m;
  return {
    ...m,
    striker: m.striker ?? m.currentStriker ?? null,
    nonStriker: m.nonStriker ?? m.currentNonStriker ?? null,
  };
}

/* ─── sub-components ────────────────────────────────────────────────────────── */

function PlayerAvatar({ name, photoUrl, size = "md", highlight = false }) {
  const [err, setErr] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const sz =
    {
      sm: "h-7 w-7 text-[11px]",
      md: "h-9 w-9 text-sm",
      lg: "h-11 w-11 text-base",
    }[size] ?? "h-9 w-9 text-sm";
  return (
    <span
      className={`relative inline-flex shrink-0 ${sz} rounded-full overflow-hidden ring-2 ${highlight ? "ring-[#f97316]" : "ring-white/10"}`}
    >
      {photoUrl && !err ? (
        <img
          src={photoUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setErr(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-600 to-slate-800 font-bold text-slate-200">
          {initial}
        </span>
      )}
      {highlight && (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#f97316] ring-1 ring-[#0d1117]" />
      )}
    </span>
  );
}

function BallChip({ label }) {
  const base =
    "inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold shrink-0";
  if (label === "W")
    return <span className={`${base} bg-red-600 text-white`}>W</span>;
  if (label === "4")
    return <span className={`${base} bg-blue-600 text-white`}>4</span>;
  if (label === "6")
    return <span className={`${base} bg-emerald-500 text-white`}>6</span>;
  if (label?.startsWith("Wd"))
    return (
      <span
        className={`${base} bg-amber-500/25 text-amber-300 ring-1 ring-amber-500/40`}
      >
        {label}
      </span>
    );
  if (label?.startsWith("Nb"))
    return (
      <span
        className={`${base} bg-orange-500/25 text-orange-300 ring-1 ring-orange-500/40`}
      >
        {label}
      </span>
    );
  if (label === "0")
    return <span className={`${base} bg-slate-800 text-slate-600`}>·</span>;
  return <span className={`${base} bg-slate-700 text-slate-200`}>{label}</span>;
}

function Modal({ title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#161b22] shadow-2xl p-5">
        <p className="text-sm font-bold text-white mb-4">{title}</p>
        {children}
      </div>
    </div>
  );
}

function ModalSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#f97316] mb-3"
    >
      <option value="">{placeholder}</option>
      {options.map((p) => (
        <option key={p.name || p} value={p.name || p}>
          {p.name || p}
        </option>
      ))}
    </select>
  );
}

function ModalBtn({ onClick, disabled, label, variant = "primary" }) {
  const cls =
    variant === "primary"
      ? "bg-[#f97316] text-white hover:bg-orange-500"
      : "bg-slate-700 text-slate-300 hover:bg-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl px-4 py-3 text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 ${cls}`}
    >
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════════ */

export default function UmpireScorerPage() {
  const { matchId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const prevBallsBowledRef = useRef(null);

  const [match, setMatch] = useState(null);
  const [isWicket, setIsWicket] = useState(false);
  const [wicketType, setWicketType] = useState("");
  const [extraType, setExtraType] = useState(""); // 'wide' | 'no-ball' | ''
  const [dismissedBatter, setDismissedBatter] = useState("");
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  const [selectedNewBowler, setSelectedNewBowler] = useState("");
  const [showBatterModal, setShowBatterModal] = useState(false);
  const showBatterModalRef = useRef(false);
  const [selectedNewBatter, setSelectedNewBatter] = useState("");
  const [showSecondInningsModal, setShowSecondInningsModal] = useState(false);
  const [secondInningsStriker, setSecondInningsStriker] = useState("");
  const [secondInningsNonStriker, setSecondInningsNonStriker] = useState("");
  const [secondInningsBowler, setSecondInningsBowler] = useState("");
  const [matchEndStatus, setMatchEndStatus] = useState({
    isMatchOver: false,
    resultMessage: "",
  });
  const [lastBall, setLastBall] = useState(null);

  useEffect(() => {
    if (!matchId) return;
    const socket = createMatchSocket(token);
    socketRef.current = socket;

    getMatch(matchId, token)
      .then((r) => {
        if (r?.match) setMatch(normalizeMatch(r.match));
      })
      .catch(() => {});

    socket.on("connect", () => socket.emit("joinMatch", { matchId }));

    socket.on("matchState", (raw) => {
      const m = normalizeMatch(raw);
      const curr = m.ballsBowled ?? 0;
      const prev = prevBallsBowledRef.current;

      const shouldEval =
        (m.inningsNumber === 2 || typeof m.firstInningsScore === "number") &&
        typeof m.firstInningsScore === "number";
      if (shouldEval) {
        const cnt = (m.playerStats || []).filter(
          (p) => p.team === m.battingTeam,
        ).length;
        setMatchEndStatus(
          checkMatchEnd({
            teamAScore: m.firstInningsScore,
            teamBScore: m.totalRuns,
            teamBWickets: m.wickets,
            teamBPlayersCount: cnt,
            totalValidBalls: m.ballsBowled,
            totalOvers: m.totalOvers,
            teamAName: m.bowlingTeam,
            teamBName: m.battingTeam,
          }),
        );
      } else {
        setMatchEndStatus({ isMatchOver: false, resultMessage: "" });
      }

      if (m.status === "innings_complete") {
        setShowBatterModal(false);
        showBatterModalRef.current = false;
        setShowBowlerModal(false);
        setShowSecondInningsModal(true);
        setSecondInningsStriker("");
        setSecondInningsNonStriker("");
        setSecondInningsBowler("");
      }

      if (
        prev !== null &&
        curr !== prev &&
        curr > 0 &&
        curr % 6 === 0 &&
        m.status === "live"
      ) {
        setShowBowlerModal(true);
        setSelectedNewBowler("");
      }
      prevBallsBowledRef.current = curr;
      setMatch({ ...m });

      if (
        m.status === "live" &&
        !m.striker &&
        !m.currentStriker &&
        !showBatterModalRef.current
      ) {
        setShowBatterModal(true);
        showBatterModalRef.current = true;
        setSelectedNewBatter("");
      }
    });

    socket.on("innings_complete", () => {
      setShowBatterModal(false);
      showBatterModalRef.current = false;
      setShowBowlerModal(false);
      setShowSecondInningsModal(true);
      setSecondInningsStriker("");
      setSecondInningsNonStriker("");
      setSecondInningsBowler("");
    });

    socket.on("match_completed", (payload) => {
      if (payload) setMatch(normalizeMatch(payload));
      if (payload?.resultMessage)
        setMatchEndStatus({
          isMatchOver: true,
          resultMessage: payload.resultMessage,
        });
      setShowBatterModal(false);
      showBatterModalRef.current = false;
      setShowBowlerModal(false);
      setShowSecondInningsModal(false);
    });

    socket.on("matchEnded", () => navigate(`/scoreboard/${matchId}`));
    socket.on("error", ({ message }) => alert("Error: " + message));

    return () => {
      [
        "connect",
        "matchState",
        "innings_complete",
        "match_completed",
        "matchEnded",
        "error",
      ].forEach((e) => socket.off(e));
      socket.disconnect();
      socketRef.current = null;
    };
  }, [matchId, navigate, token]);

  /* ── delivery ── */
  function recordDelivery(runs) {
    const socket = socketRef.current;
    if (
      !socket ||
      !match ||
      matchEndStatus.isMatchOver ||
      showSecondInningsModal ||
      showBowlerModal
    )
      return;

    let payload;
    if (extraType === "wide") {
      payload = {
        matchId,
        runs: 0,
        extraType: "wide",
        extraRuns: 1 + Number(runs),
        isWicket: false,
        wicketType: null,
        dismissedBatter: null,
        dismissedPlayerType: null,
      };
    } else if (extraType === "no-ball") {
      payload = {
        matchId,
        runs: Number(runs),
        extraType: "no-ball",
        extraRuns: 1,
        isWicket,
        wicketType: isWicket ? wicketType : null,
        dismissedBatter: isWicket ? dismissedBatter : null,
        dismissedPlayerType: isWicket
          ? dismissedBatter === (match.nonStriker ?? match.currentNonStriker)
            ? "nonStriker"
            : "striker"
          : null,
      };
    } else {
      payload = {
        matchId,
        runs: Number(runs),
        extraType: null,
        extraRuns: 0,
        isWicket,
        wicketType: isWicket ? wicketType : null,
        dismissedBatter: isWicket ? dismissedBatter : null,
        dismissedPlayerType: isWicket
          ? dismissedBatter === (match.nonStriker ?? match.currentNonStriker)
            ? "nonStriker"
            : "striker"
          : null,
      };
    }

    // flash label
    const flash =
      extraType === "wide"
        ? runs === 0
          ? "Wd"
          : `Wd+${runs}`
        : extraType === "no-ball"
          ? runs === 0
            ? "Nb"
            : `Nb+${runs}`
          : isWicket
            ? "W"
            : String(runs);
    setLastBall(flash);
    setTimeout(() => setLastBall(null), 700);

    socket.emit("delivery", payload);
    setIsWicket(false);
    setWicketType("");
    setExtraType("");
    setDismissedBatter("");
  }

  function undoDelivery() {
    socketRef.current?.emit("undo_delivery", { matchId });
    setIsWicket(false);
    setWicketType("");
    setExtraType("");
    setDismissedBatter("");
  }

  const photoMap = useMemo(() => {
    const map = {};
    const collectPhoto = (player) => {
      const name = player?.name;
      if (!name || map[name]) return;
      const photo =
        player?.photoUrl ||
        player?.photoURL ||
        player?.avatarUrl ||
        player?.imageUrl ||
        null;
      if (photo) map[name] = photo;
    };

    if (!match) return map;

    (match?.playerStats || []).forEach(collectPhoto);
    (match?.team1Players || []).forEach(collectPhoto);
    (match?.team2Players || []).forEach(collectPhoto);

    return map;
  }, [match?.playerStats, match?.team1Players, match?.team2Players]);

  const getPhoto = (name) => {
    if (!name) return null;
    return photoMap[name] ?? null;
  };

  /* ── loading ── */
  if (!match)
    return (
      <main
        className="flex h-screen items-center justify-center bg-[#0d1117]"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
          <p className="text-slate-500 text-sm">Loading match…</p>
        </div>
      </main>
    );

  /* ── computed values ── */
  const striker = match.striker ?? match.currentStriker ?? null;
  const nonStriker = match.nonStriker ?? match.currentNonStriker ?? null;
  const totalRuns = match.totalRuns ?? 0;
  const wickets = match.wickets ?? 0;
  const ballsBowled = match.ballsBowled ?? 0;
  const oversBowled = Math.floor(ballsBowled / 6);
  const ballsInOver = ballsBowled % 6;
  const runRate =
    ballsBowled > 0 ? ((totalRuns / ballsBowled) * 6).toFixed(2) : "0.00";
  const targetScore = match.targetScore ?? null;
  const runsNeeded = targetScore ? Math.max(0, targetScore - totalRuns) : null;
  const ballsLeft = targetScore
    ? Math.max(0, (match.totalOvers || 0) * 6 - ballsBowled)
    : null;
  const rrr = targetScore
    ? ballsLeft > 0
      ? ((runsNeeded * 6) / ballsLeft).toFixed(2)
      : runsNeeded > 0
        ? "∞"
        : "0.00"
    : null;

  const currentOverBalls = buildCurrentOver(match.timeline || []);
  const validThisOver = currentOverBalls.filter((b) =>
    isValidBall(b.ball),
  ).length;
  const dotsRemaining = validThisOver >= 6 ? 0 : 6 - validThisOver;

  const strikerStats = getBatterStat(match, striker);
  const nonStrikerStats = getBatterStat(match, nonStriker);
  const bowlerStat = getBowlerStat(match, match.currentBowler);

  const bowlingTeamPlayers = (match.playerStats || []).filter(
    (p) => p.team === match.bowlingTeam,
  );
  const battingTeamAll = (match.playerStats || []).filter(
    (p) => p.team === match.battingTeam,
  );
  const battingTeamActive = battingTeamAll.filter((p) => !p.isOut);
  const occupiedBatter = striker ?? nonStriker;
  const newBatterOptions = battingTeamActive.filter(
    (p) => p.name !== occupiedBatter,
  );
  const nextBatterRole =
    match.nextBatterFor === "nonStriker" ? "Non-Striker" : "Striker";

  const isMatchDone =
    matchEndStatus.isMatchOver || match.status === "completed";

  /* run button label for wide mode */
  function runLabel(r) {
    if (extraType === "wide") return r === 0 ? "Wd" : `+${r}`;
    if (extraType === "no-ball") return r === 0 ? "Nb" : `+${r}`;
    return String(r);
  }

  /* run button color */
  function runBtnCls(r) {
    if (isWicket && extraType !== "no-ball")
      return "bg-red-900/30 border-red-800/60 text-red-300 hover:bg-red-800/40";
    if (r === 4 && extraType !== "wide")
      return "bg-blue-700/25 border-blue-600/50 text-blue-300 hover:bg-blue-700/40";
    if (r === 6 && extraType !== "wide")
      return "bg-emerald-700/25 border-emerald-600/50 text-emerald-300 hover:bg-emerald-700/40";
    if (r === 0)
      return "bg-white/5 border-white/8 text-slate-500 hover:bg-white/10";
    return "bg-white/8 border-white/12 text-slate-200 hover:bg-white/15";
  }

  /* flash color */
  const flashColor =
    lastBall === "W"
      ? "text-red-400"
      : lastBall === "4"
        ? "text-blue-400"
        : lastBall === "6"
          ? "text-emerald-400"
          : lastBall?.startsWith("Wd")
            ? "text-amber-400"
            : lastBall?.startsWith("Nb")
              ? "text-orange-400"
              : "text-white";

  return (
    <main
      className="min-h-[100dvh] w-full overflow-x-hidden bg-[#0d1117] text-white flex flex-col select-none md:h-[100dvh] md:overflow-hidden"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        .flash { animation: popIn 0.5s cubic-bezier(.36,.07,.19,.97); }
        @keyframes popIn {
          0%  { transform: scale(2); opacity: 0; }
          60% { transform: scale(0.9); opacity: 1; }
          100%{ transform: scale(1); opacity: 1; }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ═══ MODALS ═══ */}

      {showSecondInningsModal && (
        <Modal title="Set 2nd Innings — Choose Openers &amp; Bowler">
          <ModalSelect
            value={secondInningsStriker}
            onChange={(v) => {
              setSecondInningsStriker(v);
              if (v === secondInningsNonStriker) setSecondInningsNonStriker("");
            }}
            options={battingTeamAll.filter(
              (p) => p.name !== secondInningsNonStriker,
            )}
            placeholder="— Striker —"
          />
          <ModalSelect
            value={secondInningsNonStriker}
            onChange={(v) => {
              setSecondInningsNonStriker(v);
              if (v === secondInningsStriker) setSecondInningsStriker("");
            }}
            options={battingTeamAll.filter(
              (p) => p.name !== secondInningsStriker,
            )}
            placeholder="— Non-Striker —"
          />
          <ModalSelect
            value={secondInningsBowler}
            onChange={setSecondInningsBowler}
            options={bowlingTeamPlayers}
            placeholder="— Bowler —"
          />
          <ModalBtn
            onClick={() => {
              if (
                !secondInningsStriker ||
                !secondInningsNonStriker ||
                !secondInningsBowler ||
                secondInningsStriker === secondInningsNonStriker
              )
                return;
              socketRef.current?.emit("setOpeners", {
                matchId,
                striker: secondInningsStriker,
                nonStriker: secondInningsNonStriker,
                bowler: secondInningsBowler,
              });
              setShowSecondInningsModal(false);
            }}
            disabled={
              !secondInningsStriker ||
              !secondInningsNonStriker ||
              !secondInningsBowler ||
              secondInningsStriker === secondInningsNonStriker
            }
            label="Start 2nd Innings"
          />
        </Modal>
      )}

      {showBowlerModal && (
        <Modal title="End of Over — New Bowler">
          <ModalSelect
            value={selectedNewBowler}
            onChange={setSelectedNewBowler}
            options={bowlingTeamPlayers}
            placeholder="— Choose bowler —"
          />
          <ModalBtn
            onClick={() => {
              if (!selectedNewBowler) return;
              socketRef.current?.emit("setNewBowler", {
                matchId,
                bowler: selectedNewBowler,
              });
              setShowBowlerModal(false);
              setSelectedNewBowler("");
            }}
            disabled={!selectedNewBowler}
            label="Confirm Bowler"
          />
        </Modal>
      )}

      {showBatterModal && (
        <Modal title={`Wicket — New ${nextBatterRole}`}>
          <ModalSelect
            value={selectedNewBatter}
            onChange={setSelectedNewBatter}
            options={newBatterOptions}
            placeholder={`— ${nextBatterRole} —`}
          />
          <ModalBtn
            onClick={() => {
              if (!selectedNewBatter) return;
              socketRef.current?.emit("setNewBatter", {
                matchId,
                batter: selectedNewBatter,
              });
              setShowBatterModal(false);
              showBatterModalRef.current = false;
              setSelectedNewBatter("");
            }}
            disabled={!selectedNewBatter}
            label="Confirm"
          />
        </Modal>
      )}

      {/* ═══════════════════════════════════════
          ZONE 1 — TOP NAV  (fixed 36px)
      ═══════════════════════════════════════ */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 sm:px-4 h-9 border-b border-white/5 bg-[#0d1117]">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap pr-1 scrollbar-hide">
          <Link
            to="/"
            className="text-[11px] font-black uppercase tracking-[0.15em] text-white hover:text-[#f97316] transition-colors"
          >
            CricTrack
          </Link>
          <button
            type="button"
            onClick={() => navigate("/umpire")}
            className="text-[11px] text-slate-600 hover:text-slate-300 transition-colors btn-tap"
          >
            Back
          </button>
          <Link
            to={`/scoreboard/${matchId}`}
            className="text-[11px] text-slate-600 hover:text-slate-300 transition-colors"
          >
            Scoreboard
          </Link>
        </div>
        <span className="hidden sm:inline text-[11px] font-black uppercase tracking-[0.2em] text-[#f97316]">
          Umpire
        </span>
        <button
          type="button"
          onClick={() => socketRef.current?.emit("swapStriker", { matchId })}
          disabled={match.status !== "live" || !striker || !nonStriker}
          className="text-[11px] font-bold text-slate-500 hover:text-[#f97316] disabled:opacity-25 disabled:cursor-not-allowed transition-colors btn-tap"
        >
          ⇄ Swap
        </button>
      </div>

      {/* ═══════════════════════════════════════
          ZONE 2 — SCOREBOARD HEADER  (~120px)
      ═══════════════════════════════════════ */}
      <div className="shrink-0 px-3 pt-2 pb-2 border-b border-white/5 bg-gradient-to-b from-slate-900/50 to-transparent">
        {/* Result banner */}
        {isMatchDone && matchEndStatus.resultMessage && (
          <div className="mb-1.5 rounded-lg bg-[#f97316]/15 border border-[#f97316]/30 px-3 py-1 text-[11px] font-bold text-[#f97316] text-center">
            🏆 {matchEndStatus.resultMessage}
          </div>
        )}

        {/* Score + flash */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#f97316] mb-0.5">
              {match.battingTeam}
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="score-num text-5xl font-extrabold leading-none">
                {totalRuns}/{wickets}
              </span>
              <span className="score-num text-xl font-semibold text-slate-500">
                ({oversBowled}.{ballsInOver}/{match.totalOvers})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-[11px] text-slate-500">
                RR <span className="font-bold text-slate-300">{runRate}</span>
              </span>
              {targetScore && (
                <>
                  <span className="text-slate-700 text-[10px]">·</span>
                  <span className="text-[11px] text-slate-500">
                    Need{" "}
                    <span className="font-bold text-indigo-300">
                      {runsNeeded}
                    </span>{" "}
                    off{" "}
                    <span className="font-bold text-indigo-300">
                      {ballsLeft}b
                    </span>
                  </span>
                  <span className="text-slate-700 text-[10px]">·</span>
                  <span className="text-[11px] text-slate-500">
                    RRR <span className="font-bold text-indigo-300">{rrr}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Flash OR bowling team score */}
          <div className="flex flex-col items-end min-w-[56px]">
            {lastBall ? (
              <span
                key={lastBall}
                className={`flash score-num text-5xl font-black leading-none ${flashColor}`}
              >
                {lastBall}
              </span>
            ) : (
              <>
                <p className="text-[10px] text-slate-700 uppercase tracking-wide">
                  {match.bowlingTeam}
                </p>
                {match.firstInningsScore != null && (
                  <p className="score-num text-xl font-bold text-slate-600">
                    {match.firstInningsScore}
                  </p>
                )}
                {targetScore && (
                  <p className="text-[11px] text-slate-600">
                    Target{" "}
                    <span className="font-bold text-slate-400">
                      {targetScore}
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Batters + Bowler row */}
        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {/* Striker */}
          <div className="flex items-center gap-2 rounded-xl bg-[#f97316]/8 border border-[#f97316]/20 px-2 py-1.5">
            <PlayerAvatar
              name={striker}
              photoUrl={getPhoto(striker)}
              size="md"
              highlight
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-white truncate leading-tight">
                {striker || "—"} <span className="text-[#f97316]">*</span>
              </p>
              <p className="text-[11px] sm:text-[10px] text-slate-500 tabular-nums leading-tight">
                {strikerStats.runs}({strikerStats.balls})
              </p>
              <p className="text-[11px] sm:text-[10px] text-slate-600 leading-tight">
                {strikerStats.fours}×4 {strikerStats.sixes}×6
              </p>
            </div>
          </div>

          {/* Non-Striker */}
          <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/5 px-2 py-1.5">
            <PlayerAvatar
              name={nonStriker}
              photoUrl={getPhoto(nonStriker)}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-slate-300 truncate leading-tight">
                {nonStriker || "—"}
              </p>
              <p className="text-[11px] sm:text-[10px] text-slate-500 tabular-nums leading-tight">
                {nonStrikerStats.runs}({nonStrikerStats.balls})
              </p>
              <p className="text-[11px] sm:text-[10px] text-slate-600 leading-tight">
                {nonStrikerStats.fours}×4 {nonStrikerStats.sixes}×6
              </p>
            </div>
          </div>

          {/* Bowler */}
          <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/5 px-2 py-1.5">
            <PlayerAvatar
              name={match.currentBowler}
              photoUrl={getPhoto(match.currentBowler)}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] sm:text-[10px] font-black uppercase tracking-wide text-slate-600 leading-tight">
                Bowling
              </p>
              <p className="text-[11px] font-semibold text-slate-300 truncate leading-tight">
                {match.currentBowler || "—"}
              </p>
              <p className="text-[11px] sm:text-[10px] text-slate-500 tabular-nums leading-tight">
                {calcOvers(bowlerStat.balls)} · {bowlerStat.wickets}/
                {bowlerStat.runs}
                {bowlerStat.balls > 0 && (
                  <span className="ml-1 text-slate-600">
                    ({calcEcon(bowlerStat.runs, bowlerStat.balls)})
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Current over chips */}
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 shrink-0 mr-1">
            Ov {oversBowled + 1}
          </span>
          {currentOverBalls.map((item, i) => (
            <BallChip key={i} label={item.label} />
          ))}
          {Array.from({ length: dotsRemaining }).map((_, i) => (
            <span
              key={i}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-800/80 text-slate-800 text-[10px] shrink-0 font-bold"
            >
              ·
            </span>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          ZONE 3 — DELIVERY CONTROLS  (flex-1)
          Everything flex-1 so it fills the
          remaining viewport with NO scroll.
      ═══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col px-3 pt-2 pb-2 gap-2 min-h-0">
        {/* ── Toggle row: Wide | No Ball | Wicket ── */}
        <div className="shrink-0 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            {
              key: "wide",
              label: "Wide",
              activeClass: "bg-amber-500/20 border-amber-500/70 text-amber-300",
              onClick: () => {
                const n = extraType === "wide" ? "" : "wide";
                setExtraType(n);
                if (n === "wide") {
                  setIsWicket(false);
                  setWicketType("");
                  setDismissedBatter("");
                }
              },
            },
            {
              key: "no-ball",
              label: "No Ball",
              activeClass:
                "bg-orange-500/20 border-orange-500/70 text-orange-300",
              onClick: () =>
                setExtraType(extraType === "no-ball" ? "" : "no-ball"),
            },
            {
              key: "wicket",
              label: "🎯 Wicket",
              activeClass: "bg-red-500/20 border-red-500/70 text-red-400",
              onClick: () => {
                const n = !isWicket;
                setIsWicket(n);
                if (!n) {
                  setWicketType("");
                  setDismissedBatter("");
                }
              },
            },
          ].map(({ key, label, activeClass, onClick }) => {
            const isActive = key === "wicket" ? isWicket : extraType === key;
            return (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`btn-tap rounded-xl py-2.5 text-[11px] font-black uppercase tracking-widest border transition-all ${isActive ? activeClass : "bg-white/5 border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15"}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Wicket detail (inline, collapses when not needed) ── */}
        {isWicket && (
          <div className="shrink-0 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={wicketType}
              onChange={(e) => setWicketType(e.target.value)}
              className="rounded-xl border border-red-900/50 bg-slate-900 px-3 py-2 text-[11px] text-white outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="">— How out? —</option>
              {WICKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
            <select
              value={dismissedBatter}
              onChange={(e) => setDismissedBatter(e.target.value)}
              className="rounded-xl border border-red-900/50 bg-slate-900 px-3 py-2 text-[11px] text-white outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="">— Batter out? —</option>
              {battingTeamActive.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ── RUN BUTTONS  (flex-1 — the main area) ── */}
        <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-2 min-h-0">
          {RUN_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => recordDelivery(r)}
              disabled={isMatchDone && match.status === "completed"}
              className={`btn-tap flex items-center justify-center rounded-2xl border font-black transition-all disabled:opacity-30 disabled:cursor-not-allowed ${runBtnCls(r)}`}
            >
              <span className="score-num text-4xl leading-none">
                {runLabel(r)}
              </span>
            </button>
          ))}
        </div>

        {/* ── Undo row ── */}
        <button
          type="button"
          onClick={undoDelivery}
          disabled={!match.timeline?.length || isMatchDone}
          className="shrink-0 btn-tap w-full rounded-xl border border-red-900/30 bg-red-950/20 py-2 text-[11px] font-black uppercase tracking-widest text-red-700 hover:text-red-500 hover:border-red-800/50 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        >
          ↩ Undo Last Ball
        </button>
      </div>
    </main>
  );
}
