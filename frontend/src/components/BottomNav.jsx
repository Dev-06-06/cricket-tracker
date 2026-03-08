import { useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useActiveGroup } from "../context/ActiveGroupContext";
import { useAuth } from "../context/AuthContext";
import {
  getCompletedMatches,
  getGroupPlayers,
  getGroupPlayersWithStats,
  getLiveMatches,
  getMyGroups,
  getUpcomingMatches,
} from "../services/api";
import usePageCache from "../hooks/usePageCache";

const NAV_ITEMS = [
  { path: "/view", emoji: "👀", label: "Home" },
  { path: "/umpire", emoji: "✋", label: "Umpire" },
  { path: "/players", emoji: "🏏", label: "Dugout" },
  { path: "/groups", emoji: "👥", label: "Groups" },
];

/**
 * Sticky bottom navigation bar shown on all main pages.
 * Highlights the current active route.
 * Hidden when not authenticated.
 */
export default function BottomNav() {
  const { isAuthenticated, token } = useAuth();
  const { activeGroupId } = useActiveGroup();
  const { pathname } = useLocation();
  const prefetchedRef = useRef({});
  const homeCache = usePageCache("home_" + activeGroupId);
  const dugoutCache = usePageCache("dugout_" + activeGroupId);

  const prefetch = async (path) => {
    if (path === "/players" && !activeGroupId) return;

    if (prefetchedRef.current[path]) return;
    prefetchedRef.current[path] = true;

    if (path === "/view") {
      try {
        const result = await Promise.all([
          getLiveMatches(activeGroupId, token),
          getUpcomingMatches(activeGroupId, token),
          getCompletedMatches(activeGroupId, token),
        ]);
        homeCache.set(result);
      } catch {
        prefetchedRef.current[path] = false;
      }
    }

    if (path === "/players" && activeGroupId) {
      try {
        const result = await getGroupPlayersWithStats(activeGroupId, token);
        dugoutCache.set(result);
      } catch {
        prefetchedRef.current[path] = false;
      }
    }

    if (path === "/umpire") {
      // Prefetch groups first since the umpire page always needs them.
      getMyGroups(token)
        .then((r) => {
          sessionStorage.setItem(
            "umpire_groups",
            JSON.stringify({ data: r.groups || [], fetchedAt: Date.now() }),
          );
        })
        .catch(() => {
          prefetchedRef.current[path] = false;
        });

      // If a group is selected, prefetch dashboard lists and player pool too.
      if (activeGroupId) {
        Promise.all([
          getUpcomingMatches(activeGroupId, token),
          getLiveMatches(activeGroupId, token),
          getCompletedMatches(activeGroupId, token),
          getGroupPlayers(activeGroupId, token),
        ])
          .then(([upcoming, live, completed, pool]) => {
            sessionStorage.setItem(
              "umpire_matches_" + activeGroupId,
              JSON.stringify({
                data: {
                  upcoming: upcoming.matches || [],
                  live: live.matches || [],
                  completed: completed.matches || [],
                },
                fetchedAt: Date.now(),
              }),
            );
            sessionStorage.setItem(
              "umpire_players_" + activeGroupId,
              JSON.stringify({
                data: pool.players || [],
                fetchedAt: Date.now(),
              }),
            );
          })
          .catch(() => {
            prefetchedRef.current[path] = false;
          });
      }
    }
  };

  if (!isAuthenticated) return null;

  return (
    <>
      {/* Spacer so page content isn't hidden behind the nav */}
      <div className="h-16 shrink-0" />

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/8 bg-[#0d1117]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-stretch">
          {NAV_ITEMS.map(({ path, emoji, label }) => {
            const isActive =
              pathname === path || pathname.startsWith(path + "/");
            return (
              <Link
                key={path}
                to={path}
                onMouseEnter={() => prefetch(path)}
                onTouchStart={() => prefetch(path)}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 transition-all active:scale-95 ${
                  isActive
                    ? "text-[#f97316]"
                    : "text-slate-600 hover:text-slate-400"
                }`}
              >
                <span className="text-lg leading-none">{emoji}</span>
                <span
                  className={`text-[9px] font-black uppercase tracking-widest ${
                    isActive ? "text-[#f97316]" : "text-slate-700"
                  }`}
                >
                  {label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 h-0.5 w-8 rounded-full bg-[#f97316]" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
