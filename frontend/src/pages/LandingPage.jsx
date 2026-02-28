import { useNavigate } from "react-router-dom";

function LandingPage() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-4">
      <h1 className="text-4xl font-bold text-slate-900">Cricket Tracker</h1>
      <p className="text-slate-600">Select your role to continue.</p>
      <div className="flex gap-4">
        <button
          onClick={() => navigate("/view")}
          className="rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow hover:bg-blue-700"
        >
          VIEWER
        </button>
        <button
          onClick={() => navigate("/umpire")}
          className="rounded-xl bg-slate-900 px-8 py-4 text-lg font-semibold text-white shadow hover:bg-slate-800"
        >
          UMPIRE
        </button>
      </div>
    </main>
  );
}

export default LandingPage;
