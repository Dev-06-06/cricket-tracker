import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createMatch } from "../services/api";

const initialForm = {
  battingTeam: "",
  bowlingTeam: "",
  currentStriker: "",
  currentNonStriker: "",
  currentBowler: "",
};

function HomePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [viewerMatchId, setViewerMatchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await createMatch(form);
      navigate(`/scorer/${response.match._id}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewerJoin = (event) => {
    event.preventDefault();
    const normalizedMatchId = viewerMatchId.trim();

    if (!normalizedMatchId) {
      return;
    }

    navigate(`/scoreboard/${normalizedMatchId}`);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Cricket Tracker</h1>
      <p className="mt-2 text-slate-600">
        Create a match and start live scoring.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-4 rounded-xl bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <InputField
            label="Batting Team"
            name="battingTeam"
            value={form.battingTeam}
            onChange={handleChange}
          />
          <InputField
            label="Bowling Team"
            name="bowlingTeam"
            value={form.bowlingTeam}
            onChange={handleChange}
          />
          <InputField
            label="Striker"
            name="currentStriker"
            value={form.currentStriker}
            onChange={handleChange}
          />
          <InputField
            label="Non-Striker"
            name="currentNonStriker"
            value={form.currentNonStriker}
            onChange={handleChange}
          />
          <InputField
            label="Bowler"
            name="currentBowler"
            value={form.currentBowler}
            onChange={handleChange}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create Match"}
        </button>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Join as Viewer</h2>
        <p className="mt-1 text-sm text-slate-600">
          Enter an existing match ID to open the live scoreboard.
        </p>

        <form
          onSubmit={handleViewerJoin}
          className="mt-4 flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="text"
            value={viewerMatchId}
            onChange={(event) => setViewerMatchId(event.target.value)}
            placeholder="Enter match ID"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring"
          />
          <button
            type="submit"
            disabled={!viewerMatchId.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            Open Scoreboard
          </button>
        </form>
      </section>
    </main>
  );
}

function InputField({ label, name, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input
        required
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-slate-900/10 focus:ring"
      />
    </label>
  );
}

export default HomePage;
