import { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { createMatchSocket } from "../services/socket";
import { getMatch } from "../services/api";
import { checkMatchEnd } from "../utils/matchResult";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function getBallLabel(ball) {
  if (ball.extraType === "wide") return "Wd";
  if (ball.isWicket) return "W";
  const runs = Number(ball.runsOffBat || 0) + Number(ball.extraRuns || 0);
  return runs === 0 ? "•" : String(runs);
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
    cur.push(getBallLabel(ball));
    if (isValidBall(ball)) {
      valid++;
      if (valid % 6 === 0) cur = [];
    }
  }
  return cur;
}

function buildOversSummary(timeline = []) {
  if (!timeline.length) return [];
  const overs = [];
  let cur = [],
    valid = 0;
  for (const ball of timeline) {
    cur.push(getBallLabel(ball));
    if (isValidBall(ball)) {
      valid++;
      if (valid % 6 === 0) {
        overs.push(cur);
        cur = [];
      }
    }
  }
  if (cur.length) overs.push(cur);
  return overs.map((balls, i) => ({ overNumber: i + 1, balls }));
}

function getOrdinal(v) {
  const n = Number(v) || 0;
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  const l = n % 10;
  if (l === 1) return `${n}st`;
  if (l === 2) return `${n}nd`;
  if (l === 3) return `${n}rd`;
  return `${n}th`;
}

function calcSR(r, b) {
  return b ? ((r / b) * 100).toFixed(0) : "—";
}
function calcOvers(b) {
  return `${Math.floor(b / 6)}.${b % 6}`;
}
function calcEcon(r, b) {
  return b === 0 ? "—" : (r / (b / 6)).toFixed(2);
}

function getDismissal(player, striker, nonStriker) {
  if (!player.isOut) {
    if (player.name === striker || player.name === nonStriker) return "batting";
    return "not out";
  }
  const dt = player.batting?.dismissalType || "";
  return dt ? dt.charAt(0).toUpperCase() + dt.slice(1) : "Out";
}

function buildBattingRows(match) {
  const striker = match.currentStriker || null;
  const nonStriker = match.currentNonStriker || null;
  const rows = (match.playerStats || []).filter(
    (p) => p.team === match.battingTeam && p.didBat,
  );
  const dismissalOrder = {};
  (match.timeline || []).forEach((ball, i) => {
    if (ball.isWicket && ball.batterDismissed)
      dismissalOrder[ball.batterDismissed] = i;
  });
  return [...rows].sort((a, b) => {
    if (a.name === striker) return -1;
    if (b.name === striker) return 1;
    if (a.name === nonStriker) return -1;
    if (b.name === nonStriker) return 1;
    return (dismissalOrder[b.name] ?? -1) - (dismissalOrder[a.name] ?? -1);
  });
}

function buildBowlingRows(match) {
  const bowlers = (match.playerStats || []).filter(
    (p) => p.team === match.bowlingTeam && p.didBowl,
  );
  return bowlers.map((p) => {
    const bb = (match.timeline || []).filter((ball) => ball.bowler === p.name);
    const balls = bb.filter(
      (b) => b.extraType !== "wide" && b.extraType !== "no-ball",
    ).length;
    const runs = bb.reduce((s, b) => {
      if (b.extraType === "bye" || b.extraType === "leg-bye") return s;
      return s + (b.runsOffBat || 0) + (b.extraRuns || 0);
    }, 0);
    const wickets = bb.filter(
      (b) => b.isWicket && b.wicketType !== "run-out",
    ).length;
    const wides = bb.filter((b) => b.extraType === "wide").length;
    const noBalls = bb.filter((b) => b.extraType === "no-ball").length;
    const overMap = {};
    bb.forEach((b) => {
      const key = b.overNumber;
      if (!overMap[key]) overMap[key] = { vb: 0, runs: 0 };
      if (b.extraType !== "wide" && b.extraType !== "no-ball") {
        overMap[key].vb++;
        if (b.extraType !== "bye" && b.extraType !== "leg-bye")
          overMap[key].runs += (b.runsOffBat || 0) + (b.extraRuns || 0);
      }
    });
    const maidens = Object.values(overMap).filter(
      (o) => o.vb === 6 && o.runs === 0,
    ).length;
    return {
      ...p,
      _balls: balls,
      _runs: runs,
      _wickets: wickets,
      _wides: wides,
      _noBalls: noBalls,
      _maidens: maidens,
    };
  });
}

/* ─── sub-components ──────────────────────────────────────────────────────── */

function PlayerAvatar({ name, photoUrl, size = "md", isStriker = false }) {
  const [imgError, setImgError] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const sizeMap = {
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-12 w-12 text-base",
  };
  const cls = sizeMap[size] || sizeMap.md;

  return (
    <span
      className={`relative inline-flex shrink-0 ${cls} rounded-full overflow-hidden ring-2 ${isStriker ? "ring-[#f97316]" : "ring-white/10"}`}
    >
      {photoUrl && !imgError ? (
        <img
          src={photoUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-600 to-slate-800 font-bold text-slate-200">
          {initial}
        </span>
      )}
      {isStriker && (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#f97316] ring-1 ring-slate-900" />
      )}
    </span>
  );
}

function BallChip({ label }) {
  const base =
    "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0";
  if (label === "W")
    return <span className={`${base} bg-red-600 text-white`}>{label}</span>;
  if (label === "4")
    return <span className={`${base} bg-blue-600 text-white`}>{label}</span>;
  if (label === "6")
    return <span className={`${base} bg-emerald-500 text-white`}>{label}</span>;
  if (label === "Wd")
    return (
      <span
        className={`${base} bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50`}
      >
        {label}
      </span>
    );
  if (label === "•")
    return <span className={`${base} bg-slate-700/60 text-slate-400`}>·</span>;
  return <span className={`${base} bg-slate-700 text-slate-200`}>{label}</span>;
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      <span className="text-xs font-bold uppercase tracking-widest text-red-400">
        Live
      </span>
    </span>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-slate-800">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors ${
            active === t.key
              ? "border-b-2 border-[#f97316] text-[#f97316]"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────────────────── */

function ScoreboardPage() {
  const { matchId } = useParams();
  const [searchParams] = useSearchParams();
  const socketRef = useRef(null);

  const [match, setMatch] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("batting");
  const [matchEndStatus, setMatchEndStatus] = useState({
    isMatchOver: false,
    resultMessage: "",
  });
  const [tossLiveState, setTossLiveState] = useState({
    isFlipping: false,
    result: "",
    winner: "",
  });
  const isViewerMode = searchParams.get("viewer") === "1";

  useEffect(() => {
    if (!matchId) return;
    const socket = createMatchSocket();
    socketRef.current = socket;

    const apply = (updatedMatch) => {
      setMatch(updatedMatch);
      const shouldEval =
        (updatedMatch.inningsNumber === 2 ||
          typeof updatedMatch.firstInningsScore === "number") &&
        typeof updatedMatch.firstInningsScore === "number";
      if (shouldEval) {
        const cnt = (updatedMatch.playerStats || []).filter(
          (p) => p.team === updatedMatch.battingTeam,
        ).length;
        setMatchEndStatus(
          checkMatchEnd({
            teamAScore: updatedMatch.firstInningsScore,
            teamBScore: updatedMatch.totalRuns,
            teamBWickets: updatedMatch.wickets,
            teamBPlayersCount: cnt,
            totalValidBalls: updatedMatch.ballsBowled,
            totalOvers: updatedMatch.totalOvers,
          }),
        );
      } else {
        setMatchEndStatus({ isMatchOver: false, resultMessage: "" });
      }
    };

    socket.on("connect", () => socket.emit("joinMatch", { matchId }));
    socket.on("matchState", apply);
    socket.on("score_updated", apply);
    socket.on("match_completed", (payload) => {
      if (payload) apply(payload);
      if (payload?.resultMessage)
        setMatchEndStatus({
          isMatchOver: true,
          resultMessage: payload.resultMessage,
        });
    });
    socket.on("toss_flip_started", () =>
      setTossLiveState({ isFlipping: true, result: "", winner: "" }),
    );
    socket.on("toss_flip_result", ({ result, winner }) =>
      setTossLiveState({
        isFlipping: false,
        result: result || "",
        winner: winner || "",
      }),
    );
    socket.on("connect_error", (err) => setError(err.message));

    let pollInterval;
    if (isViewerMode) {
      pollInterval = setInterval(async () => {
        try {
          const res = await getMatch(matchId);
          if (res?.match) apply(res.match);
        } catch {
          /* silent */
        }
      }, 3000);
    }

    return () => {
      socket.off("connect");
      socket.off("matchState");
      socket.off("score_updated");
      socket.off("match_completed");
      socket.off("toss_flip_started");
      socket.off("toss_flip_result");
      socket.off("connect_error");
      socket.disconnect();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isViewerMode, matchId]);

  if (error)
    return (
      <main className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <p className="rounded-lg border border-red-500/40 bg-red-900/30 p-6 text-red-300">
          {error}
        </p>
      </main>
    );

  if (!match)
    return (
      <main className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
          <p className="text-slate-400 text-sm">Loading scoreboard...</p>
        </div>
      </main>
    );

  /* ── computed values ── */
  const currentOver = buildCurrentOver(match.timeline || []);
  const oversSummary = buildOversSummary(match.timeline || []);
  const battingRows = buildBattingRows(match);
  const bowlingRows = buildBowlingRows(match);
  const ballsBowled = match.ballsBowled || 0;
  const oversBowled = Math.floor(ballsBowled / 6);
  const ballsInOver = ballsBowled % 6;
  const runRate =
    ballsBowled > 0 ? ((match.totalRuns / ballsBowled) * 6).toFixed(2) : "0.00";
  const targetScore =
    match.targetScore ||
    (typeof match.firstInningsScore === "number"
      ? match.firstInningsScore + 1
      : null);
  const runsNeeded = targetScore
    ? Math.max(0, targetScore - match.totalRuns)
    : null;
  const ballsLeft = targetScore
    ? Math.max(0, (match.totalOvers || 0) * 6 - ballsBowled)
    : null;
  const rrr = targetScore
    ? ballsLeft > 0
      ? ((runsNeeded * 6) / ballsLeft).toFixed(2)
      : runsNeeded > 0
        ? "—"
        : "0.00"
    : null;
  const remainingDots =
    ballsBowled > 0 && ballsInOver === 0 ? 0 : 6 - ballsInOver;
  const { extras, extrasByType } = (match.timeline || []).reduce(
    (acc, ball) => {
      acc.extras += ball.extraRuns || 0;
      if (ball.extraType && ball.extraType !== "none" && ball.extraRuns > 0)
        acc.extrasByType[ball.extraType] =
          (acc.extrasByType[ball.extraType] || 0) + ball.extraRuns;
      return acc;
    },
    { extras: 0, extrasByType: {} },
  );

  const yetToBat = (match.playerStats || []).filter(
    (p) => p.team === match.battingTeam && !p.didBat,
  );
  const currentBowlerRow = bowlingRows.find(
    (p) => p.name === match.currentBowler,
  );
  const bowlingRowsDisplay = currentBowlerRow
    ? [
        currentBowlerRow,
        ...bowlingRows.filter((p) => p.name !== currentBowlerRow.name),
      ]
    : bowlingRows;

  const getPlayerPhoto = (name) => {
    if (!name) return null;

    const normalizeName = (value) =>
      typeof value === "string" ? value.trim().toLowerCase() : "";
    const targetName = normalizeName(name);

    const fromStats = (match.playerStats || []).find(
      (x) => normalizeName(x.name) === targetName,
    );
    const fromTeams = [
      ...(match.team1Players || []),
      ...(match.team2Players || []),
    ].find((player) => normalizeName(player?.name) === targetName);

    return (
      fromStats?.photoUrl ||
      fromStats?.photoURL ||
      fromStats?.avatarUrl ||
      fromStats?.imageUrl ||
      fromTeams?.photoUrl ||
      fromTeams?.photoURL ||
      fromTeams?.avatarUrl ||
      fromTeams?.imageUrl ||
      null
    );
  };

  const firstInningsSummary = match.firstInningsSummary || null;
  const isLive = match.status === "live";
  const isToss = match.status === "toss";
  const isCompleted = match.status === "completed";
  const isInningsBreak = match.status === "innings";

  const tabs = [
    { key: "batting", label: "Batting" },
    { key: "bowling", label: "Bowling" },
    { key: "overview", label: "Overview" },
    ...(firstInningsSummary
      ? [{ key: "first-innings", label: "1st Inn" }]
      : []),
    { key: "overs", label: "Overs" },
  ];

  /* ── pre-toss viewer ── */
  const isPreTossViewer =
    isViewerMode && (match.status === "upcoming" || isToss);
  if (isPreTossViewer) {
    const t1 = (match.team1Players || [])
      .filter((p) => typeof p !== "string" && p?.name)
      .map((p) => ({
        name: p.name,
        photoUrl: p.photoUrl || p.photoURL || p.avatarUrl || p.imageUrl || null,
      }));
    const t2 = (match.team2Players || [])
      .filter((p) => typeof p !== "string" && p?.name)
      .map((p) => ({
        name: p.name,
        photoUrl: p.photoUrl || p.photoURL || p.avatarUrl || p.imageUrl || null,
      }));
    return (
      <main
        className="min-h-screen bg-[#0d1117] px-4 py-6 text-slate-100"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800&display=swap');`}</style>
        <div className="mx-auto max-w-3xl">
          <TopBar matchId={matchId} isViewerMode={isViewerMode} />
          <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-900/10 p-4 text-center">
            {isToss ? (
              tossLiveState.isFlipping ? (
                <p className="text-indigo-300 font-medium">
                  🪙 Coin in the air...
                </p>
              ) : tossLiveState.result && tossLiveState.winner ? (
                <p className="text-indigo-300 font-medium">
                  {tossLiveState.winner} won the toss ({tossLiveState.result}) —
                  awaiting decision
                </p>
              ) : (
                <p className="text-indigo-300 font-medium">
                  Toss in progress...
                </p>
              )
            ) : (
              <p className="text-slate-400">
                Awaiting toss. Match starts soon.
              </p>
            )}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              { name: match.team1Name, players: t1 },
              { name: match.team2Name, players: t2 },
            ].map((team) => (
              <div
                key={team.name}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#f97316]">
                  {team.name}
                </p>
                <ul className="space-y-2">
                  {team.players.map((p, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-sm text-slate-300"
                    >
                      <PlayerAvatar
                        name={p.name}
                        photoUrl={getPlayerPhoto(p.name)}
                        size="sm"
                      />
                      {p.name}
                    </li>
                  ))}
                  {!team.players.length && (
                    <li className="text-xs text-slate-600">
                      No players listed
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-[#0d1117] text-slate-100 pb-12"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800&display=swap');
        .score-num { font-family: 'Barlow Condensed', sans-serif; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-slate-900 to-[#0d1117] border-b border-slate-800">
        {/* subtle noise texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        <div className="relative mx-auto max-w-3xl px-4 pt-4 pb-5">
          <TopBar matchId={matchId} isViewerMode={isViewerMode} />

          {/* Status badges */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isLive && <LiveDot />}
            {isCompleted && (
              <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-slate-300">
                Full Time
              </span>
            )}
            {isInningsBreak && (
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-amber-400">
                Innings Break
              </span>
            )}
            {isToss && (
              <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-indigo-400">
                Toss
              </span>
            )}
            <span className="text-xs text-slate-500">
              {match.totalOvers} overs
            </span>
          </div>

          {/* Match result banner */}
          {(matchEndStatus.isMatchOver || isCompleted) &&
            matchEndStatus.resultMessage && (
              <div className="mt-3 rounded-lg bg-gradient-to-r from-[#f97316]/20 to-amber-500/10 border border-[#f97316]/30 px-4 py-2 text-sm font-bold text-[#f97316]">
                🏆 {matchEndStatus.resultMessage}
              </div>
            )}

          {/* Score hero */}
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#f97316] mb-1">
                {match.battingTeam}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="score-num text-6xl font-extrabold leading-none text-white">
                  {match.totalRuns}/{match.wickets}
                </span>
                <span className="score-num text-2xl font-semibold text-slate-400">
                  ({oversBowled}.{ballsInOver})
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span>
                  RR{" "}
                  <span className="font-semibold text-slate-200">
                    {runRate}
                  </span>
                </span>
                {targetScore && (
                  <>
                    <span className="text-slate-700">|</span>
                    <span>
                      Need{" "}
                      <span className="font-semibold text-indigo-300">
                        {runsNeeded}
                      </span>{" "}
                      off{" "}
                      <span className="font-semibold text-indigo-300">
                        {ballsLeft}
                      </span>{" "}
                      balls
                    </span>
                    <span className="text-slate-700">|</span>
                    <span>
                      RRR{" "}
                      <span className="font-semibold text-indigo-300">
                        {rrr}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* vs + bowling team score */}
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-600 uppercase tracking-widest mb-1">
                {match.bowlingTeam}
              </p>
              {firstInningsSummary && (
                <p className="score-num text-2xl font-bold text-slate-500">
                  {firstInningsSummary.totalRuns}/{firstInningsSummary.wickets}
                  <span className="text-base ml-1">
                    ({firstInningsSummary.oversBowled})
                  </span>
                </p>
              )}
              {targetScore && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Target:{" "}
                  <span className="font-bold text-slate-300">
                    {targetScore}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Live batters strip */}
          {(match.currentStriker || match.currentNonStriker) && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-800/60 border border-slate-700/50 px-3 py-2.5">
              {match.currentStriker && (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <PlayerAvatar
                    name={match.currentStriker}
                    photoUrl={getPlayerPhoto(match.currentStriker)}
                    size="md"
                    isStriker
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {match.currentStriker}{" "}
                      <span className="text-[#f97316]">*</span>
                    </p>
                    {(() => {
                      const p = (match.playerStats || []).find(
                        (x) => x.name === match.currentStriker,
                      );
                      const r = p?.batting?.runs ?? 0,
                        b = p?.batting?.balls ?? 0;
                      return (
                        <p className="text-xs text-slate-400">
                          {r}({b}) · SR {calcSR(r, b)}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}
              <div className="h-8 w-px bg-slate-700" />
              {match.currentNonStriker && (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <PlayerAvatar
                    name={match.currentNonStriker}
                    photoUrl={getPlayerPhoto(match.currentNonStriker)}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-300 truncate">
                      {match.currentNonStriker}
                    </p>
                    {(() => {
                      const p = (match.playerStats || []).find(
                        (x) => x.name === match.currentNonStriker,
                      );
                      const r = p?.batting?.runs ?? 0,
                        b = p?.batting?.balls ?? 0;
                      return (
                        <p className="text-xs text-slate-500">
                          {r}({b})
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}
              {match.currentBowler && (
                <>
                  <div className="h-8 w-px bg-slate-700" />
                  <div className="flex items-center gap-2 shrink-0">
                    <PlayerAvatar
                      name={match.currentBowler}
                      photoUrl={getPlayerPhoto(match.currentBowler)}
                      size="md"
                    />
                    <div>
                      <p className="text-xs text-slate-500 font-medium">
                        BOWLING
                      </p>
                      <p className="text-sm font-semibold text-slate-300 truncate max-w-[80px]">
                        {match.currentBowler}
                      </p>
                      {currentBowlerRow && (
                        <p className="text-xs text-slate-500">
                          {calcOvers(currentBowlerRow._balls)}-
                          {currentBowlerRow._wickets}/{currentBowlerRow._runs}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Current over inline */}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide shrink-0">
              Over {oversBowled + 1}
            </span>
            <div className="flex items-center gap-1.5">
              {currentOver.map((label, i) => (
                <BallChip key={i} label={label} />
              ))}
              {Array.from({ length: remainingDots }).map((_, i) => (
                <span
                  key={i}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-800 text-slate-700 text-xs"
                >
                  ·
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs + Content ── */}
      <div className="mx-auto max-w-3xl">
        <div className="sticky top-0 z-10 bg-[#0d1117] px-4">
          <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>

        <div className="px-4 pt-4">
          {/* ── BATTING TAB ── */}
          {activeTab === "batting" && (
            <div>
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                        Batter
                      </th>
                      <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-8">
                        R
                      </th>
                      <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-8">
                        B
                      </th>
                      <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-8">
                        4s
                      </th>
                      <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-8">
                        6s
                      </th>
                      <th className="pb-2 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-12">
                        SR
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {battingRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-6 text-center text-slate-600"
                        >
                          No batters yet
                        </td>
                      </tr>
                    ) : (
                      battingRows.map((player) => {
                        const isStriker = player.name === match.currentStriker;
                        const r = player.batting?.runs ?? 0;
                        const b = player.batting?.balls ?? 0;
                        const dismissal = getDismissal(
                          player,
                          match.currentStriker,
                          match.currentNonStriker,
                        );
                        return (
                          <tr
                            key={player._id || player.name}
                            className={isStriker ? "bg-[#f97316]/5" : ""}
                          >
                            <td className="py-3 pr-3">
                              <div className="flex items-center gap-2.5">
                                <PlayerAvatar
                                  name={player.name}
                                  photoUrl={getPlayerPhoto(player.name)}
                                  size="sm"
                                  isStriker={isStriker}
                                />
                                <div>
                                  <p
                                    className={`font-semibold ${isStriker ? "text-white" : "text-slate-300"}`}
                                  >
                                    {player.name}
                                    {isStriker && (
                                      <span className="ml-1 text-[#f97316]">
                                        *
                                      </span>
                                    )}
                                  </p>
                                  <p
                                    className={`text-xs ${dismissal === "batting" ? "text-emerald-400" : dismissal === "not out" ? "text-slate-500" : "text-slate-600"}`}
                                  >
                                    {dismissal === "batting"
                                      ? "batting"
                                      : dismissal}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td
                              className={`py-3 pr-3 text-right font-bold tabular-nums ${isStriker ? "text-white" : "text-slate-300"}`}
                            >
                              {r}
                            </td>
                            <td className="py-3 pr-3 text-right text-slate-500 tabular-nums">
                              {b}
                            </td>
                            <td className="py-3 pr-3 text-right text-slate-400 tabular-nums">
                              {player.batting?.fours ?? 0}
                            </td>
                            <td className="py-3 pr-3 text-right text-slate-400 tabular-nums">
                              {player.batting?.sixes ?? 0}
                            </td>
                            <td className="py-3 text-right text-slate-400 tabular-nums">
                              {calcSR(r, b)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Extras + Total */}
              <div className="mt-3 rounded-lg bg-slate-900/60 border border-slate-800 px-4 py-2.5 text-xs text-slate-500 space-y-1">
                <p>
                  Extras: {extras} (W {extrasByType.wide || 0}, NB{" "}
                  {extrasByType["no-ball"] || 0}, B {extrasByType.bye || 0}, LB{" "}
                  {extrasByType["leg-bye"] || 0})
                </p>
                <p className="font-semibold text-slate-300">
                  Total: {match.totalRuns}/{match.wickets} ({oversBowled}.
                  {ballsInOver} Ov) · RR {runRate}
                </p>
              </div>

              {/* Yet to bat */}
              {yetToBat.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
                    Yet to bat
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {yetToBat.map((p) => (
                      <div
                        key={p.name}
                        className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-1"
                      >
                        <PlayerAvatar
                          name={p.name}
                          photoUrl={getPlayerPhoto(p.name)}
                          size="sm"
                        />
                        <span className="text-xs text-slate-400">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BOWLING TAB ── */}
          {activeTab === "bowling" && (
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600">
                      Bowler
                    </th>
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-10">
                      O
                    </th>
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-8">
                      M
                    </th>
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-8">
                      R
                    </th>
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-8">
                      W
                    </th>
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-14">
                      Eco
                    </th>
                    <th className="pb-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-8">
                      Wd
                    </th>
                    <th className="pb-2 text-xs font-bold uppercase tracking-wide text-slate-600 text-right w-8">
                      NB
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {bowlingRowsDisplay.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-6 text-center text-slate-600"
                      >
                        No bowlers yet
                      </td>
                    </tr>
                  ) : (
                    bowlingRowsDisplay.map((player) => {
                      const isCurrent = player.name === match.currentBowler;
                      return (
                        <tr
                          key={player._id || player.name}
                          className={isCurrent ? "bg-[#f97316]/5" : ""}
                        >
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar
                                name={player.name}
                                photoUrl={getPlayerPhoto(player.name)}
                                size="sm"
                                isStriker={isCurrent}
                              />
                              <p
                                className={`font-semibold ${isCurrent ? "text-white" : "text-slate-300"}`}
                              >
                                {player.name}
                                {isCurrent && (
                                  <span className="ml-1 text-[#f97316]">*</span>
                                )}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right text-slate-400 tabular-nums">
                            {calcOvers(player._balls)}
                          </td>
                          <td className="py-3 pr-3 text-right text-slate-400 tabular-nums">
                            {player._maidens}
                          </td>
                          <td className="py-3 pr-3 text-right font-bold text-slate-300 tabular-nums">
                            {player._runs}
                          </td>
                          <td
                            className={`py-3 pr-3 text-right font-bold tabular-nums ${player._wickets > 0 ? "text-red-400" : "text-slate-300"}`}
                          >
                            {player._wickets}
                          </td>
                          <td className="py-3 pr-3 text-right text-slate-400 tabular-nums">
                            {calcEcon(player._runs, player._balls)}
                          </td>
                          <td className="py-3 pr-3 text-right text-slate-500 tabular-nums">
                            {player._wides}
                          </td>
                          <td className="py-3 text-right text-slate-500 tabular-nums">
                            {player._noBalls}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Partnership / current pair */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-3">
                  At The Crease
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    {
                      name: match.currentStriker,
                      label: "Striker",
                      isStriker: true,
                    },
                    {
                      name: match.currentNonStriker,
                      label: "Non-Striker",
                      isStriker: false,
                    },
                  ].map(({ name, label, isStriker }) => {
                    const p = (match.playerStats || []).find(
                      (x) => x.name === name,
                    );
                    const r = p?.batting?.runs ?? 0,
                      b = p?.batting?.balls ?? 0;
                    return (
                      <div
                        key={label}
                        className="flex flex-col items-center gap-2 text-center"
                      >
                        <PlayerAvatar
                          name={name || "—"}
                          photoUrl={getPlayerPhoto(name)}
                          size="lg"
                          isStriker={isStriker}
                        />
                        <div>
                          <p
                            className={`font-bold text-sm ${isStriker ? "text-white" : "text-slate-300"}`}
                          >
                            {name || "—"}
                            {isStriker && (
                              <span className="text-[#f97316]"> *</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">{label}</p>
                          {name && (
                            <p className="text-sm font-bold text-slate-200 mt-0.5">
                              {r}{" "}
                              <span className="text-xs font-normal text-slate-500">
                                ({b})
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bowler */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-3">
                  Current Bowler
                </p>
                <div className="flex items-center gap-3">
                  <PlayerAvatar
                    name={match.currentBowler || "—"}
                    photoUrl={getPlayerPhoto(match.currentBowler)}
                    size="lg"
                  />
                  <div>
                    <p className="font-bold text-white text-base">
                      {match.currentBowler || "Not set"}
                    </p>
                    {currentBowlerRow && (
                      <p className="text-sm text-slate-400">
                        {calcOvers(currentBowlerRow._balls)} ov ·{" "}
                        {currentBowlerRow._wickets}/{currentBowlerRow._runs} ·
                        Eco{" "}
                        {calcEcon(
                          currentBowlerRow._runs,
                          currentBowlerRow._balls,
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Current over detail */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-3">
                  This Over
                </p>
                <div className="flex flex-wrap gap-2">
                  {currentOver.map((label, i) => (
                    <BallChip key={i} label={label} />
                  ))}
                  {Array.from({ length: remainingDots }).map((_, i) => (
                    <span
                      key={i}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-800 text-slate-700 text-xs"
                    >
                      ·
                    </span>
                  ))}
                  {currentOver.length === 0 && (
                    <p className="text-sm text-slate-600">Over not started</p>
                  )}
                </div>
              </div>

              {/* Key stats grid */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Run Rate", value: runRate },
                  { label: "Target", value: targetScore ?? "—" },
                  { label: "Req Rate", value: rrr ?? "—" },
                  { label: "Extras", value: extras },
                  { label: "Wickets", value: match.wickets },
                  {
                    label: "Overs",
                    value: `${oversBowled}.${ballsInOver}/${match.totalOvers}`,
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center"
                  >
                    <p className="text-xs text-slate-600 uppercase tracking-wide">
                      {label}
                    </p>
                    <p className="score-num mt-1 text-xl font-bold text-slate-200">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── FIRST INNINGS TAB ── */}
          {activeTab === "first-innings" && firstInningsSummary && (
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-xs font-bold uppercase tracking-widest text-[#f97316]">
                  {firstInningsSummary.battingTeam} — 1st Innings
                </p>
                <p className="score-num text-3xl font-extrabold text-white mt-1">
                  {firstInningsSummary.totalRuns}/{firstInningsSummary.wickets}
                  <span className="text-lg font-semibold text-slate-500 ml-2">
                    ({firstInningsSummary.oversBowled} Ov)
                  </span>
                </p>
              </div>

              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left">
                      {["Batter", "R", "B", "4s", "6s", "SR"].map((h) => (
                        <th
                          key={h}
                          className={`pb-2 text-xs font-bold uppercase tracking-wide text-slate-600 ${h !== "Batter" ? "text-right pr-3 w-10" : "pr-3"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(firstInningsSummary.battingRows || []).map((player) => (
                      <tr key={player.name}>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <PlayerAvatar
                              name={player.name}
                              photoUrl={getPlayerPhoto(player.name)}
                              size="sm"
                            />
                            <div>
                              <p className="font-semibold text-slate-300">
                                {player.name}
                              </p>
                              <p className="text-xs text-slate-600 capitalize">
                                {player.dismissal}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right font-bold text-slate-300 tabular-nums">
                          {player.runs}
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-500 tabular-nums">
                          {player.balls}
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-400 tabular-nums">
                          {player.fours}
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-400 tabular-nums">
                          {player.sixes}
                        </td>
                        <td className="py-3 text-right text-slate-400 tabular-nums">
                          {player.strikeRate != null
                            ? Number(player.strikeRate).toFixed(1)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full min-w-[500px] text-sm">
                  <thead>
                    <tr className="text-left">
                      {["Bowler", "O", "M", "R", "W", "Eco", "Wd", "NB"].map(
                        (h) => (
                          <th
                            key={h}
                            className={`pb-2 text-xs font-bold uppercase tracking-wide text-slate-600 ${h !== "Bowler" ? "text-right pr-3 w-10" : "pr-3"}`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(firstInningsSummary.bowlingRows || []).map((player) => (
                      <tr key={player.name}>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <PlayerAvatar
                              name={player.name}
                              photoUrl={getPlayerPhoto(player.name)}
                              size="sm"
                            />
                            <p className="font-semibold text-slate-300">
                              {player.name}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-400 tabular-nums">
                          {calcOvers(player.balls || 0)}
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-400 tabular-nums">
                          {player.maidens || 0}
                        </td>
                        <td className="py-3 pr-3 text-right font-bold text-slate-300 tabular-nums">
                          {player.runs || 0}
                        </td>
                        <td
                          className={`py-3 pr-3 text-right font-bold tabular-nums ${(player.wickets || 0) > 0 ? "text-red-400" : "text-slate-300"}`}
                        >
                          {player.wickets || 0}
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-400 tabular-nums">
                          {player.economy != null
                            ? Number(player.economy).toFixed(2)
                            : "—"}
                        </td>
                        <td className="py-3 pr-3 text-right text-slate-500 tabular-nums">
                          {player.wides || 0}
                        </td>
                        <td className="py-3 text-right text-slate-500 tabular-nums">
                          {player.noBalls || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── OVERS TAB ── */}
          {activeTab === "overs" && (
            <div className="space-y-2">
              {oversSummary.length === 0 && (
                <p className="text-slate-600 text-sm">No overs yet.</p>
              )}
              {[...oversSummary].reverse().map((over) => {
                const overRuns = over.balls
                  .filter((l) => !isNaN(Number(l)) && l !== "•")
                  .reduce((s, l) => s + (Number(l) || 0), 0);
                const hasWicket = over.balls.includes("W");
                return (
                  <div
                    key={over.overNumber}
                    className={`rounded-xl border px-4 py-3 ${hasWicket ? "border-red-900/50 bg-red-950/20" : "border-slate-800 bg-slate-900/40"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-500 uppercase">
                        {getOrdinal(over.overNumber)} Over
                      </span>
                      <span className="text-xs font-bold text-slate-400">
                        {overRuns} runs{hasWicket ? " · 🎯 wicket" : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {over.balls.map((label, i) => (
                        <BallChip key={i} label={label} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/* ── TopBar ── */
function TopBar({ matchId, isViewerMode }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back
      </button>
      <Link
        to="/"
        className="text-xs font-bold uppercase tracking-widest text-[#f97316]"
      >
        CricTrack
      </Link>
      <div className="flex items-center gap-3">
        {!isViewerMode && (
          <Link
            to={`/scorer/${matchId}`}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Scorer
          </Link>
        )}
        {isViewerMode && (
          <Link
            to="/view"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            All Matches
          </Link>
        )}
      </div>
    </div>
  );
}

export default ScoreboardPage;
