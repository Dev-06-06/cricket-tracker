import { useNavigate } from "react-router-dom";

function LandingPage() {
  const navigate = useNavigate();

  return (
    <main className="app-shell flex max-w-4xl flex-col items-center justify-center gap-6">
      <h1 className="text-center text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
        Cricket Tracker
      </h1>
      <p className="text-center text-slate-600">
        Select your role to continue.
      </p>
      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
        <button
          onClick={() => navigate("/view")}
          className="btn btn-primary w-full rounded-xl py-4 text-base"
        >
          VIEWER
        </button>
        <button
          onClick={() => navigate("/umpire")}
          className="btn btn-dark w-full rounded-xl py-4 text-base"
        >
          UMPIRE
        </button>
        <button
          onClick={() => navigate("/players")}
          className="btn w-full rounded-xl py-4 text-base"
        >
          PLAYERS
        </button>
      </div>
    </main>
  );
}

export default LandingPage;
