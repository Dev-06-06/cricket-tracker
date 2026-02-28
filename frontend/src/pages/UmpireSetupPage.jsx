import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createMatchSocket } from "../services/socket";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function UmpireSetupPage() {
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [players, setPlayers] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [team1Name, setTeam1Name] = useState("Team 1");
  const [team2Name, setTeam2Name] = useState("Team 2");
  const [team1Players, setTeam1Players] = useState([]);
  const [team2Players, setTeam2Players] = useState([]);
  const [totalOvers, setTotalOvers] = useState(20);
  const [customOvers, setCustomOvers] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/players`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setPlayers(data.players);
      })
      .catch(() => {});

    const socket = createMatchSocket();
    socketRef.current = socket;

    socket.on("matchCreated", ({ matchId }) => {
      navigate(`/umpire/toss/${matchId}`);
    });

    socket.on("matchError", ({ message }) => {
      setError(message);
    });

    return () => {
      socket.off("matchCreated");
      socket.off("matchError");
      socket.disconnect();
    };
  }, [navigate]);

  const addPlayer = async () => {
    const name = newPlayerName.trim();
    if (!name) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        setPlayers((prev) => [...prev, data.player]);
        setNewPlayerName("");
      }
    } catch {
      // ignore
    }
  };

  const handleDragStart = (event, playerId) => {
    event.dataTransfer.setData("playerId", playerId);
  };

  const dropToTeam = (event, teamNumber) => {
    event.preventDefault();
    const playerId = event.dataTransfer.getData("playerId");
    if (!playerId) return;

    if (teamNumber === 1) {
      if (!team1Players.includes(playerId)) {
        setTeam1Players((prev) => [...prev, playerId]);
        setTeam2Players((prev) => prev.filter((id) => id !== playerId));
      }
    } else {
      if (!team2Players.includes(playerId)) {
        setTeam2Players((prev) => [...prev, playerId]);
        setTeam1Players((prev) => prev.filter((id) => id !== playerId));
      }
    }
  };

  const dropToPool = (event) => {
    event.preventDefault();
    const playerId = event.dataTransfer.getData("playerId");
    if (!playerId) return;
    setTeam1Players((prev) => prev.filter((id) => id !== playerId));
    setTeam2Players((prev) => prev.filter((id) => id !== playerId));
  };

  const allowDrop = (event) => {
    event.preventDefault();
  };

  const confirmMatch = () => {
    setError("");
    if (!team1Name.trim() || !team2Name.trim()) {
      setError("Both team names are required.");
      return;
    }
    if (!socketRef.current) return;

    socketRef.current.emit("createMatch", {
      team1Name: team1Name.trim(),
      team2Name: team2Name.trim(),
      team1PlayerIds: team1Players,
      team2PlayerIds: team2Players,
      totalOvers,
    });
  };

  const poolPlayers = players.filter(
    (p) => !team1Players.includes(p._id) && !team2Players.includes(p._id),
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Match Setup</h1>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row">
        {/* Player Pool */}
        <section
          className="w-full rounded-xl border border-slate-200 bg-white p-4 lg:w-64 lg:shrink-0"
          onDrop={dropToPool}
          onDragOver={allowDrop}
        >
          <h2 className="text-lg font-semibold text-slate-900">Player Pool</h2>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
              placeholder="Player name"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/10 focus:ring"
            />
            <button
              type="button"
              onClick={addPlayer}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              +
            </button>
          </div>

          <ul className="mt-3 min-h-24 space-y-2">
            {poolPlayers.map((player) => (
              <li
                key={player._id}
                draggable
                onDragStart={(e) => handleDragStart(e, player._id)}
                className="cursor-grab rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm"
              >
                {player.name}
              </li>
            ))}
            {poolPlayers.length === 0 && (
              <li className="text-sm text-slate-400">No players available</li>
            )}
          </ul>
        </section>

        {/* Team Boxes */}
        <div className="flex flex-1 flex-col gap-6 sm:flex-row">
          <TeamBox
            label={team1Name}
            onLabelChange={setTeam1Name}
            playerIds={team1Players}
            players={players}
            onDrop={(e) => dropToTeam(e, 1)}
            onDragOver={allowDrop}
            onDragStart={handleDragStart}
          />
          <TeamBox
            label={team2Name}
            onLabelChange={setTeam2Name}
            playerIds={team2Players}
            players={players}
            onDrop={(e) => dropToTeam(e, 2)}
            onDragOver={allowDrop}
            onDragStart={handleDragStart}
          />
        </div>
      </div>

      {/* Overs Selector */}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Overs</h2>
        <div className="flex flex-wrap items-center gap-2">
          {[5, 10, 15, 20].map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                setTotalOvers(o);
                setCustomOvers("");
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                totalOvers === o && !customOvers
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700"
              }`}
            >
              {o}
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={customOvers}
            onChange={(e) => {
              setCustomOvers(e.target.value);
              const parsed = parseInt(e.target.value, 10);
              if (parsed > 0) setTotalOvers(parsed);
            }}
            placeholder="Custom"
            className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/10 focus:ring"
          />
        </div>
      </section>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={confirmMatch}
        className="mt-6 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white"
      >
        Confirm
      </button>
    </main>
  );
}

function TeamBox({ label, onLabelChange, playerIds, players, onDrop, onDragOver, onDragStart }) {
  const teamPlayers = players.filter((p) => playerIds.includes(p._id));

  return (
    <div
      className="flex-1 rounded-xl border-2 border-dashed border-slate-300 bg-white p-4"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <input
        type="text"
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none ring-slate-900/10 focus:ring"
      />
      <ul className="mt-3 min-h-24 space-y-2">
        {teamPlayers.map((player) => (
          <li
            key={player._id}
            draggable
            onDragStart={(e) => onDragStart(e, player._id)}
            className="cursor-grab rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          >
            {player.name}
          </li>
        ))}
        {teamPlayers.length === 0 && (
          <li className="text-sm text-slate-400">Drop players here</li>
        )}
      </ul>
    </div>
  );
}

export default UmpireSetupPage;
