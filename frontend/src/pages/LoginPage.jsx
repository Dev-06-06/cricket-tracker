import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginUser } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/view";
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }

    try {
      setSubmitting(true);
      const response = await loginUser({
        email: email.trim(),
        password,
      });

      login(response.token);
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
                onChange={(event) => setEmail(event.target.value)}
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
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
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
