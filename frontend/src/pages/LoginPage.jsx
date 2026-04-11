import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { loginUser } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = location.state?.from?.pathname || "/view";
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isDemoFilled, setIsDemoFilled] = useState(false);

  useEffect(() => {
    if (searchParams.get("demo") === "1") {
      setEmail("demo@crictrack.in");
      setPassword("Demo@1234");
      setIsDemoFilled(true);
    }
  }, []);

  const fillDemo = () => {
    setEmail("demo@crictrack.in");
    setPassword("Demo@1234");
    setIsDemoFilled(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    try {
      setSubmitting(true);
      const response = await loginUser({ email: email.trim(), password });
      login(response.token, response.user);
      navigate(from, { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to login");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-[#0d1117] px-4 py-10 text-white"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800;900&display=swap');
        .score-num { font-family: 'Barlow Condensed', sans-serif; }
      `}</style>

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <section className="w-full rounded-2xl border border-white/8 bg-slate-900/60 p-6 shadow-2xl shadow-black/30">

          {/* Logo — navigates to landing */}
          <div className="flex justify-center mb-6">
            <button
              onClick={() => navigate("/")}
              style={{ all: "unset", cursor: "pointer" }}
            >
              <div className="flex items-center gap-2">
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "#f97316",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 900, color: "#0d1117" }}>
                    C
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#fff",
                  }}
                >
                  CricTrack
                </span>
              </div>
            </button>
          </div>

          {/* Demo banner — clickable if not yet filled */}
          {!isDemoFilled ? (
            <button
              type="button"
              onClick={fillDemo}
              className="w-full mb-5 rounded-xl border border-[#f97316]/25 bg-[#f97316]/05 px-4 py-3 text-left transition-all hover:border-[#f97316]/50 hover:bg-[#f97316]/10"
            >
              <p className="text-xs font-black uppercase tracking-widest text-[#f97316]/60 mb-1">
                🎮 Try Demo
              </p>
              <p className="text-xs text-slate-600">
                Tap to auto-fill demo credentials
              </p>
            </button>
          ) : (
            <div className="mb-5 rounded-xl border border-[#f97316]/30 bg-[#f97316]/08 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-widest text-[#f97316] mb-1">
                🎮 Demo Account
              </p>
              <p className="text-xs text-slate-400">
                Credentials auto-filled — tap Login to explore CricTrack.
              </p>
            </div>
          )}

          <div className="mb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#f97316]">
              CricTrack Access
            </p>
            <h1 className="score-num mt-2 text-4xl font-extrabold uppercase tracking-wide text-white">
              Login
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Continue scoring and tracking your matches.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#f97316] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="text-right mt-1">
              <Link
                to="/reset-password"
                className="text-xs text-slate-500 hover:text-[#f97316] transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl border border-[#f97316]/40 bg-[#f97316] px-4 py-2.5 text-sm font-black uppercase tracking-widest text-[#0d1117] transition-all hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Logging in..." : "Login"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-400">
            New here?{" "}
            <Link
              to="/register"
              className="font-semibold text-[#f97316] hover:text-orange-300"
            >
              Create account
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}