import { useState, useMemo } from "react";

export default function PlayerManagerTab({
  match,
  groupPlayers,
  onChange,
}) {
  const [activeSubTab, setActiveSubTab] = useState("roster");
  const [localReshuffles, setLocalReshuffles] = useState([]);

  const [newPlayerName, setNewPlayerName] = useState("");
  const [pendingAddPlayers, setPendingAddPlayers] = useState([]);

  const [pendingSetJokers, setPendingSetJokers] = useState([]);
  const [pendingDissolveJokers, setPendingDissolveJokers] = useState([]);
  const [dissolveTarget, setDissolveTarget] = useState(null);
  const [dissolvePermanentTeam, setDissolvePermanentTeam] = useState("");

  const effectiveTeamMap = useMemo(() => {
    const map = {};

    (match?.playerStats || []).forEach((player) => {
      map[player.name] = player.team;
    });

    localReshuffles.forEach((reshuffle) => {
      map[reshuffle.playerName] = reshuffle.toTeam;
    });

    return map;
  }, [match?.playerStats, localReshuffles]);

  const team1Players = useMemo(
    () =>
      (match?.playerStats || [])
        .filter((player) => effectiveTeamMap[player.name] === match?.team1Name)
        .filter(
          (player, index, arr) =>
            arr.findIndex((item) => item.name === player.name) === index
        ),
    [match?.playerStats, effectiveTeamMap, match?.team1Name]
  );

  const team2Players = useMemo(
    () =>
      (match?.playerStats || [])
        .filter((player) => effectiveTeamMap[player.name] === match?.team2Name)
        .filter(
          (player, index, arr) =>
            arr.findIndex((item) => item.name === player.name) === index
        ),
    [match?.playerStats, effectiveTeamMap, match?.team2Name]
  );

  const unassignedPoolPlayers = useMemo(() => {
    const inMatchNames = new Set((match?.playerStats || []).map((player) => player.name));
    const pendingNames = new Set(pendingAddPlayers.map((player) => player.name));

    return (groupPlayers || []).filter(
      (player) => !inMatchNames.has(player.name) && !pendingNames.has(player.name)
    );
  }, [groupPlayers, match?.playerStats, pendingAddPlayers]);

  const notifyChanges = (overrides = {}) => {
    onChange({
      reshuffles: overrides.reshuffles ?? localReshuffles,
      addPlayers: overrides.addPlayers ?? pendingAddPlayers,
      setJokers: overrides.setJokers ?? pendingSetJokers,
      dissolveJokers: overrides.dissolveJokers ?? pendingDissolveJokers,
    });
  };

  const handleReshuffle = (playerName, toTeam) => {
    const updated = localReshuffles.filter(
      (reshuffle) => reshuffle.playerName !== playerName
    );
    const originalTeam = (match?.playerStats || []).find(
      (player) => player.name === playerName
    )?.team;

    if (toTeam !== originalTeam) {
      updated.push({ playerName, toTeam });
    }

    setLocalReshuffles(updated);
    notifyChanges({ reshuffles: updated });
  };

  const handleSetJoker = (playerName) => {
    if (pendingSetJokers.includes(playerName)) return;

    const updated = [...pendingSetJokers, playerName];

    setPendingSetJokers(updated);
    notifyChanges({ setJokers: updated });
  };

  const handleDissolveJoker = () => {
    if (!dissolveTarget || !dissolvePermanentTeam) return;

    const updated = [
      ...pendingDissolveJokers,
      {
        playerName: dissolveTarget,
        permanentTeam: dissolvePermanentTeam,
      },
    ];

    setPendingDissolveJokers(updated);
    setDissolveTarget(null);
    setDissolvePermanentTeam("");
    notifyChanges({ dissolveJokers: updated });
  };

  const subTabs = [
    { key: "roster", label: "Roster" },
    { key: "add", label: "Add" },
    { key: "joker", label: "Joker" },
  ];

  const pendingCount =
    localReshuffles.length +
    pendingAddPlayers.length +
    pendingSetJokers.length +
    pendingDissolveJokers.length;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl border border-white/5 bg-white/3 p-1">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveSubTab(tab.key)}
            className={`flex-1 rounded-lg py-1.5 text-[11px] font-black uppercase tracking-widest transition-all ${activeSubTab === tab.key
              ? "bg-slate-700 text-white"
              : "text-slate-600 hover:text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-[#f97316]/20 bg-[#f97316]/5 px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f97316]" />
          <p className="text-[11px] text-[#f97316]">
            {pendingCount} pending change{pendingCount > 1 ? "s" : ""} · commits when you start next over
          </p>
        </div>
      )}

      {activeSubTab === "roster" && (
        <div className="space-y-4">
          {[
            {
              key: "team1",
              name: match?.team1Name,
              players: team1Players,
              accent: "text-indigo-400",
              border: "border-indigo-800/30",
              bg: "bg-indigo-900/10",
            },
            {
              key: "team2",
              name: match?.team2Name,
              players: team2Players,
              accent: "text-cyan-400",
              border: "border-cyan-800/30",
              bg: "bg-cyan-900/10",
            },
          ].map((team) => (
            <div key={team.key}>
              <p className={`mb-2 text-[10px] font-black uppercase tracking-widest ${team.accent}`}>
                {team.name} · {team.players.length} players
              </p>
              <div className="space-y-1.5">
                {team.players.map((player) => {
                  const isReshuffled = localReshuffles.some(
                    (reshuffle) => reshuffle.playerName === player.name
                  );
                  const otherTeamName = team.key === "team1"
                    ? match?.team2Name
                    : match?.team1Name;

                  return (
                    <div
                      key={player.name}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${team.border} ${team.bg} ${isReshuffled
                        ? "border-[#f97316]/30 bg-[#f97316]/5"
                        : ""
                      }`}
                    >
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-300">
                        {player.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white">
                          {player.name}
                          {player.isJoker && (
                            <span className="ml-1 text-amber-400">🃏</span>
                          )}
                          {isReshuffled && (
                            <span className="ml-1 text-[10px] text-[#f97316]">
                              → moved
                            </span>
                          )}
                        </p>
                        {player.didBat && (
                          <p className="text-[10px] text-slate-600">
                            {player.batting?.runs ?? 0}({player.batting?.balls ?? 0})
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleReshuffle(
                            player.name,
                            isReshuffled
                              ? player.team
                              : otherTeamName
                          )
                        }
                        className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-widest transition-all ${isReshuffled
                          ? "border-[#f97316]/40 bg-[#f97316]/10 text-[#f97316]"
                          : "border-white/10 bg-white/5 text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {isReshuffled ? "↩ Undo" : `→ ${otherTeamName}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSubTab === "add" && (
        <div className="space-y-4">

          {/* From pool */}
          {unassignedPoolPlayers.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-2">
                From group pool
              </p>
              <div className="space-y-1.5">
                {unassignedPoolPlayers.map((p) => (
                  <div
                    key={p._id}
                    className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 rounded-full bg-slate-700 items-center justify-center text-xs font-bold text-slate-300">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <p className="flex-1 text-sm font-medium text-white truncate">
                      {p.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const toAdd = {
                          name: p.name,
                          photoUrl: p.photoUrl || "",
                          fromPool: true,
                          playerId: p._id,
                          toTeam: "team1",
                        };
                        const updated = [...pendingAddPlayers, toAdd];
                        setPendingAddPlayers(updated);
                        notifyChanges({ addPlayers: updated });
                      }}
                      className="rounded-lg border border-indigo-600/40 bg-indigo-600/20 px-2 py-1 text-[9px] font-bold text-indigo-400 hover:bg-indigo-600/35 transition-colors"
                    >
                      T1
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const toAdd = {
                          name: p.name,
                          photoUrl: p.photoUrl || "",
                          fromPool: true,
                          playerId: p._id,
                          toTeam: "team2",
                        };
                        const updated = [...pendingAddPlayers, toAdd];
                        setPendingAddPlayers(updated);
                        notifyChanges({ addPlayers: updated });
                      }}
                      className="rounded-lg border border-cyan-600/40 bg-cyan-600/20 px-2 py-1 text-[9px] font-bold text-cyan-400 hover:bg-cyan-600/35 transition-colors"
                    >
                      T2
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New player */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-2">
              New player
            </p>
            <div className="flex gap-2">
              <input
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPlayerName.trim()) {
                    const toAdd = {
                      name: newPlayerName.trim(),
                      photoUrl: "",
                      fromPool: false,
                      playerId: null,
                      toTeam: "team1",
                    };
                    const updated = [...pendingAddPlayers, toAdd];
                    setPendingAddPlayers(updated);
                    setNewPlayerName("");
                    notifyChanges({ addPlayers: updated });
                  }
                }}
                placeholder="Player name"
                className="flex-1 rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#f97316] transition-all"
              />
              <button
                type="button"
                disabled={!newPlayerName.trim()}
                onClick={() => {
                  if (!newPlayerName.trim()) return;
                  const toAdd = {
                    name: newPlayerName.trim(),
                    photoUrl: "",
                    fromPool: false,
                    playerId: null,
                    toTeam: "team1",
                  };
                  const updated = [...pendingAddPlayers, toAdd];
                  setPendingAddPlayers(updated);
                  setNewPlayerName("");
                  notifyChanges({ addPlayers: updated });
                }}
                className="shrink-0 rounded-lg border border-indigo-600/40 bg-indigo-600/20 px-2.5 py-2.5 text-[9px] font-bold text-indigo-400 hover:bg-indigo-600/35 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                T1
              </button>
              <button
                type="button"
                disabled={!newPlayerName.trim()}
                onClick={() => {
                  if (!newPlayerName.trim()) return;
                  const toAdd = {
                    name: newPlayerName.trim(),
                    photoUrl: "",
                    fromPool: false,
                    playerId: null,
                    toTeam: "team2",
                  };
                  const updated = [...pendingAddPlayers, toAdd];
                  setPendingAddPlayers(updated);
                  setNewPlayerName("");
                  notifyChanges({ addPlayers: updated });
                }}
                className="shrink-0 rounded-lg border border-cyan-600/40 bg-cyan-600/20 px-2.5 py-2.5 text-[9px] font-bold text-cyan-400 hover:bg-cyan-600/35 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                T2
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-700">
              T1 = {match?.team1Name} · T2 = {match?.team2Name}
            </p>
          </div>

          {/* Pending */}
          {pendingAddPlayers.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-2">
                Pending ({pendingAddPlayers.length})
              </p>
              <div className="space-y-1.5">
                {pendingAddPlayers.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl border border-[#f97316]/15 bg-[#f97316]/5 px-3 py-2"
                  >
                    <p className="flex-1 text-xs font-bold text-white">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      → {p.toTeam === "team1"
                        ? match?.team1Name
                        : match?.team2Name}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = pendingAddPlayers
                          .filter((_, idx) => idx !== i);
                        setPendingAddPlayers(updated);
                        notifyChanges({ addPlayers: updated });
                      }}
                      className="text-[11px] text-red-600 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {activeSubTab === "joker" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-2.5">
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-amber-500/70">
              What is a Joker?
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              A joker bats and bowls for both teams. They have separate stats per team but career stats are merged into one record.
            </p>
          </div>

          {(match?.playerStats || [])
            .filter((player) => player.isJoker)
            .filter(
              (player, index, arr) =>
                arr.findIndex((item) => item.name === player.name) === index
            )
            .map((player) => {
              const isDissolvePending = pendingDissolveJokers.some(
                (joker) => joker.playerName === player.name
              );

              return (
                <div
                  key={player.name}
                  className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🃏</span>
                      <p className="text-sm font-bold text-white">
                        {player.name}
                      </p>
                    </div>
                    {!isDissolvePending ? (
                      <button
                        type="button"
                        onClick={() => setDissolveTarget(player.name)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all hover:text-white"
                      >
                        Dissolve
                      </button>
                    ) : (
                      <span className="text-[10px] text-[#f97316]">
                        Pending dissolution
                      </span>
                    )}
                  </div>

                  {dissolveTarget === player.name && (
                    <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                      <p className="text-[11px] text-slate-500">
                        Which team does {player.name} permanently join?
                      </p>
                      <div className="flex gap-2">
                        {[
                          { key: "team1", name: match?.team1Name },
                          { key: "team2", name: match?.team2Name },
                        ].map((team) => (
                          <button
                            key={team.key}
                            type="button"
                            onClick={() => setDissolvePermanentTeam(team.key)}
                            className={`flex-1 rounded-xl border py-2 text-xs font-black uppercase tracking-widest transition-all ${dissolvePermanentTeam === team.key
                              ? "border-[#f97316]/50 bg-[#f97316]/10 text-[#f97316]"
                              : "border-white/8 bg-white/3 text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            {team.name}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDissolveTarget(null);
                            setDissolvePermanentTeam("");
                          }}
                          className="flex-1 rounded-xl border border-white/8 bg-white/3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDissolveJoker}
                          disabled={!dissolvePermanentTeam}
                          className="flex-1 rounded-xl border border-amber-500/40 bg-amber-500/10 py-2 text-xs font-black uppercase tracking-widest text-amber-300 transition-all disabled:opacity-40"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
              Designate a joker
            </p>
            <div className="space-y-1.5">
              {(match?.playerStats || [])
                .filter((player) => !player.isJoker)
                .filter(
                  (player, index, arr) =>
                    arr.findIndex((item) => item.name === player.name) === index
                )
                .filter((player) => !pendingSetJokers.includes(player.name))
                .map((player) => (
                  <div
                    key={player.name}
                    className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2"
                  >
                    <p className="flex-1 text-xs font-bold text-white">
                      {player.name}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {player.team === "team1" ? match?.team1Name : match?.team2Name}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleSetJoker(player.name)}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400 transition-all hover:border-amber-400/50"
                    >
                      Make Joker
                    </button>
                  </div>
                ))}
            </div>

            {pendingSetJokers.length > 0 && (
              <div className="mt-2 space-y-1">
                {pendingSetJokers.map((name) => (
                  <div
                    key={name}
                    className="flex items-center gap-2 rounded-xl border border-[#f97316]/15 bg-[#f97316]/5 px-3 py-2"
                  >
                    <span className="text-sm">🃏</span>
                    <p className="flex-1 text-xs font-bold text-white">
                      {name}
                    </p>
                    <span className="text-[10px] text-[#f97316]">
                      Pending
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
