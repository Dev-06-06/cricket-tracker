import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createMatchSocket } from "../services/socket";

function TossPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [match, setMatch] = useState(null);
  const [tossWinner, setTossWinner] = useState("");
  const [tossChoice, setTossChoice] = useState("");
  const [tossConfirmed, setTossConfirmed] = useState(false);
  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");

  // Coin flip states
  const [flipState, setFlipState] = useState("idle"); // "idle" | "flipping" | "done"
  const [coinTransform, setCoinTransform] = useState("rotateY(0deg)");

  useEffect(() => {
    if (!matchId) {
      return;
    }

    const socket = createMatchSocket();
    socketRef.current = socket;

    socket.emit("joinMatch", { matchId });

    socket.on("matchState", (updatedMatch) => {
      setMatch(updatedMatch);
      if (updatedMatch.striker) {
        navigate(`/umpire/scorer/${matchId}`);
      }
    });

    return () => {
      socket.off("matchState");
      socket.disconnect();
    };
  }, [matchId, navigate]);

  const handleCoinFlip = () => {
    if (flipState !== "idle") return;
    setFlipState("flipping");

    const result = Math.random() < 0.5 ? "HEADS" : "TAILS";
    // 1800deg = 5 full rotations, lands on HEADS; 1980deg = 5.5 rotations, lands on TAILS
    const HEADS_ROTATION = "rotateY(1800deg)";
    const TAILS_ROTATION = "rotateY(1980deg)";

    setTimeout(() => {
      const finalTransform = result === "HEADS" ? HEADS_ROTATION : TAILS_ROTATION;
      setCoinTransform(finalTransform);
      const winner =
        result === "HEADS" ? match.team1Name : match.team2Name;
      setTossWinner(winner);
      setFlipState("done");
    }, 2000);
  };

  const confirmToss = () => {
    if (!tossWinner || !tossChoice || !socketRef.current) {
      return;
    }
    socketRef.current.emit("tossResult", { matchId, tossWinner, tossChoice });
    setTossConfirmed(true);
  };

  const confirmOpeners = () => {
    if (!striker || !nonStriker || !bowler || !socketRef.current) {
      return;
    }
    if (striker === nonStriker) {
      return;
    }
    socketRef.current.emit("setOpeners", {
      matchId,
      striker,
      nonStriker,
      bowler,
    });
  };

  if (!match) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10">
        <p className="text-slate-700">Loading match...</p>
      </main>
    );
  }

  const battingPlayers =
    match.playerStats?.filter((p) => p.team === match.battingTeam) ?? [];
  const bowlingPlayers =
    match.playerStats?.filter((p) => p.team === match.bowlingTeam) ?? [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Toss</h1>

      {!tossConfirmed ? (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
          {/* Step 1 & 2: Coin flip */}
          {flipState !== "done" && (
            <>
              <h2 className="text-lg font-semibold text-slate-900">
                Call the toss!
              </h2>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCoinFlip}
                  disabled={flipState === "flipping"}
                  className="rounded-lg px-4 py-2 text-sm font-medium border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
                >
                  {match.team1Name} called HEADS
                </button>
                <button
                  type="button"
                  onClick={handleCoinFlip}
                  disabled={flipState === "flipping"}
                  className="rounded-lg px-4 py-2 text-sm font-medium border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
                >
                  {match.team2Name} called TAILS
                </button>
              </div>

              {/* Coin element */}
              <div className="mt-6 flex justify-center" style={{ perspective: "600px" }}>
                <div
                  className={`coin${flipState === "flipping" ? " coin-flipping" : ""}`}
                  style={flipState !== "flipping" ? { transform: coinTransform } : undefined}
                >
                  <div
                    className="coin-face flex items-center justify-center bg-yellow-400 text-slate-900 font-bold text-sm"
                  >
                    HEADS
                  </div>
                  <div
                    className="coin-face coin-tails flex items-center justify-center bg-yellow-600 text-white font-bold text-sm"
                  >
                    TAILS
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Result + BAT/BOWL choice */}
          {flipState === "done" && (
            <>
              <p className="text-xl font-semibold text-slate-900 mb-4">
                {tossWinner} won the toss!
              </p>

              <div className="mb-6 flex justify-center" style={{ perspective: "600px" }}>
                <div
                  className="coin"
                  style={{ transform: coinTransform }}
                >
                  <div
                    className="coin-face flex items-center justify-center bg-yellow-400 text-slate-900 font-bold text-sm"
                  >
                    HEADS
                  </div>
                  <div
                    className="coin-face coin-tails flex items-center justify-center bg-yellow-600 text-white font-bold text-sm"
                  >
                    TAILS
                  </div>
                </div>
              </div>

              <h2 className="text-lg font-semibold text-slate-900">
                {tossWinner} elected to?
              </h2>
              <div className="mt-4 flex gap-3">
                {["BAT", "BOWL"].map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setTossChoice(choice)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium ${
                      tossChoice === choice
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={confirmToss}
                disabled={!tossChoice}
                className="mt-6 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white disabled:opacity-50"
              >
                Confirm Toss
              </button>
            </>
          )}
        </section>
      ) : (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Set Openers</h2>
          <p className="mt-1 text-sm text-slate-600">
            {match.battingTeam} batting | {match.bowlingTeam} bowling
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Striker
              </span>
              <select
                value={striker}
                onChange={(e) => setStriker(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring"
              >
                <option value="">Select</option>
                {battingPlayers.map((p) => (
                  <option key={p._id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Non-Striker
              </span>
              <select
                value={nonStriker}
                onChange={(e) => setNonStriker(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring"
              >
                <option value="">Select</option>
                {battingPlayers.map((p) => (
                  <option key={p._id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Bowler
              </span>
              <select
                value={bowler}
                onChange={(e) => setBowler(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring"
              >
                <option value="">Select</option>
                {bowlingPlayers.map((p) => (
                  <option key={p._id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={confirmOpeners}
            disabled={!striker || !nonStriker || !bowler || striker === nonStriker}
            className="mt-6 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white disabled:opacity-50"
          >
            Confirm Openers
          </button>
        </section>
      )}
    </main>
  );
}

export default TossPage;
