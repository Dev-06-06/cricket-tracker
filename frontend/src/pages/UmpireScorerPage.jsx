import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createMatchSocket } from "../services/socket";
import { getMatch } from "../services/api";
import { checkMatchEnd } from "../utils/matchResult";
import { UMPIRE_AUTH_KEY } from "./UmpireLoginPage";

const runOptions = [0, 1, 2, 3, 4, 6];
const wicketTypes = [
  "bowled",
  "caught",
  "lbw",
  "run-out",
  "stumped",
  "hit-wicket",
];

function getBallLabel(ball) {
  if (ball.isWicket) return "W";
  if (ball.extras?.type === "wide") {
    const extra = (ball.extras.runs || 1) - 1;
    return extra > 0 ? `Wd+${extra}` : "Wd";
  }
  if (ball.extras?.type === "noBall") {
    return ball.runs > 0 ? `Nb+${ball.runs}` : "Nb";
  }
  if (ball.extras?.type === "bye") {
    return `B${ball.extras.runs || 0}`;
  }
  return String(ball.runs ?? 0);
}

function getBallToneClass(label) {
  if (label === "W") return "bg-red-900";
  if (label === "4") return "bg-blue-900";
  if (label === "6") return "bg-emerald-900";
  if (label.startsWith("Wd") || label.startsWith("Nb")) return "bg-amber-900";
  if (label.startsWith("B")) return "bg-slate-700";
  return "bg-slate-600";
}

function buildCurrentOver(timeline) {
  if (!timeline || timeline.length === 0) return [];

  let validCount = 0;
  let currentOverBalls = [];

  for (const ball of timeline) {
    const label = getBallLabel(ball);
    currentOverBalls.push({ label, ball });

    if (ball.isValidBall === true) {
      validCount++;
      if (validCount % 6 === 0) {
        currentOverBalls = []; // reset for new over
      }
    }
  }

  return currentOverBalls;
}

function getBatterStat(match, name) {
  if (!match || !name)
    return { runs: 0, balls: 0, fours: 0, sixes: 0, sr: "-" };
  const p = match.playerStats?.find((x) => x.name === name);
  if (!p) return { runs: 0, balls: 0, fours: 0, sixes: 0, sr: "-" };
  const sr =
    p.batting?.balls > 0
      ? ((p.batting.runs / p.batting.balls) * 100).toFixed(1)
      : "-";
  return {
    runs: p.batting?.runs ?? 0,
    balls: p.batting?.balls ?? 0,
    fours: p.batting?.fours ?? 0,
    sixes: p.batting?.sixes ?? 0,
    sr,
  };
}

function getBowlerStat(match, name) {
  if (!match || !name)
    return { overs: "0.0", wickets: 0, runs: 0, economy: "-" };
  const p = match.playerStats?.find((x) => x.name === name);
  if (!p) return { overs: "0.0", wickets: 0, runs: 0, economy: "-" };
  const fullOvers = Math.floor((p.bowling?.balls ?? 0) / 6);
  const rem = (p.bowling?.balls ?? 0) % 6;
  const economy =
    (p.bowling?.balls ?? 0) > 0
      ? (p.bowling.runs / (p.bowling.balls / 6)).toFixed(1)
      : "-";
  return {
    overs: `${fullOvers}.${rem}`,
    wickets: p.bowling?.wickets ?? 0,
    runs: p.bowling?.runs ?? 0,
    economy,
  };
}

function getRunButtonLabel(runs, currentExtraType) {
  if (currentExtraType === "wide") return runs === 0 ? "Wd" : `+${runs}`;
  return String(runs);
}

function normalizeMatchState(match) {
  if (!match) return match;
  return {
    ...match,
    striker: match.striker ?? match.currentStriker ?? null,
    nonStriker: match.nonStriker ?? match.currentNonStriker ?? null,
  };
}

function UmpireScorerPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const socketRef = useRef(null);
  const prevBallsBowledRef = useRef(null);

  const [match, setMatch] = useState(null);

  // Delivery modifier state
  const [isWicket, setIsWicket] = useState(false);
  const [wicketType, setWicketType] = useState("");
  const [extraType, setExtraType] = useState(""); // 'wide' | 'no-ball' | ''
  const [dismissedBatter, setDismissedBatter] = useState("");

  // Modal state
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  const [selectedNewBowler, setSelectedNewBowler] = useState("");
  const [showBatterModal, setShowBatterModal] = useState(false);
  const [selectedNewBatter, setSelectedNewBatter] = useState("");
  const [showSecondInningsModal, setShowSecondInningsModal] = useState(false);
  const [secondInningsStriker, setSecondInningsStriker] = useState("");
  const [secondInningsNonStriker, setSecondInningsNonStriker] = useState("");
  const [secondInningsBowler, setSecondInningsBowler] = useState("");
  const [matchEndStatus, setMatchEndStatus] = useState({
    isMatchOver: false,
    resultMessage: "",
  });

  // Create socket and attach listeners; re-run when matchId changes
  useEffect(() => {
    if (!matchId) {
      return;
    }

    const socket = createMatchSocket();
    socketRef.current = socket;

    getMatch(matchId)
      .then((response) => {
        if (response?.match) {
          setMatch(normalizeMatchState(response.match));
        }
      })
      .catch(() => {
        // Socket will still sync match state if fetch fails.
      });

    socket.on("connect", () => {
      socket.emit("joinMatch", { matchId });
    });

    socket.on("matchState", (updatedMatchRaw) => {
      const updatedMatch = normalizeMatchState(updatedMatchRaw);
      const curr = updatedMatch.ballsBowled ?? 0;
      const prev = prevBallsBowledRef.current;

      const shouldEvaluateResult =
        (updatedMatch.inningsNumber === 2 ||
          typeof updatedMatch.firstInningsScore === "number") &&
        typeof updatedMatch.firstInningsScore === "number";

      if (shouldEvaluateResult) {
        const teamBPlayersCount = (updatedMatch.playerStats || []).filter(
          (player) => player.team === updatedMatch.battingTeam,
        ).length;

        setMatchEndStatus(
          checkMatchEnd({
            teamAScore: updatedMatch.firstInningsScore,
            teamBScore: updatedMatch.totalRuns,
            teamBWickets: updatedMatch.wickets,
            teamBPlayersCount,
            totalValidBalls: updatedMatch.ballsBowled,
            totalOvers: updatedMatch.totalOvers,
          }),
        );
      } else {
        setMatchEndStatus({ isMatchOver: false, resultMessage: "" });
      }

      if (updatedMatch.status === "innings_complete") {
        setShowBatterModal(false);
        setShowBowlerModal(false);
        setShowSecondInningsModal(true);
        setSecondInningsStriker("");
        setSecondInningsNonStriker("");
        setSecondInningsBowler("");
      }

      // Detect end of over: valid balls transitioned to a non-zero multiple of 6 during live play
      if (
        prev !== null &&
        curr !== prev &&
        curr > 0 &&
        curr % 6 === 0 &&
        updatedMatch.status === "live"
      ) {
        setShowBowlerModal(true);
        setSelectedNewBowler("");
      }
      prevBallsBowledRef.current = curr;

      setMatch({ ...updatedMatch }); // spread to force new object reference

      // Auto-show new batter modal after a wicket during live play
      if (
        updatedMatch.status === "live" &&
        (!updatedMatch.striker || !updatedMatch.nonStriker)
      ) {
        setShowBatterModal(true);
        setSelectedNewBatter("");
      }
    });

    socket.on("innings_complete", () => {
      setShowBatterModal(false);
      setShowBowlerModal(false);
      setShowSecondInningsModal(true);
      setSecondInningsStriker("");
      setSecondInningsNonStriker("");
      setSecondInningsBowler("");
    });

    socket.on("match_completed", (payload) => {
      if (payload) {
        setMatch(normalizeMatchState(payload));
      }

      if (payload?.resultMessage) {
        setMatchEndStatus({
          isMatchOver: true,
          resultMessage: payload.resultMessage,
        });
      }

      setShowBatterModal(false);
      setShowBowlerModal(false);
      setShowSecondInningsModal(false);
    });
    socket.on("matchEnded", () => navigate(`/scoreboard/${matchId}`));
    socket.on("error", ({ message }) => alert("Error: " + message));

    return () => {
      socket.off("connect");
      socket.off("matchState");
      socket.off("innings_complete");
      socket.off("match_completed");
      socket.off("matchEnded");
      socket.off("error");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [matchId, navigate]); // re-run if matchId changes

  function recordDelivery(runs) {
    const socket = socketRef.current;
    if (!socket) {
      alert("Not connected to server");
      return;
    }
    if (!matchId) {
      alert("No match ID");
      return;
    }
    if (!match) {
      alert("Match not loaded");
      return;
    }
    if (matchEndStatus.isMatchOver) {
      return;
    }
    if (showSecondInningsModal) {
      alert("Please set second innings openers first");
      return;
    }
    if (showBowlerModal) {
      alert("Please select the new bowler first");
      return;
    }

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
        isWicket: isWicket,
        wicketType: isWicket ? wicketType : null,
        dismissedBatter: isWicket ? dismissedBatter : null,
        dismissedPlayerType: isWicket
          ? dismissedBatter === match?.nonStriker
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
        isWicket: isWicket,
        wicketType: isWicket ? wicketType : null,
        dismissedBatter: isWicket ? dismissedBatter : null,
        dismissedPlayerType: isWicket
          ? dismissedBatter === match?.nonStriker
            ? "nonStriker"
            : "striker"
          : null,
      };
    }

    console.log("Emitting delivery:", payload);
    socket.emit("delivery", payload);

    // Reset delivery modifier state
    setIsWicket(false);
    setWicketType("");
    setExtraType("");
    setDismissedBatter("");
  }

  function undoDelivery() {
    const socket = socketRef.current;
    if (!socket) {
      alert("Not connected to server");
      return;
    }
    socket.emit("undo_delivery", { matchId });
    // Reset delivery modifier state
    setIsWicket(false);
    setWicketType("");
    setExtraType("");
    setDismissedBatter("");
  }

  function confirmNewBowler() {
    if (!selectedNewBowler) {
      alert("Please select a bowler");
      return;
    }
    socketRef.current?.emit("setNewBowler", {
      matchId,
      bowler: selectedNewBowler,
    });
    setShowBowlerModal(false);
    setSelectedNewBowler("");
  }

  function confirmNewBatter() {
    if (!selectedNewBatter) {
      alert("Please select a batter");
      return;
    }
    socketRef.current?.emit("setNewBatter", {
      matchId,
      batter: selectedNewBatter,
    });
    setShowBatterModal(false);
    setSelectedNewBatter("");
  }

  function confirmSecondInningsOpeners() {
    if (
      !secondInningsStriker ||
      !secondInningsNonStriker ||
      !secondInningsBowler
    ) {
      alert("Please select striker, non-striker, and bowler");
      return;
    }
    if (secondInningsStriker === secondInningsNonStriker) {
      alert("Striker and non-striker must be different");
      return;
    }

    socketRef.current?.emit("setOpeners", {
      matchId,
      striker: secondInningsStriker,
      nonStriker: secondInningsNonStriker,
      bowler: secondInningsBowler,
    });

    setShowSecondInningsModal(false);
    setSecondInningsStriker("");
    setSecondInningsNonStriker("");
    setSecondInningsBowler("");
  }

  function handleExitUmpireMode() {
    sessionStorage.removeItem(UMPIRE_AUTH_KEY);
    navigate("/umpire/login", { replace: true });
  }

  if (!match) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[600px] items-center justify-center bg-slate-950 px-5 py-6 text-white">
        <p className="text-slate-400">Loading match...</p>
      </main>
    );
  }

  // These must be computed from match, not stored in useState:
  const totalRuns = match?.totalRuns ?? 0;
  const wickets = match?.wickets ?? 0;
  const ballsBowled = match?.ballsBowled ?? 0;
  const oversBowled = Math.floor(ballsBowled / 6);
  const ballsInOver = ballsBowled % 6;
  const runRate =
    ballsBowled > 0 ? ((totalRuns / ballsBowled) * 6).toFixed(2) : "0.00";
  const targetScore = match?.targetScore || null;
  const runsNeeded = targetScore ? Math.max(0, targetScore - totalRuns) : null;
  const ballsLeft = targetScore
    ? Math.max(0, (match?.totalOvers || 0) * 6 - ballsBowled)
    : null;
  const requiredRunRate = targetScore
    ? ballsLeft > 0
      ? ((runsNeeded * 6) / ballsLeft).toFixed(2)
      : runsNeeded > 0
        ? "-"
        : "0.00"
    : null;

  const currentOverBalls = buildCurrentOver(match?.timeline || []);
  const validBallsThisOver = currentOverBalls.filter(
    (b) => b.ball.isValidBall,
  ).length;

  // Compute stats
  const strikerStats = getBatterStat(match, match?.striker);
  const nonStrikerStats = getBatterStat(match, match?.nonStriker);
  const bowlerStats = getBowlerStat(match, match?.currentBowler);

  // Players for modals and wicket dropdown
  const bowlingTeamPlayers = (match.playerStats || []).filter(
    (p) => p.team === match.bowlingTeam,
  );
  const battingTeamActivePlayers = (match.playerStats || []).filter(
    (p) => p.team === match.battingTeam && !p.isOut,
  );
  const occupiedBatter =
    match?.striker === null ? match?.nonStriker : match?.striker;
  const newBatterOptions = battingTeamActivePlayers.filter(
    (p) => p.name !== occupiedBatter,
  );
  const battingTeamPlayers = (match.playerStats || []).filter(
    (p) => p.team === match.battingTeam,
  );
  const secondInningsStrikerOptions = battingTeamPlayers.filter(
    (p) => p.name !== secondInningsNonStriker,
  );
  const secondInningsNonStrikerOptions = battingTeamPlayers.filter(
    (p) => p.name !== secondInningsStriker,
  );
  const nextBatterRole =
    match?.nextBatterFor === "nonStriker" ? "Non-Striker" : "Striker";

  return (
    <main className="mx-auto min-h-screen w-full max-w-[600px] bg-slate-950 px-5 py-6 font-sans text-white">
      {/* Second Innings Openers Modal — shown when first innings ends */}
      {showSecondInningsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-800 p-6">
            <div className="mb-4 text-lg font-bold">
              Set Second Innings Openers
            </div>
            <select
              value={secondInningsStriker}
              onChange={(e) => {
                const nextStriker = e.target.value;
                setSecondInningsStriker(nextStriker);
                if (nextStriker && nextStriker === secondInningsNonStriker) {
                  setSecondInningsNonStriker("");
                }
              }}
              className="mb-3 w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-white/20 focus:ring"
            >
              <option value="">— Choose striker —</option>
              {secondInningsStrikerOptions.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={secondInningsNonStriker}
              onChange={(e) => {
                const nextNonStriker = e.target.value;
                setSecondInningsNonStriker(nextNonStriker);
                if (nextNonStriker && nextNonStriker === secondInningsStriker) {
                  setSecondInningsStriker("");
                }
              }}
              className="mb-3 w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-white/20 focus:ring"
            >
              <option value="">— Choose non-striker —</option>
              {secondInningsNonStrikerOptions.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={secondInningsBowler}
              onChange={(e) => setSecondInningsBowler(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-white/20 focus:ring"
            >
              <option value="">— Choose bowler —</option>
              {bowlingTeamPlayers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={confirmSecondInningsOpeners}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Start Second Innings
            </button>
          </div>
        </div>
      )}

      {/* New Bowler Modal — shown at end of each over */}
      {showBowlerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-800 p-6">
            <div className="mb-4 text-lg font-bold">Select New Bowler</div>
            <select
              value={selectedNewBowler}
              onChange={(e) => setSelectedNewBowler(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-white/20 focus:ring"
            >
              <option value="">— Choose bowler —</option>
              {bowlingTeamPlayers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={confirmNewBowler}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Confirm Bowler
            </button>
          </div>
        </div>
      )}

      {/* New Batter Modal — shown after a wicket */}
      {showBatterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-800 p-6">
            <div className="mb-4 text-lg font-bold">
              Select New {nextBatterRole}
            </div>
            <select
              value={selectedNewBatter}
              onChange={(e) => setSelectedNewBatter(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-white/20 focus:ring"
            >
              <option value="">
                — Choose {nextBatterRole.toLowerCase()} —
              </option>
              {newBatterOptions.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={confirmNewBatter}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Confirm Batter
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <span className="text-[22px] font-bold">Umpire Scorer</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExitUmpireMode}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Exit Umpire Mode
          </button>
          <Link to="/" className="text-xs text-slate-400 hover:text-slate-200">
            Home
          </Link>
          <Link
            to={`/scoreboard/${matchId}`}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Open Scoreboard
          </Link>
        </div>
      </div>

      {/* Scoreboard — driven from match state */}
      <div className="mb-4 rounded-2xl border border-white/15 bg-white/5 p-5">
        <div className="mb-1.5 text-xs tracking-wide text-slate-400">
          {match?.battingTeam?.toUpperCase() ?? "BATTING TEAM"}
        </div>
        <div className="text-[42px] leading-none font-extrabold tracking-tight">
          {totalRuns}/{wickets}
        </div>
        <div className="mt-1.5 text-sm text-slate-400">
          Ov: {oversBowled}.{ballsInOver} &nbsp;|&nbsp; RR: {runRate}
        </div>
        {targetScore && (
          <div className="mt-2 text-sm font-semibold text-indigo-200">
            Target: {targetScore} | Runs Req: {runsNeeded} | Balls Req:{" "}
            {ballsLeft} | RRR: {requiredRunRate}
          </div>
        )}
        {matchEndStatus.isMatchOver && (
          <div className="mt-2.5 rounded-lg border border-amber-400/50 bg-amber-500/20 px-2.5 py-2 text-sm font-semibold text-amber-200">
            {matchEndStatus.resultMessage}
          </div>
        )}
        <div className="mt-2.5 flex items-center gap-2 text-sm text-slate-400">
          🏏 {match?.striker ?? "Striker not set"} * &nbsp;|&nbsp;{" "}
          {match?.nonStriker ?? "Non-striker not set"}
          {match?.status === "live" && (
            <button
              type="button"
              onClick={() =>
                match.nonStriker &&
                socketRef.current?.emit("swapStriker", {
                  matchId,
                })
              }
              className="ml-2 rounded-md border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] text-slate-200"
            >
              Swap Striker
            </button>
          )}
        </div>
        <div className="mt-1.5 text-sm text-slate-400">
          🎳 {match?.currentBowler ?? "Bowler not set"}
        </div>
      </div>

      {/* Current Over */}
      <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="mb-2.5 text-[11px] tracking-wider text-slate-400 uppercase">
          This Over — {validBallsThisOver}/6
        </div>
        <div className="flex min-h-9 flex-wrap gap-2">
          {currentOverBalls.map((item, i) => (
            <div
              key={i}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${getBallToneClass(item.label)}`}
            >
              {item.label}
            </div>
          ))}
          {currentOverBalls.length === 0 && (
            <span className="text-sm leading-9 text-slate-500">
              No balls this over
            </span>
          )}
        </div>
      </div>

      {/* Batter Stats */}
      <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="mb-1.5 flex border-b border-white/10 pb-2 text-[11px] tracking-wider text-slate-400 uppercase">
          <span className="flex-[3]">BATTER</span>
          <span className="flex-1 text-right tabular-nums">R</span>
          <span className="flex-1 text-right tabular-nums">B</span>
          <span className="flex-1 text-right tabular-nums">4s</span>
          <span className="flex-1 text-right tabular-nums">6s</span>
          <span className="flex-1 text-right tabular-nums">SR</span>
        </div>
        <div className="flex items-center border-b border-white/5 px-1 py-2 text-sm">
          <span className="flex-[3] font-semibold">
            {match?.striker ?? "-"} *
          </span>
          <span className="flex-1 text-right tabular-nums">
            {strikerStats.runs}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {strikerStats.balls}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {strikerStats.fours}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {strikerStats.sixes}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {strikerStats.sr}
          </span>
        </div>
        <div className="flex items-center px-1 py-2 text-sm">
          <span className="flex-[3]">{match?.nonStriker ?? "-"}</span>
          <span className="flex-1 text-right tabular-nums">
            {nonStrikerStats.runs}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {nonStrikerStats.balls}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {nonStrikerStats.fours}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {nonStrikerStats.sixes}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {nonStrikerStats.sr}
          </span>
        </div>
      </div>

      {/* Bowler Stats */}
      <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="mb-1.5 flex border-b border-white/10 pb-2 text-[11px] tracking-wider text-slate-400 uppercase">
          <span className="flex-[3]">BOWLER</span>
          <span className="flex-1 text-right tabular-nums">OV</span>
          <span className="flex-1 text-right tabular-nums">W</span>
          <span className="flex-1 text-right tabular-nums">R</span>
          <span className="flex-1 text-right tabular-nums">ECO</span>
        </div>
        <div className="flex items-center px-1 py-2 text-sm">
          <span className="flex-[3] font-semibold">
            {match?.currentBowler ?? "-"}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {bowlerStats.overs}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {bowlerStats.wickets}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {bowlerStats.runs}
          </span>
          <span className="flex-1 text-right tabular-nums">
            {bowlerStats.economy}
          </span>
        </div>
      </div>

      {/* Record Delivery */}
      <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <div className="mb-3 text-[11px] tracking-wider text-slate-400 uppercase">
          Record Delivery
        </div>

        {/* Extra / Wicket toggles */}
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const next = extraType === "wide" ? "" : "wide";
              setExtraType(next);
              if (next === "wide") {
                setIsWicket(false);
                setWicketType("");
                setDismissedBatter("");
              }
            }}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              extraType === "wide"
                ? "border-amber-500 bg-amber-500/20 text-amber-400"
                : "border-white/20 bg-white/10 text-white"
            }`}
          >
            Wide
          </button>
          <button
            type="button"
            onClick={() =>
              setExtraType(extraType === "no-ball" ? "" : "no-ball")
            }
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              extraType === "no-ball"
                ? "border-amber-500 bg-amber-500/20 text-amber-400"
                : "border-white/20 bg-white/10 text-white"
            }`}
          >
            No Ball
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !isWicket;
              setIsWicket(next);
              if (!next) {
                setWicketType("");
                setDismissedBatter("");
              }
            }}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              isWicket
                ? "border-red-500 bg-red-500/20 text-red-400"
                : "border-white/20 bg-white/10 text-white"
            }`}
          >
            Wicket
          </button>
        </div>

        {/* Wicket detail selectors */}
        {isWicket && (
          <div className="mb-3">
            <select
              value={wicketType}
              onChange={(e) => setWicketType(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-white/20 focus:ring"
            >
              <option value="">— Wicket type —</option>
              {wicketTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={dismissedBatter}
              onChange={(e) => setDismissedBatter(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-white/20 focus:ring"
            >
              <option value="">— Dismissed batter —</option>
              {battingTeamActivePlayers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Run buttons */}
        <div className="flex flex-wrap gap-2.5">
          {runOptions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => recordDelivery(r)}
              className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-2xl font-bold text-white"
            >
              {getRunButtonLabel(r, extraType)}
            </button>
          ))}
        </div>

        {/* Undo button */}
        <button
          type="button"
          onClick={undoDelivery}
          disabled={!match?.timeline?.length}
          className="mt-3 w-full rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 disabled:cursor-not-allowed disabled:text-red-400/50"
        >
          Undo Last Ball
        </button>
      </div>
    </main>
  );
}

export default UmpireScorerPage;
