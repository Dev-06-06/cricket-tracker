import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getPlayers } from "../services/api";

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return value.toFixed(digits);
}

function battingAverage(batting) {
  const innings = Number(batting?.innings) || 0;
  const notOuts = Number(batting?.notOuts) || 0;
  const dismissals = innings - notOuts;
  const runs = Number(batting?.runs) || 0;

  if (dismissals <= 0) {
    return "-";
  }

  return formatNumber(runs / dismissals, 2);
}

function strikeRate(batting) {
  const runs = Number(batting?.runs) || 0;
  const balls = Number(batting?.balls) || 0;
  if (balls <= 0) {
    return "-";
  }
  return formatNumber((runs * 100) / balls, 2);
}

function bowlingAverage(bowling) {
  const wickets = Number(bowling?.wickets) || 0;
  const runs = Number(bowling?.runs) || 0;
  if (wickets <= 0) {
    return "-";
  }
  return formatNumber(runs / wickets, 2);
}

function economyRate(bowling) {
  const balls = Number(bowling?.balls) || 0;
  const runs = Number(bowling?.runs) || 0;
  if (balls <= 0) {
    return "-";
  }
  return formatNumber((runs * 6) / balls, 2);
}

function PlayerProfilesPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadPlayers = async () => {
      try {
        setError("");
        const response = await getPlayers();
        if (mounted) {
          setPlayers(response.players || []);
        }
      } catch (requestError) {
        if (mounted) {
          setError(requestError.message || "Unable to load players");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadPlayers();

    return () => {
      mounted = false;
    };
  }, []);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Player Profiles</h1>
          <p className="mt-1 text-slate-600">
            Career batting and bowling stats for all saved players.
          </p>
        </div>
        <Link
          to="/"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          Back to Home
        </Link>
      </div>

      {loading ? (
        <p className="mt-6 text-slate-700">Loading players...</p>
      ) : null}
      {error ? (
        <p className="mt-6 rounded-lg bg-red-100 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!loading && !error && sortedPlayers.length === 0 ? (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-600">
          No players found. Add players from umpire mode first.
        </p>
      ) : null}

      {!loading && !error && sortedPlayers.length > 0 ? (
        <>
          <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Batting</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Player</th>
                    <th className="px-2 py-2 text-right">Mat</th>
                    <th className="px-2 py-2 text-right">Inns</th>
                    <th className="px-2 py-2 text-right">Runs</th>
                    <th className="px-2 py-2 text-right">Balls</th>
                    <th className="px-2 py-2 text-right">Avg</th>
                    <th className="px-2 py-2 text-right">SR</th>
                    <th className="px-2 py-2 text-right">HS</th>
                    <th className="px-2 py-2 text-right">50s</th>
                    <th className="px-2 py-2 text-right">100s</th>
                    <th className="px-2 py-2 text-right">4s</th>
                    <th className="px-2 py-2 text-right">6s</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player) => {
                    const batting = player.batting || {};
                    return (
                      <tr
                        key={player._id}
                        id={`player-${player._id}`}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2">
                            <PlayerAvatar player={player} />
                            <span className="font-medium text-slate-900">
                              {player.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right">
                          {batting.matches || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {batting.innings || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {batting.runs || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {batting.balls || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {battingAverage(batting)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {strikeRate(batting)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {batting.highestScore || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {batting.fifties || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {batting.hundreds || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {batting.fours || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {batting.sixes || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Bowling</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Player</th>
                    <th className="px-2 py-2 text-right">Mat</th>
                    <th className="px-2 py-2 text-right">Inns</th>
                    <th className="px-2 py-2 text-right">Overs</th>
                    <th className="px-2 py-2 text-right">Balls</th>
                    <th className="px-2 py-2 text-right">Runs</th>
                    <th className="px-2 py-2 text-right">Wkts</th>
                    <th className="px-2 py-2 text-right">Avg</th>
                    <th className="px-2 py-2 text-right">Econ</th>
                    <th className="px-2 py-2 text-right">Best</th>
                    <th className="px-2 py-2 text-right">4W</th>
                    <th className="px-2 py-2 text-right">5W</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((player) => {
                    const bowling = player.bowling || {};
                    return (
                      <tr
                        key={`${player._id}-bowling`}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2">
                            <PlayerAvatar player={player} />
                            <span className="font-medium text-slate-900">
                              {player.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right">
                          {bowling.matches || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {bowling.innings || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {bowling.overs || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {bowling.balls || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {bowling.runs || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {bowling.wickets || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {bowlingAverage(bowling)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {economyRate(bowling)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {`${bowling.bestFiguresWickets || 0}/${bowling.bestFiguresRuns || 0}`}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {bowling.fourWickets || 0}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {bowling.fiveWickets || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function PlayerAvatar({ player }) {
  const hasPhoto = Boolean(player?.photoUrl);
  const initial = player?.name?.trim()?.charAt(0)?.toUpperCase() || "?";

  if (hasPhoto) {
    return (
      <img
        src={player.photoUrl}
        alt={player.name}
        className="h-8 w-8 rounded-full border border-slate-200 object-cover"
      />
    );
  }

  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-600">
      {initial}
    </span>
  );
}

export default PlayerProfilesPage;
