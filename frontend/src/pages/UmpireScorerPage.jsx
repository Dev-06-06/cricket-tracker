import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createMatchSocket } from "../services/socket";

const runOptions = [0, 1, 2, 3, 4, 6];
const wicketTypes = ['bowled', 'caught', 'lbw', 'run-out', 'stumped', 'hit-wicket'];

const s = {
  page: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#fff',
    padding: '20px',
    maxWidth: '600px',
    margin: '0 auto',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
  },
  scoreCard: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '16px',
  },
  scoreMain: {
    fontSize: '42px',
    fontWeight: 800,
    letterSpacing: '-1px',
    lineHeight: 1,
  },
  scoreMeta: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.5)',
    marginTop: '6px',
  },
  overBall: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  runBtn: {
    width: '64px',
    height: '64px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: '22px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  statsCard: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    padding: '12px 16px',
    marginBottom: '12px',
  },
  statsHeader: {
    display: 'flex',
    color: 'rgba(255,255,255,0.4)',
    fontSize: '11px',
    letterSpacing: '1px',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    marginBottom: '6px',
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 4px',
    fontSize: '14px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  statCol: {
    flex: 1,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    fontSize: '14px',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1e293b',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '16px',
    padding: '24px',
    width: '320px',
    maxWidth: '90vw',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 700,
    marginBottom: '16px',
  },
  toggleBtn: {
    padding: '10px 16px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  toggleBtnActive: {
    padding: '10px 16px',
    borderRadius: '10px',
    border: '1px solid #f59e0b',
    background: 'rgba(245,158,11,0.2)',
    color: '#f59e0b',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  wicketBtnActive: {
    padding: '10px 16px',
    borderRadius: '10px',
    border: '1px solid #ef4444',
    background: 'rgba(239,68,68,0.2)',
    color: '#ef4444',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  modalSelect: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: '#0f172a',
    color: '#fff',
    fontSize: '14px',
    marginBottom: '12px',
    boxSizing: 'border-box',
  },
  confirmBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '4px',
    boxSizing: 'border-box',
  },
  cancelBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
    boxSizing: 'border-box',
  },
};

function getBallLabel(ball) {
  if (ball.isWicket) return 'W';
  if (ball.extras?.type === 'wide') {
    const extra = (ball.extras.runs || 1) - 1;
    return extra > 0 ? `Wd+${extra}` : 'Wd';
  }
  if (ball.extras?.type === 'noBall') {
    return ball.runs > 0 ? `Nb+${ball.runs}` : 'Nb';
  }
  if (ball.extras?.type === 'bye') {
    return `B${ball.extras.runs || 0}`;
  }
  return String(ball.runs ?? 0);
}

function getBallColor(label) {
  if (label === 'W') return '#7f1d1d';
  if (label === '4') return '#1e3a5f';
  if (label === '6') return '#1a3a1a';
  if (label.startsWith('Wd') || label.startsWith('Nb')) return '#3b2a00';
  if (label.startsWith('B')) return '#1f2937';
  return 'rgba(255,255,255,0.1)';
}

function buildCurrentOver(timeline) {
  if (!timeline || timeline.length === 0) return [];

  let validCount = 0;
  let currentOverBalls = [];

  for (const ball of timeline) {
    const label = getBallLabel(ball);
    currentOverBalls.push({ label, ball });

    if (ball.isValidBall === true) {
      validCount++;
      if (validCount % 6 === 0) {
        currentOverBalls = []; // reset for new over
      }
    }
  }

  return currentOverBalls;
}

function getBatterStat(match, name) {
  if (!match || !name) return { runs: 0, balls: 0, fours: 0, sixes: 0, sr: '-' };
  const p = match.playerStats?.find(x => x.name === name);
  if (!p) return { runs: 0, balls: 0, fours: 0, sixes: 0, sr: '-' };
  const sr = p.batting?.balls > 0
    ? ((p.batting.runs / p.batting.balls) * 100).toFixed(1)
    : '-';
  return {
    runs: p.batting?.runs ?? 0,
    balls: p.batting?.balls ?? 0,
    fours: p.batting?.fours ?? 0,
    sixes: p.batting?.sixes ?? 0,
    sr,
  };
}

function getBowlerStat(match, name) {
  if (!match || !name) return { overs: '0.0', wickets: 0, runs: 0, economy: '-' };
  const p = match.playerStats?.find(x => x.name === name);
  if (!p) return { overs: '0.0', wickets: 0, runs: 0, economy: '-' };
  const fullOvers = Math.floor((p.bowling?.balls ?? 0) / 6);
  const rem = (p.bowling?.balls ?? 0) % 6;
  const economy = (p.bowling?.balls ?? 0) > 0
    ? ((p.bowling.runs / (p.bowling.balls / 6))).toFixed(1)
    : '-';
  return {
    overs: `${fullOvers}.${rem}`,
    wickets: p.bowling?.wickets ?? 0,
    runs: p.bowling?.runs ?? 0,
    economy,
  };
}

function getRunButtonLabel(runs, currentExtraType) {
  if (currentExtraType === 'wide') return runs === 0 ? 'Wd' : `+${runs}`;
  return String(runs);
}

function UmpireScorerPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const socketRef = useRef(null);
  const prevBallsBowledRef = useRef(null);

  const [match, setMatch] = useState(null);

  // Delivery modifier state
  const [isWicket, setIsWicket] = useState(false);
  const [wicketType, setWicketType] = useState('');
  const [extraType, setExtraType] = useState(''); // 'wide' | 'no-ball' | ''
  const [dismissedBatter, setDismissedBatter] = useState('');

  // Modal state
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  const [selectedNewBowler, setSelectedNewBowler] = useState('');
  const [showBatterModal, setShowBatterModal] = useState(false);
  const [selectedNewBatter, setSelectedNewBatter] = useState('');

  // Create socket and attach listeners; re-run when matchId changes
  useEffect(() => {
    const socket = createMatchSocket();
    socketRef.current = socket;

    socket.emit('joinMatch', { matchId });

    socket.on('matchState', (updatedMatch) => {
      const curr = updatedMatch.ballsBowled ?? 0;
      const prev = prevBallsBowledRef.current;

      // Detect end of over: valid balls transitioned to a non-zero multiple of 6 during live play
      if (prev !== null && curr !== prev && curr > 0 && curr % 6 === 0 && updatedMatch.status === 'live') {
        setShowBowlerModal(true);
        setSelectedNewBowler('');
      }
      prevBallsBowledRef.current = curr;

      setMatch({ ...updatedMatch }); // spread to force new object reference

      // Auto-show new batter modal after a wicket during live play
      if (updatedMatch.status === 'live' && !updatedMatch.striker) {
        setShowBatterModal(true);
        setSelectedNewBatter('');
      }
    });

    socket.on('match_completed', () => navigate(`/scoreboard/${matchId}`));
    socket.on('matchEnded', () => navigate(`/scoreboard/${matchId}`));
    socket.on('error', ({ message }) => alert('Error: ' + message));

    return () => {
      socket.off('matchState');
      socket.off('match_completed');
      socket.off('matchEnded');
      socket.off('error');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [matchId, navigate]); // re-run if matchId changes

  function recordDelivery(runs) {
    const socket = socketRef.current;
    if (!socket) { alert('Not connected to server'); return; }
    if (!matchId) { alert('No match ID'); return; }
    if (!match) { alert('Match not loaded'); return; }
    if (showBowlerModal) { alert('Please select the new bowler first'); return; }

    let payload;
    if (extraType === 'wide') {
      payload = {
        matchId,
        runs: 0,
        extraType: 'wide',
        extraRuns: 1 + Number(runs),
        isWicket: false,
        wicketType: null,
        dismissedBatter: null,
      };
    } else if (extraType === 'no-ball') {
      payload = {
        matchId,
        runs: Number(runs),
        extraType: 'no-ball',
        extraRuns: 1,
        isWicket: isWicket,
        wicketType: isWicket ? wicketType : null,
        dismissedBatter: isWicket ? dismissedBatter : null,
      };
    } else {
      payload = {
        matchId,
        runs: Number(runs),
        extraType: null,
        extraRuns: 0,
        isWicket: isWicket,
        wicketType: isWicket ? wicketType : null,
        dismissedBatter: isWicket ? dismissedBatter : null,
      };
    }

    console.log('Emitting delivery:', payload);
    socket.emit('delivery', payload);

    // Reset delivery modifier state
    setIsWicket(false);
    setWicketType('');
    setExtraType('');
    setDismissedBatter('');
  }

  function undoDelivery() {
    const socket = socketRef.current;
    if (!socket) { alert('Not connected to server'); return; }
    socket.emit('undo_delivery', { matchId });
    // Reset delivery modifier state
    setIsWicket(false);
    setWicketType('');
    setExtraType('');
    setDismissedBatter('');
  }

  function confirmNewBowler() {
    if (!selectedNewBowler) { alert('Please select a bowler'); return; }
    socketRef.current?.emit('setNewBowler', { matchId, bowler: selectedNewBowler });
    setShowBowlerModal(false);
    setSelectedNewBowler('');
  }

  function confirmNewBatter() {
    if (!selectedNewBatter) { alert('Please select a batter'); return; }
    socketRef.current?.emit('setNewBatter', { matchId, batter: selectedNewBatter });
    setShowBatterModal(false);
    setSelectedNewBatter('');
  }

  if (!match) {
    return (
      <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading match...</p>
      </div>
    );
  }

  // These must be computed from match, not stored in useState:
  const totalRuns = match?.totalRuns ?? 0;
  const wickets = match?.wickets ?? 0;
  const ballsBowled = match?.ballsBowled ?? 0;
  const oversBowled = Math.floor(ballsBowled / 6);
  const ballsInOver = ballsBowled % 6;
  const runRate = ballsBowled > 0
    ? ((totalRuns / ballsBowled) * 6).toFixed(2)
    : '0.00';

  const currentOverBalls = buildCurrentOver(match?.timeline || []);
  const validBallsThisOver = currentOverBalls.filter(b => b.ball.isValidBall).length;

  // Compute stats
  const strikerStats = getBatterStat(match, match?.striker);
  const nonStrikerStats = getBatterStat(match, match?.nonStriker);
  const bowlerStats = getBowlerStat(match, match?.currentBowler);

  // Players for modals and wicket dropdown
  const bowlingTeamPlayers = (match.playerStats || []).filter(p => p.team === match.bowlingTeam);
  const battingTeamActivePlayers = (match.playerStats || []).filter(p => p.team === match.battingTeam && !p.isOut);
  const newBatterOptions = battingTeamActivePlayers.filter(p => p.name !== match.nonStriker);

  return (
    <div style={s.page}>
      {/* New Bowler Modal — shown at end of each over */}
      {showBowlerModal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalTitle}>Select New Bowler</div>
            <select
              value={selectedNewBowler}
              onChange={e => setSelectedNewBowler(e.target.value)}
              style={s.modalSelect}
            >
              <option value="">— Choose bowler —</option>
              {bowlingTeamPlayers.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
            <button onClick={confirmNewBowler} style={s.confirmBtn}>Confirm Bowler</button>
          </div>
        </div>
      )}

      {/* New Batter Modal — shown after a wicket */}
      {showBatterModal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalTitle}>Select New Batter</div>
            <select
              value={selectedNewBatter}
              onChange={e => setSelectedNewBatter(e.target.value)}
              style={s.modalSelect}
            >
              <option value="">— Choose batter —</option>
              {newBatterOptions.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
            <button onClick={confirmNewBatter} style={s.confirmBtn}>Confirm Batter</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={s.header}>
        <span style={s.title}>Umpire Scorer</span>
        <Link
          to={`/scoreboard/${matchId}`}
          style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', textDecoration: 'none' }}
        >
          Open Scoreboard
        </Link>
      </div>

      {/* Scoreboard — driven from match state */}
      <div style={s.scoreCard}>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '6px', letterSpacing: '0.5px' }}>
          {match?.battingTeam?.toUpperCase() ?? 'BATTING TEAM'}
        </div>
        <div style={s.scoreMain}>
          {totalRuns}/{wickets}
        </div>
        <div style={s.scoreMeta}>
          Ov: {oversBowled}.{ballsInOver} &nbsp;|&nbsp; RR: {runRate}
        </div>
        <div style={{ ...s.scoreMeta, marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🏏 {match?.striker ?? 'Striker not set'} * &nbsp;|&nbsp; {match?.nonStriker ?? 'Non-striker not set'}
          {match?.status === 'live' && (
            <button
              onClick={() => match.nonStriker && socketRef.current?.emit('setNewBatter', { matchId, batter: match.nonStriker })}
              style={{
                marginLeft: '8px',
                padding: '3px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Swap Striker
            </button>
          )}
        </div>
        <div style={s.scoreMeta}>
          🎳 {match?.currentBowler ?? 'Bowler not set'}
        </div>
      </div>

      {/* Current Over */}
      <div style={s.statsCard}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', letterSpacing: '1px', marginBottom: '10px', textTransform: 'uppercase' }}>
          This Over — {validBallsThisOver}/6
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minHeight: '36px' }}>
          {currentOverBalls.map((item, i) => (
            <div
              key={i}
              style={{ ...s.overBall, background: getBallColor(item.label) }}
            >
              {item.label}
            </div>
          ))}
          {currentOverBalls.length === 0 && (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', lineHeight: '36px' }}>
              No balls this over
            </span>
          )}
        </div>
      </div>

      {/* Batter Stats */}
      <div style={s.statsCard}>
        <div style={s.statsHeader}>
          <span style={{ flex: 3 }}>BATTER</span>
          <span style={s.statCol}>R</span>
          <span style={s.statCol}>B</span>
          <span style={s.statCol}>4s</span>
          <span style={s.statCol}>6s</span>
          <span style={s.statCol}>SR</span>
        </div>
        <div style={s.statsRow}>
          <span style={{ flex: 3, fontWeight: 600 }}>{match?.striker ?? '-'} *</span>
          <span style={s.statCol}>{strikerStats.runs}</span>
          <span style={s.statCol}>{strikerStats.balls}</span>
          <span style={s.statCol}>{strikerStats.fours}</span>
          <span style={s.statCol}>{strikerStats.sixes}</span>
          <span style={s.statCol}>{strikerStats.sr}</span>
        </div>
        <div style={{ ...s.statsRow, borderBottom: 'none' }}>
          <span style={{ flex: 3 }}>{match?.nonStriker ?? '-'}</span>
          <span style={s.statCol}>{nonStrikerStats.runs}</span>
          <span style={s.statCol}>{nonStrikerStats.balls}</span>
          <span style={s.statCol}>{nonStrikerStats.fours}</span>
          <span style={s.statCol}>{nonStrikerStats.sixes}</span>
          <span style={s.statCol}>{nonStrikerStats.sr}</span>
        </div>
      </div>

      {/* Bowler Stats */}
      <div style={s.statsCard}>
        <div style={s.statsHeader}>
          <span style={{ flex: 3 }}>BOWLER</span>
          <span style={s.statCol}>OV</span>
          <span style={s.statCol}>W</span>
          <span style={s.statCol}>R</span>
          <span style={s.statCol}>ECO</span>
        </div>
        <div style={{ ...s.statsRow, borderBottom: 'none' }}>
          <span style={{ flex: 3, fontWeight: 600 }}>{match?.currentBowler ?? '-'}</span>
          <span style={s.statCol}>{bowlerStats.overs}</span>
          <span style={s.statCol}>{bowlerStats.wickets}</span>
          <span style={s.statCol}>{bowlerStats.runs}</span>
          <span style={s.statCol}>{bowlerStats.economy}</span>
        </div>
      </div>

      {/* Record Delivery */}
      <div style={s.statsCard}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', letterSpacing: '1px', marginBottom: '12px', textTransform: 'uppercase' }}>
          Record Delivery
        </div>

        {/* Extra / Wicket toggles */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              const next = extraType === 'wide' ? '' : 'wide';
              setExtraType(next);
              if (next === 'wide') { setIsWicket(false); setWicketType(''); setDismissedBatter(''); }
            }}
            style={extraType === 'wide' ? s.toggleBtnActive : s.toggleBtn}
          >
            Wide
          </button>
          <button
            type="button"
            onClick={() => setExtraType(extraType === 'no-ball' ? '' : 'no-ball')}
            style={extraType === 'no-ball' ? s.toggleBtnActive : s.toggleBtn}
          >
            No Ball
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !isWicket;
              setIsWicket(next);
              if (!next) { setWicketType(''); setDismissedBatter(''); }
            }}
            style={isWicket ? s.wicketBtnActive : s.toggleBtn}
          >
            Wicket
          </button>
        </div>

        {/* Wicket detail selectors */}
        {isWicket && (
          <div style={{ marginBottom: '12px' }}>
            <select
              value={wicketType}
              onChange={e => setWicketType(e.target.value)}
              style={s.modalSelect}
            >
              <option value="">— Wicket type —</option>
              {wicketTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={dismissedBatter}
              onChange={e => setDismissedBatter(e.target.value)}
              style={{ ...s.modalSelect, marginBottom: 0 }}
            >
              <option value="">— Dismissed batter —</option>
              {battingTeamActivePlayers.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Run buttons */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {runOptions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => recordDelivery(r)}
              style={s.runBtn}
            >
              {getRunButtonLabel(r, extraType)}
            </button>
          ))}
        </div>

        {/* Undo button */}
        <button
          type="button"
          onClick={undoDelivery}
          disabled={!match?.timeline?.length}
          style={{
            ...s.statsCard,
            marginTop: '12px',
            marginBottom: 0,
            width: '100%',
            padding: '12px',
            border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.1)',
            color: !match?.timeline?.length ? 'rgba(255,255,255,0.3)' : '#ef4444',
            fontSize: '14px',
            fontWeight: 600,
            cursor: !match?.timeline?.length ? 'not-allowed' : 'pointer',
            textAlign: 'center',
          }}
        >
          Undo Last Ball
        </button>
      </div>
    </div>
  );
}

export default UmpireScorerPage;
