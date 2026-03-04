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

function getMostCommonValue(values = []) {
  if (!values.length) return "";
  const counts = values.reduce((acc, value) => {
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function buildOversSummary(timeline = []) {
  if (!timeline.length) return [];
  const overs = [];
  let cur = [],
    curBowlers = [],
    valid = 0;
  for (const ball of timeline) {
    cur.push(getBallLabel(ball));
    if (ball?.bowler) curBowlers.push(ball.bowler);
    if (isValidBall(ball)) {
      valid++;
      if (valid % 6 === 0) {
        overs.push({ balls: cur, bowlers: curBowlers });
        cur = [];
        curBowlers = [];
      }
    }
  }
  if (cur.length) overs.push({ balls: cur, bowlers: curBowlers });
  return overs.map((over, i) => ({
    overNumber: i + 1,
    balls: over.balls,
    bowlerName: getMostCommonValue(over.bowlers),
  }));
}

function buildFallOfWickets(timeline = []) {
  if (!timeline.length) return [];

  const wickets = [];
  let totalRuns = 0;
  let totalWickets = 0;
  let validBalls = 0;

  for (const ball of timeline) {
    totalRuns += Number(ball.runsOffBat || 0) + Number(ball.extraRuns || 0);
    if (isValidBall(ball)) validBalls++;

    if (ball.isWicket) {
      totalWickets++;
      const hasBallPosition =
        Number.isFinite(Number(ball.overNumber)) &&
        Number.isFinite(Number(ball.ballInOver));
      const overLabel = hasBallPosition
        ? `${ball.overNumber}.${ball.ballInOver}`
        : `${Math.floor(validBalls / 6)}.${validBalls % 6}`;

      wickets.push({
        wicketNumber: totalWickets,
        playerName: ball.batterDismissed || "Unknown",
        scoreAtFall: `${totalRuns}/${totalWickets}`,
        overLabel,
      });
    }
  }

  return wickets;
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

function MatchSummaryView({ match }) {
  const navigate = useNavigate();
  const [summaryTab, setSummaryTab] = useState("first-innings");

  const firstInnings = match?.firstInningsSummary;
  const summaryTabs = [
    { key: "first-innings", label: "1st Innings" },
    { key: "second-innings", label: "2nd Innings" },
    { key: "top-performers", label: "Top Performers" },
  ];

  const getBatRuns = (row) => Number(row?.batting?.runs ?? row?.runs ?? 0);
  const getBatBalls = (row) => Number(row?.batting?.balls ?? row?.balls ?? 0);
  const getBatFours = (row) =>
    Number(row?.batting?.fours ?? row?.fours ?? row?.batting?.boundaries4 ?? 0);
  const getBatSixes = (row) =>
    Number(row?.batting?.sixes ?? row?.sixes ?? row?.batting?.boundaries6 ?? 0);

  const getBowlBalls = (row) =>
    Number(
      row?._balls ?? row?.bowling?.balls ?? row?.balls ?? row?.ballsBowled ?? 0,
    );
  const getBowlMaidens = (row) =>
    Number(row?._maidens ?? row?.bowling?.maidens ?? row?.maidens ?? 0);
  const getBowlRuns = (row) =>
    Number(
      row?._runs ??
        row?.bowling?.runsConceded ??
        row?.runs ??
        row?.conceded ??
        0,
    );
  const getBowlWickets = (row) =>
    Number(
      row?._wickets ?? row?.bowling?.wickets ?? row?.wickets ?? row?.wkts ?? 0,
    );

  const isFirstInningsBall = (ball) => {
    const inningsMarker = Number(ball?.inningsNumber ?? ball?.innings ?? NaN);
    if (Number.isFinite(inningsMarker)) return inningsMarker === 1;
    if (ball?.battingTeam && firstInnings?.battingTeam)
      return ball.battingTeam === firstInnings.battingTeam;
    return false;
  };

  const isSecondInningsBall = (ball) => {
    const inningsMarker = Number(ball?.inningsNumber ?? ball?.innings ?? NaN);
    if (Number.isFinite(inningsMarker)) return inningsMarker === 2;
    if (ball?.battingTeam && match?.battingTeam)
      return ball.battingTeam === match.battingTeam;
    return false;
  };

  const firstInningsTimeline = (match?.timeline || []).filter(
    isFirstInningsBall,
  );
  const secondInningsTimeline = (match?.timeline || []).filter(
    isSecondInningsBall,
  );

  const calcExtras = (timeline = []) =>
    timeline.reduce((sum, ball) => sum + Number(ball?.extraRuns || 0), 0);

  const timeline = match?.timeline || [];
  const firstInningsDismissedBatters = (firstInnings?.battingRows || []).filter(
    (player) => {
      const dismissal = String(
        player?.batting?.dismissalType ?? player?.dismissal ?? "",
      )
        .trim()
        .toLowerCase();
      return dismissal && dismissal !== "not out" && dismissal !== "batting";
    },
  );

  const firstInningsDismissalText = (player) => {
    const dismissal = String(
      player?.batting?.dismissalType ?? player?.dismissal ?? "dismissed",
    ).trim();
    return dismissal || "dismissed";
  };

  const firstInningsWicketEvents = (() => {
    if (!timeline.length) return [];
    let runningScore = 0;
    let wicketCount = 0;
    const events = [];

    for (const ball of timeline) {
      runningScore +=
        Number(ball?.runsOffBat || 0) + Number(ball?.extraRuns || 0);
      if (ball?.isWicket) {
        wicketCount += 1;
        events.push({
          score: runningScore,
          wicketNum: wicketCount,
          playerName: ball?.batterDismissed || "Unknown",
          over: ball?.overNumber,
          ball: ball?.ballInOver,
        });
      }
    }

    if (!firstInningsDismissedBatters.length) return events;

    return firstInningsDismissedBatters
      .map((batter) => {
        const batterName = String(batter?.name || "")
          .trim()
          .toLowerCase();
        const matched = events.find(
          (event) =>
            String(event?.playerName || "")
              .trim()
              .toLowerCase() === batterName,
        );
        if (!matched) return null;
        return {
          ...matched,
          playerName: batter?.name || matched.playerName,
        };
      })
      .filter(Boolean);
  })();

  const secondInningsWicketEvents = (() => {
    let runningScore = 0;
    let wicketCount = 0;
    const events = [];

    for (const ball of secondInningsTimeline) {
      runningScore +=
        Number(ball?.runsOffBat || 0) + Number(ball?.extraRuns || 0);
      if (ball?.isWicket) {
        wicketCount += 1;
        events.push({
          score: runningScore,
          wicketNum: wicketCount,
          playerName: ball?.batterDismissed || "Unknown",
          over: ball?.overNumber,
          ball: ball?.ballInOver,
        });
      }
    }

    return events;
  })();

  const firstInningsScorecardBatting = [...(firstInnings?.battingRows || [])];
  const firstInningsTopScorer = [...firstInningsScorecardBatting].sort(
    (a, b) => getBatRuns(b) - getBatRuns(a),
  )[0];
  const firstInningsScorecardBowling = [...(firstInnings?.bowlingRows || [])];
  const firstInningsBestBowler = [...firstInningsScorecardBowling].sort(
    (a, b) => getBowlWickets(b) - getBowlWickets(a),
  )[0];

  const secondInningsScorecardBatting = buildBattingRows(match || {});
  const secondInningsTopScorer = [...secondInningsScorecardBatting].sort(
    (a, b) => getBatRuns(b) - getBatRuns(a),
  )[0];
  const secondInningsScorecardBowling = buildBowlingRows(match || {});
  const secondInningsBestBowler = [...secondInningsScorecardBowling].sort(
    (a, b) => getBowlWickets(b) - getBowlWickets(a),
  )[0];

  const firstInningsBatters = [...(firstInnings?.battingRows || [])]
    .sort(
      (a, b) =>
        Number(b?.batting?.runs ?? b?.runs ?? 0) -
        Number(a?.batting?.runs ?? a?.runs ?? 0),
    )
    .slice(0, 2);
  const firstInningsTopBowler = [...(firstInnings?.bowlingRows || [])].sort(
    (a, b) =>
      Number(b?._wickets ?? b?.bowling?.wickets ?? b?.wickets ?? 0) -
      Number(a?._wickets ?? a?.bowling?.wickets ?? a?.wickets ?? 0),
  )[0];

  const secondInningsBatters = [...(match?.playerStats || [])]
    .filter((p) => p?.team === match?.battingTeam && p?.didBat)
    .sort(
      (a, b) => Number(b?.batting?.runs ?? 0) - Number(a?.batting?.runs ?? 0),
    )
    .slice(0, 2);
  const secondInningsTopBowler = [...(match?.playerStats || [])]
    .filter((p) => p?.team === match?.bowlingTeam && p?.didBowl)
    .sort(
      (a, b) =>
        Number(b?.bowling?.wickets ?? 0) - Number(a?.bowling?.wickets ?? 0),
    )[0];

  const firstInningsRuns = Number(firstInnings?.totalRuns ?? 0);
  const firstInningsWickets = Number(firstInnings?.wickets ?? 0);
  const firstInningsExtras = Number(
    firstInnings?.extras ?? calcExtras(firstInningsTimeline),
  );
  const firstInningsOvers =
    firstInnings?.oversBowled ??
    `${Math.floor(Number(firstInnings?.ballsBowled ?? 0) / 6)}.${Number(firstInnings?.ballsBowled ?? 0) % 6}`;

  const secondInningsRuns = Number(match?.totalRuns ?? 0);
  const secondInningsWickets = Number(match?.wickets ?? 0);
  const secondInningsExtras = calcExtras(secondInningsTimeline);
  const secondInningsBalls = Number(match?.ballsBowled ?? 0);
  const secondInningsOvers = `${Math.floor(secondInningsBalls / 6)}.${secondInningsBalls % 6}`;

  const winningTeam = firstInnings
    ? secondInningsRuns > firstInningsRuns
      ? match?.battingTeam
      : secondInningsRuns < firstInningsRuns
        ? match?.bowlingTeam
        : null
    : null;

  const derivedResultMessage = (() => {
    const explicit =
      typeof match?.resultMessage === "string"
        ? match.resultMessage.trim()
        : "";
    if (explicit) return explicit;

    if (firstInnings) {
      const firstRuns = Number(firstInnings?.totalRuns ?? 0);
      const secondRuns = Number(match?.totalRuns ?? 0);
      const secondWickets = Number(match?.wickets ?? 0);
      const totalPlayers =
        (match?.playerStats || []).filter(
          (player) => player?.team === match?.battingTeam,
        ).length || 11;
      const allOutCount = totalPlayers - 1;

      if (secondRuns > firstRuns) {
        return `${match?.battingTeam} won by ${Math.max(0, allOutCount - secondWickets)} wickets`;
      }
      if (secondRuns < firstRuns) {
        return `${match?.bowlingTeam} won by ${firstRuns - secondRuns} runs`;
      }
      return "Match Tied";
    }

    return "Match Complete";
  })();

  const allPlayers = match?.playerStats || [];
  const getPlayerRuns = (player) => Number(player?.batting?.runs ?? 0);
  const getPlayerBallsFaced = (player) => Number(player?.batting?.balls ?? 0);
  const getPlayerFours = (player) => Number(player?.batting?.fours ?? 0);
  const getPlayerSixes = (player) => Number(player?.batting?.sixes ?? 0);
  const getPlayerWickets = (player) => Number(player?.bowling?.wickets ?? 0);
  const getPlayerBowlBalls = (player) => Number(player?.bowling?.balls ?? 0);
  const getPlayerRunsConceded = (player) =>
    Number(player?.bowling?.runsConceded ?? 0);

  const getStrikeRateValue = (player) => {
    const computed = Number(player?.computedStats?.batting?.strikeRate);
    if (Number.isFinite(computed)) return computed;
    const runs = getPlayerRuns(player);
    const balls = getPlayerBallsFaced(player);
    return balls > 0 ? (runs / balls) * 100 : null;
  };

  const getEconomyValue = (player) => {
    const computed = Number(
      player?.computedStats?.bowling?.economy ??
        player?.computedStats?.bowling?.economyRate,
    );
    if (Number.isFinite(computed)) return computed;
    const runs = getPlayerRunsConceded(player);
    const balls = getPlayerBowlBalls(player);
    return balls > 0 ? runs / (balls / 6) : null;
  };

  const topRunScorer = [...allPlayers].sort(
    (a, b) => getPlayerRuns(b) - getPlayerRuns(a),
  )[0];
  const topWicketTaker = [...allPlayers].sort(
    (a, b) => getPlayerWickets(b) - getPlayerWickets(a),
  )[0];
  const bestEconomyPlayer = [...allPlayers]
    .filter((player) => getPlayerBowlBalls(player) >= 12)
    .sort((a, b) => {
      const ae = getEconomyValue(a);
      const be = getEconomyValue(b);
      if (ae === null) return 1;
      if (be === null) return -1;
      return ae - be;
    })[0];
  const bestStrikeRatePlayer = [...allPlayers]
    .filter((player) => getPlayerBallsFaced(player) >= 10)
    .sort((a, b) => {
      const asr = getStrikeRateValue(a);
      const bsr = getStrikeRateValue(b);
      if (asr === null) return 1;
      if (bsr === null) return -1;
      return bsr - asr;
    })[0];

  return (
    <main
      className="min-h-screen bg-[#0d1117] text-slate-100"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800&display=swap');`}</style>

      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#0d1117]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
          >
            Back
          </button>

          <Link
            to="/"
            className="text-base font-black tracking-wide text-white"
          >
            CricTrack
          </Link>

          <Link
            to="/view"
            className="text-xs font-semibold uppercase tracking-wider text-[#f97316]"
          >
            All Matches
          </Link>
        </div>
      </header>

      <div className="mx-4 mt-4 rounded-2xl border border-[#f97316]/30 bg-gradient-to-r from-[#f97316]/20 to-amber-500/10 px-5 py-5 relative">
        <span className="text-slate-400 text-xs">
          {match.team1Name} vs {match.team2Name}
        </span>
        <p className="score-num mt-1 text-2xl font-black text-[#f97316]">
          {derivedResultMessage}
        </p>
        <p className="mt-1 text-slate-600 text-xs">
          {match.totalOvers} overs match
        </p>
        <span
          className="absolute right-4 top-3 text-2xl"
          role="img"
          aria-label="Trophy"
        >
          🏆
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 mt-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#f97316]">
              {firstInnings?.battingTeam || "1st Innings"}
            </p>
            {winningTeam &&
              winningTeam === (firstInnings?.battingTeam || "") && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                  🏆 Won
                </span>
              )}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <p className="score-num text-3xl font-extrabold text-white">
              {firstInningsRuns}/{firstInningsWickets}
            </p>
            <p className="text-slate-500 text-sm">({firstInningsOvers} Ov)</p>
          </div>
          <div className="mt-3 space-y-1">
            {firstInningsBatters.length ? (
              firstInningsBatters.map((player, index) => (
                <p
                  key={`${player?.name || "batter"}-${index}`}
                  className="text-xs text-slate-400"
                >
                  {player?.name || "Unknown"}{" "}
                  {Number(player?.batting?.runs ?? player?.runs ?? 0)}
                </p>
              ))
            ) : (
              <p className="text-xs text-slate-500">No batting data</p>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {firstInningsTopBowler
              ? `${firstInningsTopBowler?.name || "Unknown"} ${Number(firstInningsTopBowler?._wickets ?? firstInningsTopBowler?.bowling?.wickets ?? firstInningsTopBowler?.wickets ?? 0)}/${Number(firstInningsTopBowler?._runs ?? firstInningsTopBowler?.bowling?.runsConceded ?? firstInningsTopBowler?.runs ?? 0)}`
              : "No bowling data"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-400">
              {match?.battingTeam || "2nd Innings"}
            </p>
            {winningTeam && winningTeam === (match?.battingTeam || "") && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                🏆 Won
              </span>
            )}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <p className="score-num text-3xl font-extrabold text-white">
              {secondInningsRuns}/{secondInningsWickets}
            </p>
            <p className="text-slate-500 text-sm">({secondInningsOvers} Ov)</p>
          </div>
          <div className="mt-3 space-y-1">
            {secondInningsBatters.length ? (
              secondInningsBatters.map((player, index) => (
                <p
                  key={`${player?.name || "batter"}-${index}`}
                  className="text-xs text-slate-400"
                >
                  {player?.name || "Unknown"}{" "}
                  {Number(player?.batting?.runs ?? 0)}
                </p>
              ))
            ) : (
              <p className="text-xs text-slate-500">No batting data</p>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {secondInningsTopBowler
              ? `${secondInningsTopBowler?.name || "Unknown"} ${Number(secondInningsTopBowler?.bowling?.wickets ?? 0)}/${Number(secondInningsTopBowler?.bowling?.runsConceded ?? 0)}`
              : "No bowling data"}
          </p>
        </div>
      </div>

      <section className="mt-4 px-4 pb-8">
        <TabBar
          tabs={summaryTabs}
          active={summaryTab}
          onChange={setSummaryTab}
        />

        <div className="rounded-b-2xl border border-t-0 border-slate-800 bg-slate-900/40 p-4">
          {summaryTab === "first-innings" && (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
                BATTING
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="pb-2">Batter</th>
                      <th className="pb-2">Dismissal</th>
                      <th className="pb-2 text-right">R</th>
                      <th className="pb-2 text-right">B</th>
                      <th className="pb-2 text-right">4s</th>
                      <th className="pb-2 text-right">6s</th>
                      <th className="pb-2 text-right">SR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firstInningsScorecardBatting.map((player, index) => {
                      const runs = getBatRuns(player);
                      const balls = getBatBalls(player);
                      const isTopScorer =
                        (player?.name || "") ===
                          (firstInningsTopScorer?.name || "") &&
                        runs === getBatRuns(firstInningsTopScorer);

                      return (
                        <tr
                          key={`${player?.name || "first-bat"}-${index}`}
                          className={`${isTopScorer ? "bg-[#f97316]/5" : ""} border-t border-slate-800/70`}
                        >
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <PlayerAvatar
                                name={player?.name || "Unknown"}
                                photoUrl={
                                  player?.photoUrl ||
                                  player?.photoURL ||
                                  player?.avatarUrl ||
                                  player?.imageUrl
                                }
                                size="sm"
                              />
                              <span className="text-slate-200">
                                {player?.name || "Unknown"}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 text-slate-600 text-xs capitalize">
                            {player?.batting?.dismissalType ||
                              player?.dismissal ||
                              "not out"}
                          </td>
                          <td className="py-2 text-right font-semibold">
                            {runs}
                          </td>
                          <td className="py-2 text-right">{balls}</td>
                          <td className="py-2 text-right">
                            {getBatFours(player)}
                          </td>
                          <td className="py-2 text-right">
                            {getBatSixes(player)}
                          </td>
                          <td className="py-2 text-right">
                            {calcSR(runs, balls)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Extras</span>
                  <span>{firstInningsExtras}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300 font-semibold">
                  <span>Total</span>
                  <span>
                    {firstInningsRuns}/{firstInningsWickets} (
                    {firstInningsOvers} Ov)
                  </span>
                </div>
              </div>

              <hr className="my-4 border-slate-800" />

              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
                BOWLING
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="pb-2">Bowler</th>
                      <th className="pb-2 text-right">O</th>
                      <th className="pb-2 text-right">M</th>
                      <th className="pb-2 text-right">R</th>
                      <th className="pb-2 text-right">W</th>
                      <th className="pb-2 text-right">Eco</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firstInningsScorecardBowling.map((player, index) => {
                      const balls = getBowlBalls(player);
                      const runs = getBowlRuns(player);
                      const wickets = getBowlWickets(player);
                      const isBestBowler =
                        (player?.name || "") ===
                          (firstInningsBestBowler?.name || "") &&
                        wickets === getBowlWickets(firstInningsBestBowler);

                      return (
                        <tr
                          key={`${player?.name || "first-bowl"}-${index}`}
                          className={`${isBestBowler ? "bg-sky-500/5" : ""} border-t border-slate-800/70`}
                        >
                          <td className="py-2 text-slate-200">
                            {player?.name || "Unknown"}
                          </td>
                          <td className="py-2 text-right">
                            {calcOvers(balls)}
                          </td>
                          <td className="py-2 text-right">
                            {getBowlMaidens(player)}
                          </td>
                          <td className="py-2 text-right">{runs}</td>
                          <td className="py-2 text-right font-semibold">
                            {wickets}
                          </td>
                          <td className="py-2 text-right">
                            {calcEcon(runs, balls)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
                Fall of wickets
              </p>
              <div className="flex flex-wrap gap-2">
                {firstInningsWicketEvents.length ? (
                  firstInningsWicketEvents.map((entry, index) => (
                    <span
                      key={`fow-first-${index}`}
                      className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-500"
                    >
                      {(() => {
                        const hasOver = Number.isFinite(Number(entry?.over));
                        const hasBall = Number.isFinite(Number(entry?.ball));
                        const overBall =
                          hasOver && hasBall
                            ? `${entry.over}.${entry.ball}`
                            : "-";
                        return (
                          <>
                            {entry.score}/{entry.wicketNum} · {entry.playerName}{" "}
                            ({overBall})
                          </>
                        );
                      })()}
                    </span>
                  ))
                ) : firstInningsDismissedBatters.length ? (
                  firstInningsDismissedBatters.map((player, index) => (
                    <span
                      key={`fow-first-fallback-${player?.name || index}`}
                      className="rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-400"
                    >
                      {player?.name || "Unknown"} ·{" "}
                      {firstInningsDismissalText(player)}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-slate-600">No wickets</span>
                )}
              </div>
            </div>
          )}

          {summaryTab === "second-innings" && (
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
                BATTING
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="pb-2">Batter</th>
                      <th className="pb-2">Dismissal</th>
                      <th className="pb-2 text-right">R</th>
                      <th className="pb-2 text-right">B</th>
                      <th className="pb-2 text-right">4s</th>
                      <th className="pb-2 text-right">6s</th>
                      <th className="pb-2 text-right">SR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secondInningsScorecardBatting.map((player, index) => {
                      const runs = getBatRuns(player);
                      const balls = getBatBalls(player);
                      const isTopScorer =
                        (player?.name || "") ===
                          (secondInningsTopScorer?.name || "") &&
                        runs === getBatRuns(secondInningsTopScorer);

                      return (
                        <tr
                          key={`${player?.name || "second-bat"}-${index}`}
                          className={`${isTopScorer ? "bg-[#f97316]/5" : ""} border-t border-slate-800/70`}
                        >
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <PlayerAvatar
                                name={player?.name || "Unknown"}
                                photoUrl={
                                  player?.photoUrl ||
                                  player?.photoURL ||
                                  player?.avatarUrl ||
                                  player?.imageUrl
                                }
                                size="sm"
                              />
                              <span className="text-slate-200">
                                {player?.name || "Unknown"}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 text-slate-600 text-xs capitalize">
                            {getDismissal(
                              player,
                              match?.currentStriker,
                              match?.currentNonStriker,
                            )}
                          </td>
                          <td className="py-2 text-right font-semibold">
                            {runs}
                          </td>
                          <td className="py-2 text-right">{balls}</td>
                          <td className="py-2 text-right">
                            {getBatFours(player)}
                          </td>
                          <td className="py-2 text-right">
                            {getBatSixes(player)}
                          </td>
                          <td className="py-2 text-right">
                            {calcSR(runs, balls)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Extras</span>
                  <span>{secondInningsExtras}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300 font-semibold">
                  <span>Total</span>
                  <span>
                    {secondInningsRuns}/{secondInningsWickets} (
                    {secondInningsOvers} Ov)
                  </span>
                </div>
              </div>

              <hr className="my-4 border-slate-800" />

              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
                BOWLING
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                    <tr>
                      <th className="pb-2">Bowler</th>
                      <th className="pb-2 text-right">O</th>
                      <th className="pb-2 text-right">M</th>
                      <th className="pb-2 text-right">R</th>
                      <th className="pb-2 text-right">W</th>
                      <th className="pb-2 text-right">Eco</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secondInningsScorecardBowling.map((player, index) => {
                      const balls = getBowlBalls(player);
                      const runs = getBowlRuns(player);
                      const wickets = getBowlWickets(player);
                      const isBestBowler =
                        (player?.name || "") ===
                          (secondInningsBestBowler?.name || "") &&
                        wickets === getBowlWickets(secondInningsBestBowler);

                      return (
                        <tr
                          key={`${player?.name || "second-bowl"}-${index}`}
                          className={`${isBestBowler ? "bg-sky-500/5" : ""} border-t border-slate-800/70`}
                        >
                          <td className="py-2 text-slate-200">
                            {player?.name || "Unknown"}
                          </td>
                          <td className="py-2 text-right">
                            {calcOvers(balls)}
                          </td>
                          <td className="py-2 text-right">
                            {getBowlMaidens(player)}
                          </td>
                          <td className="py-2 text-right">{runs}</td>
                          <td className="py-2 text-right font-semibold">
                            {wickets}
                          </td>
                          <td className="py-2 text-right">
                            {calcEcon(runs, balls)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
                Fall of wickets
              </p>
              <div className="flex flex-wrap gap-2">
                {secondInningsWicketEvents.length ? (
                  secondInningsWicketEvents.map((entry, index) => (
                    <span
                      key={`fow-second-${index}`}
                      className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-500"
                    >
                      {(() => {
                        const hasOver = Number.isFinite(Number(entry?.over));
                        const hasBall = Number.isFinite(Number(entry?.ball));
                        const overBall =
                          hasOver && hasBall
                            ? `${entry.over}.${entry.ball}`
                            : "-";
                        return (
                          <>
                            {entry.score}/{entry.wicketNum} · {entry.playerName}{" "}
                            ({overBall})
                          </>
                        );
                      })()}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-slate-600">No wickets</span>
                )}
              </div>
            </div>
          )}

          {summaryTab === "top-performers" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="h-full rounded-2xl border border-[#f97316]/20 bg-[#f97316]/5 p-4 flex flex-col justify-between">
                <p className="text-[10px] font-black text-[#f97316]">
                  TOP SCORER
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <PlayerAvatar
                    name={topRunScorer?.name || "N/A"}
                    photoUrl={
                      topRunScorer?.photoUrl ||
                      topRunScorer?.photoURL ||
                      topRunScorer?.avatarUrl ||
                      topRunScorer?.imageUrl
                    }
                    size="lg"
                  />
                  <p className="text-white font-bold truncate">
                    {topRunScorer?.name || "N/A"}
                  </p>
                </div>
                <p className="score-num mt-3 text-4xl text-[#f97316]">
                  {topRunScorer ? getPlayerRuns(topRunScorer) : "N/A"}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {topRunScorer
                    ? `${getPlayerBallsFaced(topRunScorer)}b • SR ${(getStrikeRateValue(topRunScorer) ?? 0).toFixed(1)} • 4s ${getPlayerFours(topRunScorer)} • 6s ${getPlayerSixes(topRunScorer)}`
                    : "N/A"}
                </p>
              </div>

              <div className="h-full rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 flex flex-col justify-between">
                <p className="text-[10px] font-black text-sky-400">
                  TOP WICKET TAKER
                </p>
                <p className="mt-2 text-white font-bold truncate">
                  {topWicketTaker?.name || "N/A"}
                </p>
                <p className="score-num mt-3 text-4xl text-sky-400">
                  {topWicketTaker
                    ? `${getPlayerWickets(topWicketTaker)}/${getPlayerRunsConceded(topWicketTaker)}`
                    : "N/A"}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {topWicketTaker
                    ? `${calcOvers(getPlayerBowlBalls(topWicketTaker))} Ov • Eco ${(getEconomyValue(topWicketTaker) ?? 0).toFixed(2)}`
                    : "N/A"}
                </p>
              </div>

              <div className="h-full rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col justify-between">
                <p className="text-[10px] font-black text-emerald-400">
                  BEST ECONOMY
                </p>
                <p className="mt-2 text-white font-bold truncate">
                  {bestEconomyPlayer?.name || "N/A"}
                </p>
                <p className="score-num mt-3 text-4xl text-emerald-400">
                  {bestEconomyPlayer
                    ? (getEconomyValue(bestEconomyPlayer) ?? 0).toFixed(2)
                    : "N/A"}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {bestEconomyPlayer
                    ? `${calcOvers(getPlayerBowlBalls(bestEconomyPlayer))} Ov • ${getPlayerWickets(bestEconomyPlayer)} wkts`
                    : "N/A"}
                </p>
              </div>

              <div className="h-full rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 flex flex-col justify-between">
                <p className="text-[10px] font-black text-purple-400">
                  BEST STRIKE RATE
                </p>
                <p className="mt-2 text-white font-bold truncate">
                  {bestStrikeRatePlayer?.name || "N/A"}
                </p>
                <p className="score-num mt-3 text-4xl text-purple-400">
                  {bestStrikeRatePlayer
                    ? (getStrikeRateValue(bestStrikeRatePlayer) ?? 0).toFixed(1)
                    : "N/A"}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {bestStrikeRatePlayer
                    ? `${getPlayerRuns(bestStrikeRatePlayer)} runs • ${getPlayerBallsFaced(bestStrikeRatePlayer)} balls`
                    : "N/A"}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

/* ─── main component ──────────────────────────────────────────────────────── */

function ScoreboardPage() {
  const { matchId } = useParams();
  const [searchParams] = useSearchParams();
  const socketRef = useRef(null);

  const [match, setMatch] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("scorecard");
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
  const fallOfWickets = buildFallOfWickets(match.timeline || []);
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
  const strikerRow = (match.playerStats || []).find(
    (p) => p.name === match.currentStriker,
  );
  const nonStrikerRow = (match.playerStats || []).find(
    (p) => p.name === match.currentNonStriker,
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
    { key: "scorecard", label: "Scorecard" },
    { key: "overs", label: "Overs" },
    ...(firstInningsSummary
      ? [{ key: "first-innings", label: "1st Inn" }]
      : []),
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

  if (match.status === "completed") return <MatchSummaryView match={match} />;

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
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[#f97316]">
                {match.battingTeam}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="score-num text-5xl md:text-6xl font-extrabold leading-none text-white">
                  {match.totalRuns}/{match.wickets}
                </span>
                <span className="score-num text-2xl font-semibold text-slate-400">
                  ({oversBowled}.{ballsInOver}/{match.totalOvers})
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
              {firstInningsSummary ? (
                <p className="score-num text-2xl font-bold text-slate-500">
                  {firstInningsSummary.totalRuns}/{firstInningsSummary.wickets}
                  <span className="text-base ml-1">
                    ({firstInningsSummary.oversBowled})
                  </span>
                </p>
              ) : (
                <p className="text-sm font-semibold text-slate-500">
                  Yet to bat
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

          <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-800/60 px-3 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <PlayerAvatar
                  name={match.currentStriker || "—"}
                  photoUrl={getPlayerPhoto(match.currentStriker)}
                  size="sm"
                  isStriker
                />
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">
                    Striker*
                  </p>
                  <p className="text-sm font-semibold text-white truncate">
                    {match.currentStriker || "—"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {strikerRow?.batting?.runs ?? 0}/
                    {strikerRow?.batting?.balls ?? 0}
                  </p>
                </div>
              </div>

              <div className="min-w-0 flex items-center gap-2 border-x border-slate-700/60 px-2">
                <PlayerAvatar
                  name={match.currentNonStriker || "—"}
                  photoUrl={getPlayerPhoto(match.currentNonStriker)}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">
                    Non-Striker
                  </p>
                  <p className="text-sm font-semibold text-slate-300 truncate">
                    {match.currentNonStriker || "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {nonStrikerRow?.batting?.runs ?? 0}/
                    {nonStrikerRow?.batting?.balls ?? 0}
                  </p>
                </div>
              </div>

              <div className="min-w-0 flex items-center gap-2">
                <PlayerAvatar
                  name={match.currentBowler || "—"}
                  photoUrl={getPlayerPhoto(match.currentBowler)}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">
                    Bowler
                  </p>
                  <p className="text-sm font-semibold text-slate-300 truncate">
                    {match.currentBowler || "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {currentBowlerRow
                      ? `${calcOvers(currentBowlerRow._balls)}-${currentBowlerRow._wickets}/${currentBowlerRow._runs}`
                      : "0.0-0/0"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Current over inline */}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide shrink-0">
              Over {oversBowled + 1}:
            </span>
            <div className="flex items-center gap-1.5">
              {currentOver.map((label, i) => (
                <BallChip key={i} label={label} />
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
          {/* ── SCORECARD TAB ── */}
          {activeTab === "scorecard" && (
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                BATTING
              </p>
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

              {/* Fall of wickets */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
                  Fall of Wickets
                </p>
                {fallOfWickets.length === 0 ? (
                  <p className="text-sm text-slate-600">No wickets yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {fallOfWickets.map((wicket) => (
                      <span
                        key={`${wicket.wicketNumber}-${wicket.playerName}-${wicket.overLabel}`}
                        className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300"
                      >
                        W{wicket.wicketNumber}: {wicket.playerName}{" "}
                        {wicket.scoreAtFall} ({wicket.overLabel} ov)
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-px bg-slate-800" />

              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                BOWLING
              </p>
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
                                    <span className="ml-1 text-[#f97316]">
                                      *
                                    </span>
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

              <div className="rounded-lg bg-slate-900/60 border border-slate-800 px-4 py-2.5 text-xs text-slate-500 space-y-1">
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
              <div className="sticky top-12 z-10 rounded-lg border border-slate-800 bg-slate-900/95 px-3 py-2 text-xs text-slate-400 backdrop-blur-sm">
                Overs: {oversBowled}.{ballsInOver} · Runs: {match.totalRuns}
              </div>
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
                      <span className="text-xs font-bold text-slate-500">
                        {getOrdinal(over.overNumber)} Over
                        {over.bowlerName ? ` · ${over.bowlerName}` : ""}
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
