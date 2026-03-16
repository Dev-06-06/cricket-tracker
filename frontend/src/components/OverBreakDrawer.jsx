import { useState, useMemo, useEffect, useRef } from "react";
import BottomSheet from "./BottomSheet";
import BottomSheetOption from "./BottomSheetOption";
import PlayerManagerTab from "./PlayerManagerTab";

export default function OverBreakDrawer({
  isOpen,
  match,
  groupPlayers,
  onCommit,
  onClose,
  onSelectBatter,
}) {
  const [selectedBowler, setSelectedBowler] = useState("");
  const [selectedBatter, setSelectedBatter] = useState("");
  const [pendingOvers, setPendingOvers] = useState(
    match?.totalOvers ?? 5
  );
  const [activeSection, setActiveSection] = useState("bowler");
  const [teamChanges, setTeamChanges] = useState({
    reshuffles: [],
    addPlayers: [],
    setJokers: [],
    dissolveJokers: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);

  const bowlingTeamPlayers = useMemo(() => {
    if (!match?.playerStats) return [];

    const seen = new Set();

    return (match.playerStats || []).filter((player) => {
      // p.team is a name string from socket
      if (player.team !== match.bowlingTeam) return false;
      // RISK: isBenched undefined treated as false
      if (player.isBenched === true) return false;
      if (seen.has(player.name)) return false;

      seen.add(player.name);
      return true;
    });
  }, [match?.playerStats, match?.bowlingTeam]);

  const completedOvers = Math.floor((match?.ballsBowled ?? 0) / 6);
  const oversFloor = completedOvers + 1;
  const currentTotalOvers = match?.totalOvers ?? 5;

  const needsBatter =
    match?.nextBatterFor === "striker" ||
    match?.nextBatterFor === "nonStriker";

  useEffect(() => {
    if (isOpen) {
      setPendingOvers(match?.totalOvers ?? 5);
      setSelectedBowler("");
      setSelectedBatter("");
      setActiveSection(needsBatter ? "batter" : "bowler");
      setTeamChanges({
        reshuffles: [],
        addPlayers: [],
        setJokers: [],
        dissolveJokers: [],
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && needsBatter) {
      setActiveSection("batter");
    }
  }, [isOpen, needsBatter]);

  useEffect(() => {
    if (!isOpen) return;

    setIsSubmitting(false);
  }, [isOpen]);

  const oversValid = pendingOvers >= oversFloor;
  const teamChangesCount =
    teamChanges.reshuffles.length +
    teamChanges.addPlayers.length +
    teamChanges.setJokers.length +
    teamChanges.dissolveJokers.length;

  const canStartOver = selectedBowler.length > 0 &&
    oversValid &&
    (!needsBatter || selectedBatter.length > 0);

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartXRef.current === null) return;

    const deltaX = e.changedTouches[0].clientX -
      touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY -
      (touchStartYRef.current || 0);

    if (Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (Math.abs(deltaX) < 50) return;

    const visibleSections = needsBatter
      ? ["batter", "bowler", "overs", "teams"]
      : ["bowler", "overs", "teams"];

    const currentIndex = visibleSections.indexOf(activeSection);
    if (currentIndex === -1) return;

    if (deltaX < 0) {
      const nextIndex = Math.min(
        currentIndex + 1,
        visibleSections.length - 1
      );
      setActiveSection(visibleSections[nextIndex]);
    } else {
      const prevIndex = Math.max(currentIndex - 1, 0);
      setActiveSection(visibleSections[prevIndex]);
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const handleCommit = async () => {
    if (!canStartOver) return;

    if (needsBatter && selectedBatter && onSelectBatter) {
      onSelectBatter(selectedBatter);
    }

    const payload = {
      newBowler: selectedBowler,
      newTotalOvers: pendingOvers !== currentTotalOvers
        ? pendingOvers
        : null,
      addPlayers: teamChanges.addPlayers.length > 0
        ? teamChanges.addPlayers
        : null,
      reshuffles: teamChanges.reshuffles.length > 0
        ? teamChanges.reshuffles
        : null,
      setJokers: teamChanges.setJokers.length > 0
        ? teamChanges.setJokers
        : null,
      dissolveJokers: teamChanges.dissolveJokers.length > 0
        ? teamChanges.dissolveJokers
        : null,
    };

    try {
      setIsSubmitting(true);
      await onCommit(payload);
      onClose?.();
      setSelectedBowler("");
      setSelectedBatter("");
      setPendingOvers(match?.totalOvers ?? 5);
      setTeamChanges({
        reshuffles: [],
        addPlayers: [],
        setJokers: [],
        dissolveJokers: [],
      });
      setActiveSection("bowler");
    } finally {
      setIsSubmitting(false);
    }
  };

  const sections = [
    { key: "bowler", label: "Bowler", required: true },
    { key: "overs", label: "Overs" },
    { key: "teams", label: "Teams" },
  ];

  const visibleSections = needsBatter
    ? [
      { key: "batter", label: "New Batter", required: true },
      ...sections,
    ]
    : sections;

  const quickOvers = [...new Set([
    oversFloor,
    oversFloor + 1,
    oversFloor + 2,
    oversFloor + 5,
    oversFloor + 10,
    oversFloor + 15,
  ])];

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={() => {}}
      title="Over Break"
      disableClose={true}
      height="full"
    >
      <div className="mb-4 flex gap-1 rounded-xl border border-white/5 bg-white/3 p-1">
        {visibleSections.map((section) => {
          const isSectionComplete =
            section.key === "batter"
              ? selectedBatter.length > 0
              : section.key === "bowler"
                ? selectedBowler.length > 0
                : true;

          return (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveSection(section.key)}
            className={`flex-1 rounded-lg py-2 text-[11px] font-black uppercase tracking-widest transition-all ${activeSection === section.key
              ? "bg-[#f97316] text-white"
              : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {section.label}
            {section.required && !isSectionComplete && (
              <span className="ml-1 text-red-400">*</span>
            )}
            {section.required && isSectionComplete && (
              <span className="ml-1 text-emerald-400">✓</span>
            )}
            {section.key === "teams" && teamChangesCount > 0 && (
              <span className="ml-1 rounded-full bg-[#f97316] px-1 text-[8px] text-white">
                {teamChangesCount}
              </span>
            )}
          </button>
          );
        })}
      </div>

      {(() => {
        const visibleSections = needsBatter
          ? ["batter", "bowler", "overs", "teams"]
          : ["bowler", "overs", "teams"];
        const currentIndex = visibleSections.indexOf(activeSection);
        return (
          <div className="flex items-center justify-center gap-1.5 -mt-1 mb-1">
            {visibleSections.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSection(s)}
                className={`rounded-full transition-all ${
                  i === currentIndex
                    ? "h-1.5 w-4 bg-[#f97316]"
                    : "h-1.5 w-1.5 bg-white/20 hover:bg-white/40"
                }`}
              />
            ))}
          </div>
        );
      })()}

      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full transition-opacity duration-150"
        key={activeSection}
      >
      {activeSection === "batter" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5">
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-red-400">
              Wicket - Select New Batter
            </p>
            <p className="text-[11px] text-slate-500">
              {match?.nextBatterFor === "striker"
                ? "Striker needs replacement"
                : "Non-striker needs replacement"}
            </p>
          </div>

          <div className="space-y-2">
            {(() => {
              const seen = new Set();
              const options = (match?.playerStats || [])
                .filter((p) => {
                  if (p.team !== match?.battingTeam) return false;
                  if (p.isOut) return false;
                  if (p.name === match?.currentStriker) return false;
                  if (p.name === match?.currentNonStriker) return false;
                  if (seen.has(p.name)) return false;
                  seen.add(p.name);
                  return true;
                })
                .sort((a, b) => {
                  if (a.isBenched && !b.isBenched) return -1;
                  if (!a.isBenched && b.isBenched) return 1;
                  return 0;
                });

              if (options.length === 0) {
                return (
                  <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-600">
                    No batters available - innings will end
                  </div>
                );
              }

              return options.map((p) => (
                <BottomSheetOption
                  key={p.name}
                  label={p.name}
                  photoUrl={p.photoUrl}
                  sublabel={
                    p.isBenched
                      ? `${p.batting?.runs ?? 0}(${p.batting?.balls ?? 0}) - returning`
                      : p.didBat
                        ? `${p.batting?.runs ?? 0}(${p.batting?.balls ?? 0})`
                        : "Yet to bat"
                  }
                  badge={p.isBenched ? "↩ Return" : undefined}
                  badgeColor={p.isBenched ? "text-amber-400" : undefined}
                  selected={selectedBatter === p.name}
                  onClick={() => setSelectedBatter(p.name)}
                />
              ));
            })()}
          </div>
        </div>
      )}

      {activeSection === "bowler" && (
        <div className="space-y-2">
          <p className="mb-3 text-[11px] text-slate-500">
            Select the bowler for over {completedOvers + 1}
          </p>
          {bowlingTeamPlayers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-600">
              No bowling team players found
            </div>
          ) : (
            bowlingTeamPlayers.map((player) => (
              <BottomSheetOption
                key={player.name}
                label={player.name}
                photoUrl={player.photoUrl}
                sublabel={
                  (player.bowling?.balls ?? 0) > 0
                    ? `${Math.floor(player.bowling.balls / 6)}.${player.bowling.balls % 6} ov ${player.bowling.wickets ?? 0}/${player.bowling.runs ?? 0}`
                    : "Yet to bowl"
                }
                selected={selectedBowler === player.name}
                onClick={() => setSelectedBowler(player.name)}
              />
            ))
          )}
        </div>
      )}

      {activeSection === "overs" && (
        <div className="space-y-4">

          {/* Info row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-white/5 bg-white/3 
              px-2 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest 
                text-slate-600 mb-1">
                Completed
              </p>
              <p className="text-2xl font-extrabold text-slate-400"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {completedOvers}
              </p>
            </div>
            <div className={`rounded-xl border px-2 py-3
              ${pendingOvers !== currentTotalOvers
                ? "border-[#f97316]/30 bg-[#f97316]/8"
                : "border-white/5 bg-white/3"
              }`}>
              <p className="text-[9px] font-black uppercase tracking-widest 
                text-slate-600 mb-1">
                Total
              </p>
              <p className={`text-2xl font-extrabold
                ${pendingOvers !== currentTotalOvers
                  ? "text-[#f97316]"
                  : "text-white"
                }`}
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {pendingOvers}
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/3 
              px-2 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest 
                text-slate-600 mb-1">
                Remaining
              </p>
              <p className="text-2xl font-extrabold text-slate-400"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {Math.max(0, pendingOvers - completedOvers)}
              </p>
            </div>
          </div>

          {/* +/− toggle — single tap to change */}
          <div className="flex items-center justify-between gap-4 
            rounded-2xl border border-white/8 bg-white/4 px-6 py-5">

            <button
              type="button"
              onClick={() => 
                setPendingOvers(v => Math.max(oversFloor, v - 1))}
              disabled={pendingOvers <= oversFloor}
              className="flex h-14 w-14 items-center justify-center 
                rounded-full border border-white/15 bg-white/8 
                text-3xl font-black text-white transition-all 
                hover:bg-white/15 active:scale-90
                disabled:opacity-25 disabled:cursor-not-allowed"
            >
              −
            </button>

            <div className="text-center">
              <p className="text-6xl font-extrabold leading-none"
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  color: pendingOvers !== currentTotalOvers
                    ? "#f97316" : "white"
                }}>
                {pendingOvers}
              </p>
              <p className="text-[10px] uppercase tracking-widest 
                text-slate-600 mt-1">
                overs
              </p>
              {pendingOvers !== currentTotalOvers && (
                <p className="text-[10px] text-slate-600 mt-0.5">
                  was {currentTotalOvers}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setPendingOvers(v => v + 1)}
              className="flex h-14 w-14 items-center justify-center 
                rounded-full border border-white/15 bg-white/8 
                text-3xl font-black text-white transition-all 
                hover:bg-white/15 active:scale-90"
            >
              +
            </button>
          </div>

          {/* Feedback */}
          <div className={`rounded-xl border px-3 py-2.5 text-center
            ${pendingOvers < oversFloor
              ? "border-red-500/20 bg-red-500/8"
              : pendingOvers !== currentTotalOvers
                ? "border-[#f97316]/15 bg-[#f97316]/5"
              : "border-white/5 bg-white/3"
            }`}>
            {pendingOvers < oversFloor ? (
              <p className="text-[11px] text-red-400">
                ⚠ Minimum {oversFloor} overs 
                ({completedOvers} already completed)
              </p>
            ) : pendingOvers !== currentTotalOvers ? (
              <p className="text-[11px] text-[#f97316]">
                {currentTotalOvers} → {pendingOvers} overs · 
                saves when you tap Start Next Over
              </p>
            ) : (
              <p className="text-[11px] text-slate-600">
                Tap − or + to adjust total overs
              </p>
            )}
          </div>

        </div>
      )}

      {activeSection === "teams" && (
        <PlayerManagerTab
          match={match}
          groupPlayers={groupPlayers}
          onChange={setTeamChanges}
        />
      )}

      </div>

      <div className="mt-6 space-y-2">
        {!selectedBowler && (
          <p className="text-center text-[11px] text-red-400">
            Select a bowler to start the next over
          </p>
        )}
        <button
          type="button"
          onClick={handleCommit}
          disabled={!canStartOver || isSubmitting}
          className="w-full rounded-2xl bg-[#f97316] py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-orange-900/30 transition-all hover:bg-orange-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting
            ? "Starting..."
            : selectedBowler
              ? `▶ Start Over ${completedOvers + 1}`
              : "Select Bowler First"}
        </button>
      </div>
    </BottomSheet>
  );
}