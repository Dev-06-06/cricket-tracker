import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BottomNav from "../components/BottomNav";
import ProfileToolbarButton from "../components/ProfileToolbarButton";
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
    if (player.name === striker || player.name === nonStriker)
      return "batting";
    // RISK: benched player shows as retired not out
    if (player.isBenched) return "retired not out";
    return "not out";
  }
  const dt = player.batting?.dismissalType || "";
  return dt ? dt.charAt(0).toUpperCase() + dt.slice(1) : "Out";
}

function buildBattingRows(match) {
  const striker = match.currentStriker || null;
  const nonStriker = match.currentNonStriker || null;
  // RISK: p.team is a name string from socket emit
  // match.battingTeam is also a name string — direct compare is correct
  // BUT joker has two entries — deduplicate by name
  const seen = new Set();
  const rows = (match.playerStats || []).filter((p) => {
    if (p.team !== match.battingTeam) return false;
    if (!p.didBat) return false;
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
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
  // RISK: deduplicate joker by name (two entries, same name)
  const seen = new Set();
  const bowlers = (match.playerStats || []).filter((p) => {
    if (p.team !== match.bowlingTeam) return false;
    if (!p.didBowl) return false;
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
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

function MatchSummaryView({ match, fullTimeline = [] }) {
  const navigate = useNavigate();
  const [summaryTab, setSummaryTab] = useState("first-innings");

  const jokerNames = useMemo(() => {
    const names = new Set();
    (match?.playerStats || [])
      .filter((player) => player.isJoker)
      .forEach((player) => names.add(player.name));
    return names;
  }, [match?.playerStats]);

  const firstInnings = match?.firstInningsSummary;
  const innings1BattingRows = match?.innings1?.battingRows || [];
  const innings1BowlingRows = match?.innings1?.bowlingRows || [];
  const innings1Team = match?.innings1?.battingTeam ?? match?.team1Name ?? "";
  const innings2BattingTeam = match?.innings1?.battingTeam === match?.team1Name
    ? match?.team2Name
    : match?.team1Name;
  const seenI2Bat = new Set();
  const innings2BattingRows = (match?.innings2?.battingRows || []).length
    ? match?.innings2?.battingRows
    : (match?.playerStats || [])
        .filter((p) => {
          // innings2BattingTeam is a name string
          // p.team is also a name string from socket
          if (p.team !== innings2BattingTeam) return false;
          if (!p.didBat) return false;
          if (seenI2Bat.has(p.name)) return false;
          seenI2Bat.add(p.name);
          return true;
        })
        .map((p) => ({
          name: p.name,
          dismissal: p.isOut
            ? (p.batting?.dismissalType || "out")
            : p.isBenched
              ? "retired not out"
              : "not out",
          runs:    p.batting?.runs   || 0,
          balls:   p.batting?.balls  || 0,
          fours:   p.batting?.fours  || 0,
          sixes:   p.batting?.sixes  || 0,
          isJoker: p.isJoker || false,
        }));

  // Innings 2 bowling team = team that BATTED in innings 1
  // Because innings 1 batting team is now bowling in innings 2
  const innings2BowlingTeam = innings1Team === match?.team1Name
    ? match?.team2Name
    : match?.team1Name;

  const seenI2Bowl = new Set();
  const innings2BowlingRows = (match?.playerStats || [])
    .filter((p) => {
      if (p.team !== innings2BowlingTeam) return false;
      if (!p.didBowl) return false;
      if (seenI2Bowl.has(p.name)) return false;
      seenI2Bowl.add(p.name);
      return true;
    })
    .map((p) => ({
      name: p.name,
      overs:   p.bowling?.overs   || 0,
      runs:    p.bowling?.runs    || 0,
      wickets: p.bowling?.wickets || 0,
      balls:   p.bowling?.balls   || 0,
      isJoker: p.isJoker || false,
    }));
  const innings1Score = match?.innings1?.score ?? match?.firstInningsScore ?? 0;
  const innings1Wickets = match?.innings1?.wickets ?? 0;
  const innings1Overs = match?.innings1?.overs ?? 0;
  const summaryTabs = [
    { key: "first-innings", label: "1st Innings" },
    { key: "second-innings", label: "2nd Innings" },
    { key: "top-performers", label: "Top Performers" },
  ];

  function calcMOTMScore(player, allPlayers) {
    const runs = Number(player?.batting?.runs ?? 0);
    const balls = Number(player?.batting?.balls ?? 0);
    const fours = Number(player?.batting?.fours ?? 0);
    const sixes = Number(player?.batting?.sixes ?? 0);
    const wickets = Number(player?.bowling?.wickets ?? 0);
    const bowlBalls = Number(player?.bowling?.balls ?? 0);
    const bowlRuns = Number(player?.bowling?.runs ?? 0);

    const sr = balls > 0 ? (runs / balls) * 100 : 0;
    const economy = bowlBalls > 0 ? bowlRuns / (bowlBalls / 6) : 99;

    let score = 0;

    // Batting points
    score += runs * 1;
    score += fours * 1;
    score += sixes * 2;
    if (runs >= 30) score += 10;
    if (runs >= 50) score += 15;
    if (runs >= 100) score += 25;
    if (balls > 0 && sr >= 150) score += 10;
    if (balls > 0 && sr >= 200) score += 10;

    // Bowling points
    score += wickets * 25;
    if (wickets >= 3) score += 15;
    if (wickets >= 5) score += 20;
    if (bowlBalls >= 6 && economy <= 6) score += 10;
    if (bowlBalls >= 6 && economy <= 4) score += 10;

    return score;
  }

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

  const timeline = fullTimeline.length > 0
    ? fullTimeline
    : (match?.timeline || []);

  const firstInningsTimeline = timeline.filter(isFirstInningsBall);
  const secondInningsTimeline = timeline.filter(isSecondInningsBall);

  const calcExtras = (timeline = []) =>
    timeline.reduce((sum, ball) => sum + Number(ball?.extraRuns || 0), 0);

  const firstInningsDismissedBatters = innings1BattingRows.filter(
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

  const firstInningsScorecardBatting = [...innings1BattingRows];
  const firstInningsTopScorer = [...firstInningsScorecardBatting].sort(
    (a, b) => getBatRuns(b) - getBatRuns(a),
  )[0];
  const firstInningsScorecardBowling = [...innings1BowlingRows];
  const firstInningsBestBowler = [...firstInningsScorecardBowling].sort(
    (a, b) => getBowlWickets(b) - getBowlWickets(a),
  )[0];

  const firstInningsBatters = [...innings1BattingRows]
    .sort(
      (a, b) =>
        Number(b?.batting?.runs ?? b?.runs ?? 0) -
        Number(a?.batting?.runs ?? a?.runs ?? 0),
    )
    .slice(0, 2);
  const firstInningsTopBowler = [...innings1BowlingRows].sort(
    (a, b) =>
      Number(b?._wickets ?? b?.bowling?.wickets ?? b?.wickets ?? 0) -
      Number(a?._wickets ?? a?.bowling?.wickets ?? a?.wickets ?? 0),
  )[0];

  const seenSib = new Set();
  const secondInningsBatters = [...(match?.playerStats || [])]
    .filter((p) => {
      if (p?.team !== match?.battingTeam) return false;
      if (!p?.didBat) return false;
      if (seenSib.has(p.name)) return false;
      seenSib.add(p.name);
      return true;
    })
    .sort(
      (a, b) => Number(b?.batting?.runs ?? 0) - Number(a?.batting?.runs ?? 0),
    )
    .slice(0, 2);
  const seenStb = new Set();
  const secondInningsTopBowler = [...(match?.playerStats || [])]
    .filter((p) => {
      if (p?.team !== match?.bowlingTeam) return false;
      if (!p?.didBowl) return false;
      if (seenStb.has(p.name)) return false;
      seenStb.add(p.name);
      return true;
    })
    .sort(
      (a, b) =>
        Number(b?.bowling?.wickets ?? 0) - Number(a?.bowling?.wickets ?? 0),
    )[0];

  const firstInningsRuns = Number(innings1Score ?? 0);
  const firstInningsWickets = Number(innings1Wickets ?? 0);
  const firstInningsExtras = Number(
    firstInnings?.extras ?? calcExtras(firstInningsTimeline),
  );
  const firstInningsOvers = innings1Overs;

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

  const allMatchPlayers = [
    ...(firstInnings?.battingRows || []).map((r) => ({
      name: r.name,
      batting: { runs: r.runs, balls: r.balls, fours: r.fours, sixes: r.sixes },
      bowling: { wickets: 0, balls: 0, runs: 0 },
    })),
    ...(match?.playerStats || []),
  ].reduce((acc, p) => {
    // merge by name — playerStats has bowling, battingRows has batting
    const existing = acc.find((x) => x.name === p.name);
    if (existing) {
      // merge batting from battingRows into playerStats entry if better
      if (!existing.batting?.balls && p.batting?.balls)
        existing.batting = p.batting;
      if (!existing.bowling?.balls && p.bowling?.balls)
        existing.bowling = p.bowling;
    } else {
      acc.push({ ...p });
    }
    return acc;
  }, []);

  const motmPlayer = [...allMatchPlayers]
    .map((p) => ({ ...p, motmScore: calcMOTMScore(p, allMatchPlayers) }))
    .sort((a, b) => b.motmScore - a.motmScore)[0];

  // Top scorer across both innings from playerStats (has batting for 2nd innings)
  // + battingRows for 1st innings
  const topBatter = [...allMatchPlayers]
    .filter((p) => Number(p?.batting?.balls ?? 0) > 0)
    .sort(
      (a, b) => Number(b?.batting?.runs ?? 0) - Number(a?.batting?.runs ?? 0),
    )[0];

  // Top wicket taker — combine both innings
  const bowlingMap = {};
  (match?.playerStats || []).forEach((p) => {
    if (!p?.bowling?.balls && !p?.bowling?.wickets) return;
    bowlingMap[p.name] = {
      name: p.name,
      wickets: Number(p?.bowling?.wickets ?? 0),
      balls: Number(p?.bowling?.balls ?? 0),
      runs: Number(p?.bowling?.runs ?? 0),
    };
  });
  (firstInnings?.bowlingRows || []).forEach((r) => {
    const existing = bowlingMap[r.name];
    const w = Number(r?.wickets ?? r?._wickets ?? r?.bowling?.wickets ?? 0);
    const b = Number(r?.balls ?? r?._balls ?? r?.bowling?.balls ?? 0);
    const ru = Number(r?.runs ?? r?._runs ?? r?.bowling?.runs ?? 0);
    if (existing) {
      existing.wickets += w;
      existing.balls += b;
      existing.runs += ru;
    } else {
      bowlingMap[r.name] = { name: r.name, wickets: w, balls: b, runs: ru };
    }
  });
  const allBowlers = Object.values(bowlingMap);
  const topBowler = [...allBowlers].sort(
    (a, b) => b.wickets - a.wickets || a.runs - b.runs,
  )[0];

  // Best economy — minimum 1 over (6 balls), lower threshold for short format
  const bestEcon = [...allBowlers]
    .filter((p) => p.balls >= 6)
    .map((p) => ({ ...p, econ: p.balls > 0 ? p.runs / (p.balls / 6) : 99 }))
    .sort((a, b) => a.econ - b.econ)[0];

  // Best strike rate — minimum 4 balls faced (short format friendly)
  const bestSR = [...allMatchPlayers]
    .filter((p) => Number(p?.batting?.balls ?? 0) >= 4)
    .map((p) => {
      const r = Number(p?.batting?.runs ?? 0);
      const b = Number(p?.batting?.balls ?? 0);
      return { ...p, sr: b > 0 ? (r / b) * 100 : 0 };
    })
    .sort((a, b) => b.sr - a.sr)[0];

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
            onClick={() => navigate("/view")}
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

          <ProfileToolbarButton />
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
              {innings1Team || "1st Innings"}
            </p>
            {winningTeam &&
              winningTeam === (innings1Team || "") && (
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
                    {innings1BattingRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-sm text-slate-600">
                          No batting data
                        </td>
                      </tr>
                    ) : (
                      innings1BattingRows.map((row, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-2 text-sm font-medium text-white">
                            {row.name}
                            {jokerNames.has(row.name) && (
                              <span className="ml-1 text-amber-400 text-xs">🃏</span>
                            )}
                          </td>
                          <td className="py-2 text-xs text-slate-500">
                            {row.dismissal || "not out"}
                          </td>
                          <td className="py-2 text-sm font-bold text-white text-right">
                            {row.runs ?? 0}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.balls ?? 0}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.fours ?? 0}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.sixes ?? 0}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.balls > 0
                              ? ((row.runs / row.balls) * 100).toFixed(1)
                              : "-"}
                          </td>
                        </tr>
                      ))
                    )}
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
                      <th className="pb-2 text-right">R</th>
                      <th className="pb-2 text-right">W</th>
                      <th className="pb-2 text-right">Eco</th>
                    </tr>
                  </thead>
                  <tbody>
                    {innings1BowlingRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-sm text-slate-600">
                          No bowling data
                        </td>
                      </tr>
                    ) : (
                      innings1BowlingRows.map((row, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-2 text-sm font-medium text-white">
                            {row.name}
                            {jokerNames.has(row.name) && (
                              <span className="ml-1 text-amber-400 text-xs">🃏</span>
                            )}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.overs ?? 0}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.runs ?? 0}
                          </td>
                          <td className="py-2 text-sm font-bold text-white text-right">
                            {row.wickets ?? 0}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.balls > 0
                              ? ((row.runs / row.balls) * 6).toFixed(2)
                              : "-"}
                          </td>
                        </tr>
                      ))
                    )}
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
                    {innings2BattingRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-sm text-slate-600">
                          No batting data
                        </td>
                      </tr>
                    ) : (
                      innings2BattingRows.map((row, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-2 text-sm font-medium text-white">
                            {row.name}
                            {row.isJoker && (
                              <span className="ml-1 text-amber-400 text-xs">🃏</span>
                            )}
                          </td>
                          <td className="py-2 text-xs text-slate-500">
                            {row.dismissal}
                          </td>
                          <td className="py-2 text-sm font-bold text-white text-right">
                            {row.runs}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.balls}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.fours}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.sixes}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.balls > 0
                              ? ((row.runs / row.balls) * 100).toFixed(1)
                              : "-"}
                          </td>
                        </tr>
                      ))
                    )}
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
                      <th className="pb-2 text-right">R</th>
                      <th className="pb-2 text-right">W</th>
                      <th className="pb-2 text-right">Eco</th>
                    </tr>
                  </thead>
                  <tbody>
                    {innings2BowlingRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-sm text-slate-600">
                          No bowling data
                        </td>
                      </tr>
                    ) : (
                      innings2BowlingRows.map((row, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-2 text-sm font-medium text-white">
                            {row.name}
                            {row.isJoker && (
                              <span className="ml-1 text-amber-400 text-xs">🃏</span>
                            )}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.overs}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.runs}
                          </td>
                          <td className="py-2 text-sm font-bold text-white text-right">
                            {row.wickets}
                          </td>
                          <td className="py-2 text-xs text-slate-500 text-right">
                            {row.balls > 0
                              ? ((row.runs / row.balls) * 6).toFixed(2)
                              : "-"}
                          </td>
                        </tr>
                      ))
                    )}
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
            <div className="space-y-4">
              {/* ── Man of the Match ── */}
              {motmPlayer && (
                <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-orange-500/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-yellow-400 mb-3">
                    🏆 Man of the Match
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 rounded-full bg-yellow-500/20 border-2 border-yellow-500/40 flex items-center justify-center text-xl font-black text-yellow-300">
                      {(motmPlayer.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-black text-white truncate">
                        {motmPlayer.name}
                        {jokerNames.has(motmPlayer.name) && (
                          <span className="ml-1 text-amber-400 text-xs">🃏</span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        {Number(motmPlayer?.batting?.runs ?? 0) > 0 && (
                          <span className="text-xs text-slate-400">
                            🏏{" "}
                            <span className="text-white font-bold">
                              {motmPlayer.batting.runs}
                            </span>{" "}
                            ({motmPlayer.batting.balls}b)
                            {motmPlayer.batting.fours > 0 &&
                              ` · ${motmPlayer.batting.fours}×4`}
                            {motmPlayer.batting.sixes > 0 &&
                              ` · ${motmPlayer.batting.sixes}×6`}
                          </span>
                        )}
                        {Number(
                          motmPlayer?.bowling?.wickets ??
                            bowlingMap[motmPlayer.name]?.wickets ??
                            0,
                        ) > 0 && (
                          <span className="text-xs text-slate-400">
                            🎯{" "}
                            <span className="text-white font-bold">
                              {bowlingMap[motmPlayer.name]?.wickets ??
                                motmPlayer?.bowling?.wickets ??
                                0}
                            </span>{" "}
                            wkts
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                        Score
                      </p>
                      <p className="score-num text-2xl font-black text-yellow-400">
                        {Math.round(motmPlayer.motmScore)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Stat cards grid ── */}
              <div className="grid grid-cols-2 gap-3">
                {/* Top scorer */}
                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3 flex flex-col gap-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-orange-400">
                    Top Scorer
                  </p>
                  <p className="text-sm font-bold text-white truncate">
                    {topBatter?.name || "—"}
                    {topBatter?.name && jokerNames.has(topBatter.name) && (
                      <span className="ml-1 text-amber-400 text-xs">🃏</span>
                    )}
                  </p>
                  <p className="score-num text-3xl font-black text-orange-400">
                    {Number(topBatter?.batting?.runs ?? 0)}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {Number(topBatter?.batting?.balls ?? 0)}b
                    {Number(topBatter?.batting?.balls ?? 0) > 0 &&
                      ` · SR ${((Number(topBatter.batting.runs) / Number(topBatter.batting.balls)) * 100).toFixed(0)}`}
                    {Number(topBatter?.batting?.fours ?? 0) > 0 &&
                      ` · ${topBatter.batting.fours}×4`}
                    {Number(topBatter?.batting?.sixes ?? 0) > 0 &&
                      ` · ${topBatter.batting.sixes}×6`}
                  </p>
                </div>

                {/* Top wicket taker */}
                <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3 flex flex-col gap-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-sky-400">
                    Top Wickets
                  </p>
                  <p className="text-sm font-bold text-white truncate">
                    {topBowler?.name || "—"}
                    {topBowler?.name && jokerNames.has(topBowler.name) && (
                      <span className="ml-1 text-amber-400 text-xs">🃏</span>
                    )}
                  </p>
                  <p className="score-num text-3xl font-black text-sky-400">
                    {topBowler?.wickets ?? 0}
                    <span className="text-base text-slate-500 font-normal">
                      /{topBowler?.runs ?? 0}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {topBowler?.balls
                      ? `${Math.floor(topBowler.balls / 6)}.${topBowler.balls % 6} ov`
                      : "—"}
                    {topBowler?.balls > 0 &&
                      ` · Eco ${(topBowler.runs / (topBowler.balls / 6)).toFixed(1)}`}
                  </p>
                </div>

                {/* Best economy */}
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex flex-col gap-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                    Best Economy
                  </p>
                  <p className="text-sm font-bold text-white truncate">
                    {bestEcon?.name || "—"}
                  </p>
                  <p className="score-num text-3xl font-black text-emerald-400">
                    {bestEcon ? bestEcon.econ.toFixed(2) : "—"}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {bestEcon
                      ? `${Math.floor(bestEcon.balls / 6)}.${bestEcon.balls % 6} ov · ${bestEcon.wickets} wkts`
                      : "min 1 over"}
                  </p>
                </div>

                {/* Best strike rate */}
                <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-3 flex flex-col gap-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-purple-400">
                    Best Strike Rate
                  </p>
                  <p className="text-sm font-bold text-white truncate">
                    {bestSR?.name || "—"}
                  </p>
                  <p className="score-num text-3xl font-black text-purple-400">
                    {bestSR ? bestSR.sr.toFixed(0) : "—"}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {bestSR
                      ? `${bestSR.batting?.runs ?? 0} runs · ${bestSR.batting?.balls ?? 0} balls`
                      : "min 4 balls"}
                  </p>
                </div>
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
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const socketRef = useRef(null);
  const lastCurrentOverRef = useRef([]);

  const [match, setMatch] = useState(null);
  const [fullTimeline, setFullTimeline] = useState([]);
  const [loadError, setLoadError] = useState("");
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

    (match?.playerStats || []).forEach(collectPhoto);
    (match?.team1Players || []).forEach(collectPhoto);
    (match?.team2Players || []).forEach(collectPhoto);

    return map;
  }, [match?.playerStats, match?.team1Players, match?.team2Players]);

  const jokerNames = useMemo(() => {
    const names = new Set();
    (match?.playerStats || [])
      .filter((p) => p.isJoker)
      .forEach((p) => names.add(p.name));
    return names;
  }, [match?.playerStats]);

  useEffect(() => {
    setFullTimeline([]);
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    const socket = createMatchSocket(token);
    socketRef.current = socket;
    let pollInterval = null;
    let retryTimer = null;

    const apply = (updatedMatch) => {
      setMatch(updatedMatch);
        if (updatedMatch.ballsBowled !== undefined) {
        setFullTimeline((prev) => {
            // RISK: after undo, ballsBowled decreases
            // fullTimeline must be trimmed to remove the undone ball
            // We detect undo by comparing ballsBowled to fullTimeline
            // valid ball count
            const prevValidCount = prev.filter(
              (b) =>
                !b.extraType ||
                b.extraType === "none" ||
                b.extraType === "bye" ||
                b.extraType === "leg-bye",
            ).length;

            const newValidCount = updatedMatch.ballsBowled ?? 0;

            // Undo detected — ballsBowled decreased
            if (newValidCount < prevValidCount && prev.length > 0) {
              // Remove balls from the end until valid count matches
              const trimmed = [...prev];
              let currentValid = prevValidCount;
              while (currentValid > newValidCount && trimmed.length > 0) {
                const last = trimmed[trimmed.length - 1];
                trimmed.pop();
                const wasValid =
                  !last.extraType ||
                  last.extraType === "none" ||
                  last.extraType === "bye" ||
                  last.extraType === "leg-bye";
                if (wasValid) currentValid--;
              }
              return trimmed;
            }

            // Normal delivery — append new balls only
            if (!updatedMatch.timeline || updatedMatch.timeline.length === 0) return prev;
          const existingIds = new Set(
            prev.map((b) => b._id?.toString()).filter(Boolean),
          );
          const newBalls = (updatedMatch.timeline || []).filter(
            (b) => b._id && !existingIds.has(b._id.toString()),
          );
          return newBalls.length > 0 ? [...prev, ...newBalls] : prev;
        });
      }
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
            teamAName: updatedMatch.bowlingTeam,
            teamBName: updatedMatch.battingTeam,
          }),
        );
      } else {
        setMatchEndStatus({ isMatchOver: false, resultMessage: "" });
      }
    };

    const startFallbackPolling = () => {
      if (!isViewerMode || pollInterval) return;
      pollInterval = setInterval(() => {
        getMatch(matchId, token)
          .then((res) => {
            if (res?.match) setMatch(res.match);
          })
          .catch((err) => {
            setLoadError(err.message || "Failed to load match");
          });
      }, 3000);
    };

    const fetchMatch = async () => {
      try {
        const data = await getMatch(matchId, token);
        if (data?.match) {
          apply(data.match);

          // RISK: redirect can arrive before match status is written
          // to DB — if not completed yet, retry once after 1 second
          if (data.match?.status !== "completed") {
            retryTimer = setTimeout(fetchMatch, 1000);
          }
        }
      } catch (err) {
        setLoadError(err.message || "Failed to load match");
      }
    };

    const stopFallbackPolling = () => {
      if (!pollInterval) return;
      clearInterval(pollInterval);
      pollInterval = null;
    };

    const handleConnect = () => {
      stopFallbackPolling();
      socket.emit("joinMatch", { matchId });
    };

    const handleDisconnect = () => {
      startFallbackPolling();
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("matchState", apply);
    socket.on("fullTimeline", (data) => {
      if (data.matchId?.toString() === matchId?.toString()) {
        setFullTimeline(data.timeline || []);
      }
    });
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

    fetchMatch();

    return () => {
      stopFallbackPolling();
      if (retryTimer) clearTimeout(retryTimer);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("matchState");
      socket.off("fullTimeline");
      socket.off("score_updated");
      socket.off("match_completed");
      socket.off("toss_flip_started");
      socket.off("toss_flip_result");
      socket.off("connect_error");
      socket.disconnect();
    };
  }, [isViewerMode, matchId, token]);

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
      <div className="flex h-screen items-center justify-center bg-[#0d1117]">
        {loadError ? (
          <p className="text-red-400 text-sm px-6 text-center">{loadError}</p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
            <p className="text-slate-500 text-sm">Loading scoreboard...</p>
          </div>
        )}
      </div>
    );

  /* ── computed values ── */
  // RISK: match.timeline is only last 12 balls — flickers
  // Use fullTimeline which persists across matchState updates
  const stableTimeline = fullTimeline.length > 0
    ? fullTimeline
    : (match.timeline || []);
  const currentOver = buildCurrentOver(stableTimeline);
  if (currentOver.length > 0) {
    lastCurrentOverRef.current = currentOver;
  }
  const stableCurrentOver = currentOver.length > 0
    ? currentOver
    : lastCurrentOverRef.current;

  const timelineForHistory = fullTimeline.length > 0
    ? fullTimeline
    : (match.timeline || []);
  const oversSummary = buildOversSummary(timelineForHistory);
  const fallOfWickets = buildFallOfWickets(timelineForHistory);
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

  // RISK: deduplicate joker + filter by name string team
  const seenYtb = new Set();
  const yetToBat = (match.playerStats || []).filter((p) => {
    if (p.team !== match.battingTeam) return false;
    if (p.didBat || p.isOut) return false;
    if (seenYtb.has(p.name)) return false;
    seenYtb.add(p.name);
    return true;
  });
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
    return photoMap[name] ?? null;
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
        className="min-h-screen bg-[#0d1117] px-4 py-6 pb-20 text-slate-100"
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

        <BottomNav />
      </main>
    );
  }

  if (match.status === "completed") {
    return <MatchSummaryView match={match} fullTimeline={fullTimeline} />;
  }

  return (
    <main
      className="min-h-screen bg-[#0d1117] text-slate-100 pb-20"
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
                    {match.currentStriker && jokerNames.has(match.currentStriker) && (
                      <span className="ml-1 text-amber-400 text-xs">🃏</span>
                    )}
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
                    {match.currentNonStriker &&
                      jokerNames.has(match.currentNonStriker) && (
                        <span className="ml-1 text-amber-400 text-xs">🃏</span>
                      )}
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
                    {match.currentBowler && jokerNames.has(match.currentBowler) && (
                      <span className="ml-1 text-amber-400 text-xs">🃏</span>
                    )}
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
              {stableCurrentOver.map((label, i) => (
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
                                    {player.isJoker && (
                                      <span className="ml-1 text-amber-400 text-xs">🃏</span>
                                    )}
                                  </p>
                                  <p
                                    className={`text-xs ${
                                      dismissal === "batting"
                                        ? "text-emerald-400"
                                        : dismissal === "not out"
                                          ? "text-slate-500"
                                          : dismissal === "retired not out"
                                            ? "text-amber-500/70"
                                            : "text-slate-600"
                                    }`}
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
                                  {player.isJoker && (
                                    <span className="ml-1 text-amber-400 text-xs">🃏</span>
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

      <BottomNav />
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
        onClick={() => navigate("/view")}
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
