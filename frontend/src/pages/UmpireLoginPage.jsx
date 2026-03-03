import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const UMPIRE_PIN = "71845";
const UMPIRE_AUTH_KEY = "umpireModeUnlocked";

function UmpireLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);

  const fromPath = location.state?.from;
  const redirectTo =
    typeof fromPath === "string" && fromPath.startsWith("/umpire")
      ? fromPath
      : "/umpire";

  useEffect(() => {
    if (sessionStorage.getItem(UMPIRE_AUTH_KEY) === "true") {
      navigate("/umpire", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin !== UMPIRE_PIN) {
      setError("Incorrect PIN. Try again.");
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      setPin("");
      return;
    }
    sessionStorage.setItem(UMPIRE_AUTH_KEY, "true");
    navigate(redirectTo, { replace: true });
  };

  const handlePadPress = (val) => {
    if (error) setError("");
    if (val === "del") {
      setPin((prev) => prev.slice(0, -1));
    } else if (pin.length < 5) {
      setPin((prev) => prev + val);
    }
  };

  const PAD = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "del"],
  ];

  return (
    <div
      className="min-h-screen bg-[#0d1117] text-white flex flex-col"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800&display=swap');
        .score-num { font-family: 'Barlow Condensed', sans-serif; }
        .btn-tap { transition: transform 0.08s, opacity 0.1s; }
        .btn-tap:active { transform: scale(0.92); opacity: 0.8; }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }
        .shake { animation: shake 0.45s cubic-bezier(.36,.07,.19,.97); }
        @keyframes dotPop {
          0%   { transform: scale(0.6); opacity: 0.3; }
          60%  { transform: scale(1.25); }
          100% { transform: scale(1); opacity: 1; }
        }
        .dot-pop { animation: dotPop 0.2s cubic-bezier(.36,.07,.19,.97) forwards; }
      `}</style>

      {/* ══ TOP NAV ══ */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0d1117]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-sm items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316]">
              <span className="text-[10px] font-black text-white">C</span>
            </div>
            <span className="text-sm font-black uppercase tracking-[0.15em] text-white">
              CricTrack
            </span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-widest text-[#f97316]">
            Umpire Mode
          </span>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="btn-tap text-[11px] font-medium text-slate-600 hover:text-slate-300 transition-colors"
          >
            ← Home
          </button>
        </div>
      </header>

      {/* ══ BODY ══ */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-xs space-y-7">

          {/* ── Icon + Title ── */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#f97316]/30 bg-[#f97316]/10 shadow-lg shadow-orange-900/20">
              <span className="text-3xl">🏏</span>
            </div>
            <div className="text-center">
              <h1 className="score-num text-4xl font-extrabold leading-none text-white">
                Umpire Login
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Enter your 5-digit PIN to continue
              </p>
            </div>
          </div>

          {/* ── PIN dots ── */}
          <div className={`flex justify-center gap-3 ${shaking ? "shake" : ""}`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl font-black transition-all duration-150 ${
                  i < pin.length
                    ? "border-[#f97316]/60 bg-[#f97316]/15 text-[#f97316] dot-pop"
                    : "border-white/8 bg-white/5 text-transparent"
                }`}
              >
                {i < pin.length ? "●" : "○"}
              </span>
            ))}
          </div>

          {/* ── Error banner ── */}
          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-2.5">
              <span className="text-sm">⚠️</span>
              <p className="text-sm font-semibold text-red-400">{error}</p>
            </div>
          ) : (
            <div className="h-[42px]" /> /* placeholder so layout doesn't shift */
          )}

          {/* ── Numpad ── */}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-2.5">
              {PAD.flat().map((key, idx) => {
                if (key === "") {
                  return <div key={idx} />;
                }
                if (key === "del") {
                  return (
                    <button
                      key="del"
                      type="button"
                      onClick={() => handlePadPress("del")}
                      className="btn-tap flex h-14 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-800/60 text-lg font-black text-slate-400 transition-all hover:border-slate-600 hover:bg-slate-700/60"
                    >
                      ⌫
                    </button>
                  );
                }
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePadPress(key)}
                    className="btn-tap flex h-14 items-center justify-center rounded-2xl border border-white/8 bg-white/5 text-xl font-black text-white transition-all hover:border-white/15 hover:bg-white/10"
                  >
                    {key}
                  </button>
                );
              })}
            </div>

            {/* ── Submit button ── */}
            <button
              type="submit"
              disabled={pin.length !== 5}
              className="btn-tap mt-4 w-full rounded-2xl bg-[#f97316] py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-900/30 transition-all hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {pin.length === 5 ? "🔓 Enter Umpire Mode" : `${5 - pin.length} digit${5 - pin.length !== 1 ? "s" : ""} remaining`}
            </button>
          </form>

          {/* ── Footer hint ── */}
          <p className="text-center text-[11px] text-slate-700">
            Umpire access only · Unauthorized use prohibited
          </p>
        </div>
      </main>
    </div>
  );
}

export { UMPIRE_AUTH_KEY };
export default UmpireLoginPage;