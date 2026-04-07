import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import GroupChip from "../components/GroupChip";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, getMyGroups, leaveGroup } from "../services/api";

const ACTIVE_GROUP_KEY = "crictrack_active_group";
const ACTIVE_GROUP_NAME_KEY = "crictrack_active_group_name";

function ProfileAvatar({ name, photoUrl }) {
  const initials =
    (name || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="relative h-24 w-24 overflow-hidden rounded-2xl border border-white/10 bg-slate-800">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name || "User avatar"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 text-2xl font-black text-slate-200">
          {initials}
        </div>
      )}
    </div>
  );
}

export default function UserProfilePage() {
  const navigate = useNavigate();
  const { token, user, updateUser, logout } = useAuth();

  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl || "");

  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [leavingGroupId, setLeavingGroupId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activeGroupId = useMemo(
    () => localStorage.getItem(ACTIVE_GROUP_KEY) || "",
    [],
  );

  const loadGroups = async () => {
    const response = await getMyGroups(token);
    const nextGroups = response.groups || [];
    setGroups(nextGroups);
    return nextGroups;
  };

  useEffect(() => {
    setProfileName(user?.name || "");
    setProfileEmail(user?.email || "");
    setPhotoUrl(user?.photoUrl || "");
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (!token) {
        setLoadingGroups(false);
        return;
      }
      try {
        setLoadingGroups(true);
        setError("");
        await loadGroups();
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message || "Unable to load groups");
        }
      } finally {
        if (isMounted) {
          setLoadingGroups(false);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleAvatarSave = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    try {
      setSavingAvatar(true);
      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: profileName,
          photoUrl: photoUrl.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "Unable to update profile");
      }

      setProfileName(data.user?.name || profileName);
      setProfileEmail(data.user?.email || profileEmail);
      setPhotoUrl(data.user?.photoUrl || "");
      updateUser(data.user);
      setNotice("Profile updated successfully");
    } catch (requestError) {
      setError(requestError.message || "Unable to update profile");
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleLeaveGroup = async (groupId) => {
    setError("");
    setNotice("");

    try {
      setLeavingGroupId(groupId);
      const nextGroups = await (async () => {
        await leaveGroup(groupId, token);
        return loadGroups();
      })();

      setNotice("Left group successfully");

      if (groupId !== activeGroupId) return;

      const fallback = nextGroups[0];
      if (fallback?._id) {
        localStorage.setItem(ACTIVE_GROUP_KEY, fallback._id);
        localStorage.setItem(ACTIVE_GROUP_NAME_KEY, fallback.name || "");
      } else {
        localStorage.removeItem(ACTIVE_GROUP_KEY);
        localStorage.removeItem(ACTIVE_GROUP_NAME_KEY);
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to leave group");
    } finally {
      setLeavingGroupId("");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div
      className="min-h-screen bg-[#0d1117] text-white"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800;900&display=swap');
        .score-num { font-family: 'Barlow Condensed', sans-serif; }
        input::placeholder { color: #475569; }
      `}</style>

      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0d1117]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316]">
              <span className="text-[10px] font-black text-white">C</span>
            </div>
            <span className="text-sm font-black uppercase tracking-[0.15em] text-white">
              CricTrack
            </span>
          </Link>
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#f97316]">
            Profile
          </span>
          <div className="flex items-center gap-2">
            <GroupChip />
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-300 transition-all hover:border-red-400/50 hover:bg-red-500/20 hover:text-red-200"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-5 pb-20">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-900/20 px-4 py-2.5 text-sm text-emerald-300">
            {notice}
          </div>
        )}

        <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
            User Profile
          </p>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <ProfileAvatar name={profileName} photoUrl={photoUrl} />

            <form onSubmit={handleAvatarSave} className="flex-1 space-y-3">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Name
                </label>
                <input
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Email
                </label>
                <input
                  value={profileEmail}
                  readOnly
                  className="w-full cursor-not-allowed rounded-xl border border-white/8 bg-slate-900 px-3 py-2.5 text-sm text-slate-400 outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Avatar URL
                </label>
                <input
                  value={photoUrl}
                  onChange={(event) => setPhotoUrl(event.target.value)}
                  placeholder="https://your-image-url"
                  className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                />
              </div>

              <button
                type="submit"
                disabled={savingAvatar}
                className="rounded-xl border border-[#f97316]/40 bg-[#f97316] px-4 py-2.5 text-sm font-black uppercase tracking-widest text-[#0d1117] transition-all hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingAvatar ? "Saving..." : "Save Profile"}
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
              Your Groups
            </p>
            <Link
              to="/groups"
              className="rounded-xl border border-[#f97316]/35 bg-[#f97316]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#f97316] transition-all hover:border-[#f97316]/50 hover:bg-[#f97316]/15"
            >
              Join / Create More
            </Link>
          </div>

          {loadingGroups ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
              Loading groups...
            </div>
          ) : groups.length === 0 ? (
            <p className="rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-sm text-slate-400">
              You are not part of any groups yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {groups.map((group) => {
                const memberCount = Array.isArray(group.members)
                  ? group.members.length
                  : 0;

                return (
                  <article
                    key={group._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-slate-800/60 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="score-num truncate text-xl font-extrabold uppercase tracking-wide text-white">
                        {group.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {memberCount} members
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={leavingGroupId === group._id}
                      onClick={() => handleLeaveGroup(group._id)}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-red-300 transition-all hover:border-red-400/50 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {leavingGroupId === group._id ? "Leaving..." : "Leave"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
