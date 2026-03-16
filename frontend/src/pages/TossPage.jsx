import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import GroupChip from "../components/GroupChip";
import ProfileToolbarButton from "../components/ProfileToolbarButton";
import { createMatchSocket } from "../services/socket";

/* ═══════════════════════════════════════════════════════════════════════════════
   TossPage — correct cricket toss flow:
     Step 1a: Umpire selects WHICH team gets to call (any team can call)
     Step 1b: That team's captain picks HEADS or TAILS
     Step 1c: Other team automatically gets the opposite
     Step 1d: Umpire flips the coin
     Step 2:  Show result → winner picks BAT or BOWL
     Step 3:  Set openers
═══════════════════════════════════════════════════════════════════════════════ */

function PlayerAvatar({ player, size = "sm" }) {
  const [err, setErr] = useState(false);
  const sz =
    { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm" }[size] ??
    "h-8 w-8 text-xs";
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

function TeamAvatarStack({ players = [] }) {
  const shown = players.slice(0, 3);
  return (
    <div className="flex -space-x-2">
      {shown.map((p, i) => (
        <PlayerAvatar key={i} player={p} size="sm" />
      ))}
      {players.length > 3 && (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-[10px] font-bold text-slate-500 ring-2 ring-[#0d1117]">
          +{players.length - 3}
        </span>
      )}
    </div>
  );
}

export default function TossPage() {
  const { matchId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);

  /* ── original state (unchanged) ── */
  const [match, setMatch] = useState(null);
  const [tossWinner, setTossWinner] = useState("");
  const [tossChoice, setTossChoice] = useState("");
  const [tossConfirmed, setTossConfirmed] = useState(false);
  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");
  const [flipState, setFlipState] = useState("idle"); // "idle" | "flipping" | "done"
  const [coinTransform, setCoinTransform] = useState("rotateY(0deg)");

  /* ── NEW toss state ──
     callingTeam: "team1" | "team2" | ""   — which team the umpire gave the call to
     callingTeamSide: "HEADS" | "TAILS" | "" — what that team called
     flipResult: "HEADS" | "TAILS" | ""    — what the coin actually landed on
  ── */
  const [callingTeam, setCallingTeam] = useState(""); // umpire picks this
  const [callingTeamSide, setCallingTeamSide] = useState(""); // calling team picks this
  const [flipResult, setFlipResult] = useState("");

  /* ── derived ── */
  // The other team automatically gets the opposite side
  const otherTeamSide =
    callingTeamSide === "HEADS"
      ? "TAILS"
      : callingTeamSide === "TAILS"
        ? "HEADS"
        : "";
  const callingTeamName =
    callingTeam === "team1"
      ? match?.team1Name
      : callingTeam === "team2"
        ? match?.team2Name
        : "";
  const otherTeamName =
    callingTeam === "team1"
      ? match?.team2Name
      : callingTeam === "team2"
        ? match?.team1Name
        : "";

  /* ── sub-step within Step 1 ──
     "pick-team"  → umpire hasn't chosen calling team yet
     "pick-side"  → calling team chosen, now pick HEADS/TAILS
     "ready"      → both sides assigned, ready to flip
  ── */
  const subStep = !callingTeam
    ? "pick-team"
    : !callingTeamSide
      ? "pick-side"
      : "ready";

  /* ── original socket (unchanged) ── */
  useEffect(() => {
    if (!matchId) return;
    const socket = createMatchSocket(token);
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("joinMatch", { matchId }));
    socket.on("matchState", (updatedMatch) => {
      setMatch(updatedMatch);
      if (updatedMatch.striker) navigate(`/umpire/scorer/${matchId}`);
    });
    return () => {
      socket.off("connect");
      socket.off("matchState");
      socket.disconnect();
    };
  }, [matchId, navigate, token]);

  /* ── CORRECT flip logic ──
     callingTeam called `callingTeamSide`.
     Coin lands on `result`.
     If result === callingTeamSide → callingTeam wins, else otherTeam wins.
  ── */
  const handleCoinFlip = () => {
    if (flipState !== "idle" || !callingTeamSide) return;
    setFlipState("flipping");
    socketRef.current?.emit("toss_flip_started", { matchId });

    const result = Math.random() < 0.5 ? "HEADS" : "TAILS";
    const HEADS_ROTATION = "rotateY(1800deg)";
    const TAILS_ROTATION = "rotateY(1980deg)";

    setTimeout(() => {
      setCoinTransform(result === "HEADS" ? HEADS_ROTATION : TAILS_ROTATION);
      setFlipResult(result);
      const winner =
        result === callingTeamSide ? callingTeamName : otherTeamName;
      socketRef.current?.emit("toss_flip_result", { matchId, result, winner });
      setTossWinner(winner);
      setFlipState("done");
    }, 2200);
  };

  /* ── reset calling team / side ── */
  const resetCallingTeam = () => {
    setCallingTeam("");
    setCallingTeamSide("");
  };
  const resetCallingTeamSide = () => setCallingTeamSide("");

  /* ── original handlers (unchanged) ── */
  const confirmToss = () => {
    if (!tossWinner || !tossChoice || !socketRef.current) return;
    socketRef.current.emit("tossResult", { matchId, tossWinner, tossChoice });
    setTossConfirmed(true);
  };

  const confirmOpeners = () => {
    if (!striker || !nonStriker || !bowler || !socketRef.current) return;
    if (striker === nonStriker) return;
    socketRef.current.emit("setOpeners", {
      matchId,
      striker,
      nonStriker,
      bowler,
    });
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
          <p className="text-sm text-slate-500">Loading match…</p>
        </div>
      </main>
    );

  const isBattingTeam1 = match.battingTeam === match.team1Name;

  const rawBattingPlayers = isBattingTeam1
    ? (match.team1Players || [])
    : (match.team2Players || []);

  const rawBowlingPlayers = isBattingTeam1
    ? (match.team2Players || [])
    : (match.team1Players || []);

  const seenBat = new Set();
  const battingPlayers = rawBattingPlayers.filter(p => {
    if (seenBat.has(p.name)) return false;
    seenBat.add(p.name);
    return true;
  });

  const seenBowl = new Set();
  const bowlingPlayers = rawBowlingPlayers.filter(p => {
    if (seenBowl.has(p.name)) return false;
    seenBowl.add(p.name);
    return true;
  });

  const strikerOptions = battingPlayers.filter(
    p => p.name !== nonStriker
  );
  const nonStrikerOptions = battingPlayers.filter(
    p => p.name !== striker
  );

  const stepNum = tossConfirmed ? 3 : flipState === "done" ? 2 : 1;

  return (
    <div
      className="min-h-screen bg-[#0d1117] text-white"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        /* 3D coin */
        .coin-scene { perspective: 700px; }
        .coin {
          position: relative; width: 110px; height: 110px;
          transform-style: preserve-3d;
          transition: transform 2.2s cubic-bezier(0.33,1,0.68,1);
        }
        .coin-flipping { animation: coinArc 2.2s cubic-bezier(0.33,1,0.68,1) forwards; }
        @keyframes coinArc {
          0%   { transform: rotateY(0deg)    translateY(0px);  }
          15%  { transform: rotateY(270deg)  translateY(-30px);}
          40%  { transform: rotateY(720deg)  translateY(-70px);}
          65%  { transform: rotateY(1260deg) translateY(-40px);}
          85%  { transform: rotateY(1620deg) translateY(-10px);}
          100% { transform: rotateY(1800deg) translateY(0px);  }
        }
        .coin-face {
          position: absolute; inset: 0; border-radius: 9999px;
          backface-visibility: hidden;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 12px; letter-spacing: 0.08em;
        }
        .coin-heads {
          background: radial-gradient(circle at 38% 38%, #fde68a, #f59e0b 60%, #d97706);
          color: #78350f;
          box-shadow: 0 0 0 4px rgba(245,158,11,0.3), inset 0 2px 8px rgba(255,255,255,0.25);
        }
        .coin-tails {
          background: radial-gradient(circle at 38% 38%, #d97706, #92400e 60%, #78350f);
          color: #fef3c7; transform: rotateY(180deg);
          box-shadow: 0 0 0 4px rgba(180,83,9,0.3), inset 0 2px 8px rgba(255,255,255,0.1);
        }
        .coin-flipping .coin-heads,
        .coin-flipping .coin-tails {
          animation: glowPulse 0.35s linear infinite alternate;
        }
        @keyframes glowPulse {
          from { box-shadow: 0 0 0 4px rgba(245,158,11,0.2), 0 0 15px rgba(251,191,36,0.2); }
          to   { box-shadow: 0 0 0 4px rgba(245,158,11,0.5), 0 0 40px rgba(251,191,36,0.6); }
        }
        .pop-in { animation: popIn 0.4s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes popIn {
          from { transform: scale(0.65); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        .slide-up { animation: slideUp 0.3s ease-out; }
        @keyframes slideUp {
          from { transform: translateY(10px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        select option { background: #1e293b; color: white; }
      `}</style>

      {/* ══ STICKY HEADER ══ */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0d1117]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316]">
              <span className="text-[10px] font-black text-white">C</span>
            </div>
            <span className="text-sm font-black uppercase tracking-[0.15em] text-white">
              CricTrack
            </span>
          </Link>
          <span className="text-[11px] font-black uppercase tracking-widest text-[#f97316]">
            Toss
          </span>
          <div className="flex items-center gap-2">
            <ProfileToolbarButton />
            <GroupChip />
            <button
              type="button"
              onClick={() => navigate("/umpire")}
              className="btn-tap text-[11px] text-slate-600 hover:text-slate-300 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6 pb-16">
        {/* ══ STEP PROGRESS ══ */}
        <div className="mb-7 flex items-center">
          {[
            { n: 1, label: "Call" },
            { n: 2, label: "Result" },
            { n: 3, label: "Openers" },
          ].map(({ n, label }) => (
            <div
              key={n}
              className="flex items-center"
              style={{ flex: n < 3 ? "1" : "none" }}
            >
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition-all duration-300 ${
                    n < stepNum
                      ? "bg-[#f97316] text-white shadow-md shadow-orange-900/40"
                      : n === stepNum
                        ? "border-2 border-[#f97316] bg-[#f97316]/15 text-[#f97316]"
                        : "border border-slate-700 bg-slate-800/80 text-slate-600"
                  }`}
                >
                  {n < stepNum ? "✓" : n}
                </div>
                <span
                  className={`text-[9px] font-black uppercase tracking-widest ${
                    n === stepNum
                      ? "text-[#f97316]"
                      : n < stepNum
                        ? "text-slate-500"
                        : "text-slate-700"
                  }`}
                >
                  {label}
                </span>
              </div>
              {n < 3 && (
                <div
                  className={`mb-4 mx-2 h-0.5 flex-1 rounded-full transition-all duration-500 ${n < stepNum ? "bg-[#f97316]" : "bg-slate-800"}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════
            STEP 1 — CALL THE TOSS
            sub-steps: pick-team → pick-side → ready → flipping
        ══════════════════════════════════════ */}
        {!tossConfirmed && flipState !== "done" && (
          <div className="space-y-5 slide-up">
            <div>
              <h1 className="score-num text-4xl font-extrabold leading-none text-white">
                Call the Toss
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                {subStep === "pick-team" &&
                  "Umpire: choose which team calls the coin."}
                {subStep === "pick-side" &&
                  `${callingTeamName} captain: call your side.`}
                {subStep === "ready" && "Both sides set. Ready to flip!"}
                {flipState === "flipping" && "Coin in the air…"}
              </p>
            </div>

            {/* ── SUB-STEP A: Umpire picks calling team ── */}
            {subStep === "pick-team" && (
              <div className="space-y-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  Which team calls the toss?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      key: "team1",
                      name: match.team1Name,
                      players: match.team1Players || [],
                    },
                    {
                      key: "team2",
                      name: match.team2Name,
                      players: match.team2Players || [],
                    },
                  ].map(({ key, name, players }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCallingTeam(key)}
                      className="btn-tap group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 py-7 transition-all hover:border-[#f97316]/40 hover:bg-[#f97316]/5"
                    >
                      <TeamAvatarStack players={players} />
                      <div className="text-center">
                        <p className="score-num text-xl font-extrabold text-white group-hover:text-[#f97316] transition-colors">
                          {name}
                        </p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-600 group-hover:text-slate-400">
                          Calls the toss
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── SUB-STEP B: Calling team picks HEADS or TAILS ── */}
            {subStep === "pick-side" && (
              <div className="space-y-3 pop-in">
                {/* Calling team badge */}
                <div className="flex items-center gap-3 rounded-xl border border-[#f97316]/25 bg-[#f97316]/8 px-4 py-2.5">
                  <TeamAvatarStack
                    players={
                      callingTeam === "team1"
                        ? match.team1Players || []
                        : match.team2Players || []
                    }
                  />
                  <div>
                    <p className="text-xs font-black text-[#f97316]">
                      {callingTeamName}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      is calling the toss
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetCallingTeam}
                    className="btn-tap ml-auto text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    ← Change
                  </button>
                </div>

                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  {callingTeamName} captain calls…
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {["HEADS", "TAILS"].map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setCallingTeamSide(side)}
                      className="btn-tap group flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 py-8 transition-all hover:border-amber-500/40 hover:bg-amber-500/5"
                    >
                      <span className="text-5xl">
                        {side === "HEADS" ? "🟡" : "🔶"}
                      </span>
                      <div className="text-center">
                        <p className="score-num text-2xl font-extrabold text-white group-hover:text-amber-300 transition-colors">
                          {side}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          Tap to call
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── SUB-STEP C: Both sides confirmed + FLIP button ── */}
            {subStep === "ready" && flipState === "idle" && (
              <div className="space-y-4 pop-in">
                {/* Both team assignments */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Calling team */}
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-3 py-4 text-center">
                    <TeamAvatarStack
                      players={
                        callingTeam === "team1"
                          ? match.team1Players || []
                          : match.team2Players || []
                      }
                    />
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/70">
                      {callingTeamName}
                    </p>
                    <p className="score-num text-2xl font-extrabold text-amber-300">
                      {callingTeamSide}
                    </p>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-black text-amber-400">
                      Called ✓
                    </span>
                  </div>
                  {/* Other team */}
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-800/40 px-3 py-4 text-center">
                    <TeamAvatarStack
                      players={
                        callingTeam === "team1"
                          ? match.team2Players || []
                          : match.team1Players || []
                      }
                    />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {otherTeamName}
                    </p>
                    <p className="score-num text-2xl font-extrabold text-slate-400">
                      {otherTeamSide}
                    </p>
                    <span className="rounded-full bg-slate-700/50 px-2 py-0.5 text-[9px] font-black text-slate-500">
                      Auto-assigned
                    </span>
                  </div>
                </div>

                {/* Change mind links */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={resetCallingTeam}
                    className="btn-tap flex-1 rounded-xl border border-white/5 py-2 text-[11px] font-bold text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    ← Change team
                  </button>
                  <button
                    type="button"
                    onClick={resetCallingTeamSide}
                    className="btn-tap flex-1 rounded-xl border border-white/5 py-2 text-[11px] font-bold text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    ← Change call
                  </button>
                </div>

                {/* Coin preview */}
                <div className="flex justify-center py-2">
                  <div className="coin-scene">
                    <div className="coin" style={{ transform: coinTransform }}>
                      <div className="coin-face coin-heads">HEADS</div>
                      <div className="coin-face coin-tails">TAILS</div>
                    </div>
                  </div>
                </div>

                {/* FLIP button */}
                <button
                  type="button"
                  onClick={handleCoinFlip}
                  className="btn-tap w-full rounded-2xl bg-[#f97316] py-5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-900/40 hover:bg-orange-500 transition-all"
                >
                  🪙 Flip the Coin
                </button>
              </div>
            )}

            {/* ── FLIPPING indicator ── */}
            {flipState === "flipping" && (
              <div className="space-y-4 pop-in">
                <div className="flex justify-center py-2">
                  <div className="coin-scene">
                    <div className="coin coin-flipping">
                      <div className="coin-face coin-heads">HEADS</div>
                      <div className="coin-face coin-tails">TAILS</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                  <p className="text-sm font-black uppercase tracking-wider text-amber-400">
                    Coin in the air…
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════
            STEP 2 — RESULT + BAT/BOWL CHOICE
        ══════════════════════════════════════ */}
        {!tossConfirmed && flipState === "done" && (
          <div className="space-y-5 slide-up">
            <h1 className="score-num text-4xl font-extrabold leading-none text-white">
              Toss Result
            </h1>

            {/* Result hero */}
            <div className="pop-in rounded-2xl border border-white/8 bg-gradient-to-b from-slate-900 to-[#0d1117] p-6 text-center">
              {/* Frozen coin */}
              <div className="coin-scene mb-5 flex justify-center">
                <div className="coin" style={{ transform: coinTransform }}>
                  <div className="coin-face coin-heads">HEADS</div>
                  <div className="coin-face coin-tails">TAILS</div>
                </div>
              </div>

              {/* Result pill */}
              <span
                className={`mb-4 inline-block rounded-full border px-4 py-1 text-xs font-black uppercase tracking-widest ${
                  flipResult === "HEADS"
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                    : "border-indigo-500/40 bg-indigo-500/15 text-indigo-300"
                }`}
              >
                Coin landed on {flipResult}
              </span>

              {/* Winner */}
              <p className="score-num text-5xl font-extrabold leading-tight text-white">
                {tossWinner}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-400">
                won the toss
              </p>

              {/* Both teams' call outcome */}
              <div className="mt-5 flex justify-center gap-4">
                {[
                  {
                    name: callingTeamName,
                    side: callingTeamSide,
                    won: callingTeamSide === flipResult,
                  },
                  {
                    name: otherTeamName,
                    side: otherTeamSide,
                    won: otherTeamSide === flipResult,
                  },
                ].map(({ name, side, won }) => (
                  <div
                    key={name}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-4 py-2.5 ${
                      won
                        ? "border-emerald-500/30 bg-emerald-500/8"
                        : "border-red-900/30 bg-red-950/20"
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {name}
                    </span>
                    <span
                      className={`text-lg font-black ${won ? "text-emerald-400" : "text-red-500"}`}
                    >
                      {won ? "✓" : "✗"} {side}
                    </span>
                    <span
                      className={`text-[10px] font-bold ${won ? "text-emerald-500" : "text-red-700"}`}
                    >
                      {won ? "Won!" : "Lost"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* BAT / BOWL */}
            <div className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
                {tossWinner} chose to…
              </p>
              <div className="grid grid-cols-2 gap-3">
                {["BAT", "BOWL"].map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setTossChoice(choice)}
                    className={`btn-tap flex flex-col items-center gap-2.5 rounded-2xl border py-6 transition-all ${
                      tossChoice === choice
                        ? choice === "BAT"
                          ? "border-[#f97316]/60 bg-[#f97316]/12 text-[#f97316]"
                          : "border-indigo-500/60 bg-indigo-500/12 text-indigo-300"
                        : "border-white/8 bg-white/3 text-slate-500 hover:border-white/15 hover:text-slate-300"
                    }`}
                  >
                    <span className="text-4xl">
                      {choice === "BAT" ? "🏏" : "⚾"}
                    </span>
                    <span className="score-num text-2xl font-extrabold tracking-widest">
                      {choice}
                    </span>
                    {tossChoice === choice && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
                        Selected ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={confirmToss}
              disabled={!tossChoice}
              className="btn-tap w-full rounded-2xl bg-[#f97316] py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-900/30 hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40 transition-all"
            >
              Confirm Toss →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════
            STEP 3 — SET OPENERS
        ══════════════════════════════════════ */}
        {tossConfirmed && (
          <div className="space-y-5 slide-up">
            <div>
              <h1 className="score-num text-4xl font-extrabold leading-none text-white">
                Set Openers
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Choose the opening batters and first bowler.
              </p>
            </div>

            {/* Toss summary */}
            <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/4 px-4 py-3">
              <span className="text-xl">🏆</span>
              <p className="text-xs text-slate-400">
                <span className="font-black text-white">{tossWinner}</span> won
                the toss &amp; elected to{" "}
                <span
                  className={`font-black ${tossChoice === "BAT" ? "text-[#f97316]" : "text-indigo-400"}`}
                >
                  {tossChoice}
                </span>
              </p>
            </div>

            {/* Batting openers */}
            <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm">🏏</span>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
                  Batting — {match.battingTeam}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Striker <span className="text-[#f97316]">*</span>
                  </label>
                  <select
                    value={striker}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStriker(v);
                      if (v && v === nonStriker) setNonStriker("");
                    }}
                    className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#f97316] transition-all"
                  >
                    <option value="">— Select —</option>
                    {strikerOptions.map((p) => (
                      <option key={p.playerId || p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {striker && (
                    <div className="mt-2 flex items-center gap-2 pop-in">
                      <PlayerAvatar
                        player={battingPlayers.find((p) => p.name === striker)}
                        size="sm"
                      />
                      <div>
                        <p className="text-xs font-bold text-white">
                          {striker}
                        </p>
                        <p className="text-[10px] font-black text-[#f97316]">
                          ★ Striker
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Non-Striker
                  </label>
                  <select
                    value={nonStriker}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNonStriker(v);
                      if (v && v === striker) setStriker("");
                    }}
                    className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#f97316] transition-all"
                  >
                    <option value="">— Select —</option>
                    {nonStrikerOptions.map((p) => (
                      <option key={p.playerId || p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {nonStriker && (
                    <div className="mt-2 flex items-center gap-2 pop-in">
                      <PlayerAvatar
                        player={battingPlayers.find(
                          (p) => p.name === nonStriker,
                        )}
                        size="sm"
                      />
                      <div>
                        <p className="text-xs font-bold text-white">
                          {nonStriker}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500">
                          Non-Striker
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Bowling opener */}
            <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm">⚾</span>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400">
                  Bowling — {match.bowlingTeam}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Opening Bowler
                </label>
                <select
                  value={bowler}
                  onChange={(e) => setBowler(e.target.value)}
                  className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="">— Select —</option>
                  {bowlingPlayers.map((p) => (
                    <option key={p.playerId || p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {bowler && (
                  <div className="mt-2 flex items-center gap-2 pop-in">
                    <PlayerAvatar
                      player={bowlingPlayers.find((p) => p.name === bowler)}
                      size="sm"
                    />
                    <div>
                      <p className="text-xs font-bold text-white">{bowler}</p>
                      <p className="text-[10px] font-black text-indigo-400">
                        Opening Bowler
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Ready strip */}
            {striker && nonStriker && bowler && (
              <div className="pop-in flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  <p className="text-xs font-black text-emerald-400">
                    Ready to start!
                  </p>
                </div>
                <p className="text-[11px] text-slate-500">
                  {striker}
                  <span className="mx-0.5 text-[#f97316]">*</span>&amp;{" "}
                  {nonStriker} vs {bowler}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={confirmOpeners}
              disabled={
                !striker || !nonStriker || !bowler || striker === nonStriker
              }
              className="btn-tap w-full rounded-2xl bg-[#f97316] py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-900/30 hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40 transition-all"
            >
              🏏 Start the Match
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
