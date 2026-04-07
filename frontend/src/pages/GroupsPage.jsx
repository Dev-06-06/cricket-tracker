import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BottomNav from "../components/BottomNav";
import GroupChip from "../components/GroupChip";
import ProfileToolbarButton from "../components/ProfileToolbarButton";
import {
  createGroup,
  getMyGroups,
  joinGroup,
  leaveGroup,
} from "../services/api";

const ACTIVE_GROUP_KEY = "crictrack_active_group";
const ACTIVE_GROUP_NAME_KEY = "crictrack_active_group_name";

function GroupCard({
  group,
  isActive,
  selecting,
  leaving,
  onSelect,
  onLeave,
  onCopy,
}) {
  const memberCount = Array.isArray(group.members) ? group.members.length : 0;

  return (
    <article
      className={`rounded-2xl border p-4 transition-all ${
        isActive
          ? "border-[#f97316]/60 bg-[#f97316]/10"
          : "border-white/8 bg-slate-900/60 hover:border-white/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="score-num truncate text-2xl font-extrabold uppercase tracking-wide text-white">
            {group.name}
          </p>
          <p className="mt-1 text-xs text-slate-500">{memberCount} members</p>
          {group.description && (
            <p className="mt-2 line-clamp-2 text-sm text-slate-400">
              {group.description}
            </p>
          )}
        </div>
        {isActive && (
          <span className="rounded-full border border-[#f97316]/30 bg-[#f97316]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-[#f97316]">
            Active
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="rounded-xl border border-white/8 bg-slate-800 px-2.5 py-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Invite Code
          </p>
          <p className="score-num text-lg font-bold tracking-wide text-slate-200">
            {group.inviteCode || "------"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCopy(group.inviteCode)}
          className="rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-400 transition-all hover:border-white/20 hover:text-slate-200"
        >
          Copy
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={selecting}
          onClick={() => onSelect(group._id)}
          className={`flex-1 rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
            isActive
              ? "border-[#f97316]/50 bg-[#f97316] text-[#0d1117]"
              : "border-white/8 bg-white/5 text-slate-300 hover:border-[#f97316]/40 hover:text-[#f97316]"
          }`}
        >
          {isActive ? "Selected" : "Select"}
        </button>
        <button
          type="button"
          disabled={leaving}
          onClick={() => onLeave(group._id)}
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-red-300 transition-all hover:border-red-400/50 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {leaving ? "Leaving..." : "Leave"}
        </button>
      </div>
    </article>
  );
}

export default function GroupsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [activeGroupId, setActiveGroupId] = useState(
    () => localStorage.getItem(ACTIVE_GROUP_KEY) || "",
  );

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [leavingGroupId, setLeavingGroupId] = useState("");

  const loadGroups = useCallback(async () => {
    const response = await getMyGroups(token);
    const nextGroups = response.groups || [];
    setGroups(nextGroups);
    return nextGroups;
  }, [token]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError("");
        const nextGroups = await loadGroups();

        if (!isMounted) return;

        if (nextGroups.length === 0) {
          setActiveGroupId("");
          localStorage.removeItem(ACTIVE_GROUP_KEY);
          localStorage.removeItem(ACTIVE_GROUP_NAME_KEY);
          return;
        }

        const groupExists = nextGroups.some(
          (group) => group._id === activeGroupId,
        );
        if (!groupExists) {
          const fallbackGroupId = nextGroups[0]._id;
          setActiveGroupId(fallbackGroupId);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message || "Unable to load groups");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [token, loadGroups]);

  useEffect(() => {
    if (!activeGroupId) {
      localStorage.removeItem(ACTIVE_GROUP_KEY);
      localStorage.removeItem(ACTIVE_GROUP_NAME_KEY);
      return;
    }

    const selectedGroup = groups.find((group) => group._id === activeGroupId);

    localStorage.setItem(ACTIVE_GROUP_KEY, activeGroupId);
    if (selectedGroup?.name) {
      localStorage.setItem(ACTIVE_GROUP_NAME_KEY, selectedGroup.name);
    } else {
      localStorage.removeItem(ACTIVE_GROUP_NAME_KEY);
    }
  }, [activeGroupId, groups]);

  const activeGroup = useMemo(
    () => groups.find((group) => group._id === activeGroupId) || null,
    [groups, activeGroupId],
  );

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!newGroupName.trim()) {
      setError("Group name is required");
      return;
    }

    try {
      setCreating(true);
      const response = await createGroup(
        {
          name: newGroupName.trim(),
          description: newGroupDescription.trim(),
        },
        token,
      );

      const createdGroupId = response.group?._id;
      const nextGroups = await loadGroups();
      setNewGroupName("");
      setNewGroupDescription("");
      setNotice("Group created successfully");

      if (createdGroupId) {
        setActiveGroupId(createdGroupId);
      } else if (nextGroups.length > 0) {
        setActiveGroupId(nextGroups[0]._id);
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to create group");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinGroup = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    const normalizedCode = inviteCode.trim().toUpperCase();

    if (normalizedCode.length !== 6) {
      setError("Invite code must be 6 characters");
      return;
    }

    try {
      setJoining(true);
      const response = await joinGroup({ inviteCode: normalizedCode }, token);
      const joinedGroupId = response.group?._id;
      const nextGroups = await loadGroups();
      setInviteCode("");
      setNotice("Group joined successfully");

      if (joinedGroupId) {
        setActiveGroupId(joinedGroupId);
      } else if (nextGroups.length > 0) {
        setActiveGroupId(nextGroups[0]._id);
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to join group");
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveGroup = async (groupId) => {
    setError("");
    setNotice("");

    try {
      setLeavingGroupId(groupId);
      await leaveGroup(groupId, token);
      const nextGroups = await loadGroups();
      setNotice("Left group successfully");

      if (groupId !== activeGroupId) return;

      const fallbackGroup = nextGroups[0];
      setActiveGroupId(fallbackGroup?._id || "");
    } catch (requestError) {
      setError(requestError.message || "Unable to leave group");
    } finally {
      setLeavingGroupId("");
    }
  };

  const handleCopyInviteCode = async (code) => {
    if (!code) {
      setError("No invite code available to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setNotice(`Invite code ${code} copied`);
      setError("");
    } catch {
      setError("Unable to copy invite code");
    }
  };

  return (
    <div
      className="min-h-screen bg-[#0d1117] text-white"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800;900&display=swap');
        .score-num { font-family: 'Barlow Condensed', sans-serif; }
        input::placeholder, textarea::placeholder { color: #475569; }
      `}</style>

      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0d1117]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316]">
              <span className="text-[10px] font-black text-white">C</span>
            </div>
            <span className="text-sm font-black uppercase tracking-[0.15em] text-white">
              CricTrack
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ProfileToolbarButton />
            <GroupChip />
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-[11px] font-medium text-slate-600 hover:text-slate-300 transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 pb-20 space-y-5">
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
                Your Groups
              </p>
              <h1 className="score-num mt-1 text-4xl font-extrabold uppercase tracking-wide text-white">
                Groups
              </h1>
            </div>
            {activeGroup && (
              <div className="rounded-xl border border-[#f97316]/30 bg-[#f97316]/10 px-3 py-2 text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#f97316]">
                  Active Group
                </p>
                <p className="score-num text-xl font-bold text-white">
                  {activeGroup.name}
                </p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
              Loading groups...
            </div>
          ) : groups.length === 0 ? (
            <p className="rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-sm text-slate-400">
              You are not in any groups yet. Create one or join with an invite
              code.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {groups.map((group) => (
                <GroupCard
                  key={group._id}
                  group={group}
                  isActive={activeGroupId === group._id}
                  selecting={activeGroupId === group._id}
                  leaving={leavingGroupId === group._id}
                  onSelect={setActiveGroupId}
                  onLeave={handleLeaveGroup}
                  onCopy={handleCopyInviteCode}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
          <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
            Create Group
          </p>
          <form className="space-y-3" onSubmit={handleCreateGroup}>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Name
              </label>
              <input
                type="text"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                placeholder="Weekend Warriors"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Description
              </label>
              <textarea
                value={newGroupDescription}
                onChange={(event) => setNewGroupDescription(event.target.value)}
                className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                rows={3}
                placeholder="Friendly neighborhood cricket squad"
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-xl border border-[#f97316]/40 bg-[#f97316] px-4 py-2.5 text-sm font-black uppercase tracking-widest text-[#0d1117] transition-all hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create Group"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-white/8 bg-slate-900/60 p-5">
          <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-[#f97316]">
            Join Group
          </p>
          <form className="space-y-3" onSubmit={handleJoinGroup}>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Invite Code
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(event) =>
                  setInviteCode(event.target.value.toUpperCase().slice(0, 6))
                }
                className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-center text-lg font-bold uppercase tracking-[0.25em] text-white outline-none transition-all focus:ring-2 focus:ring-[#f97316]"
                placeholder="ABC123"
                maxLength={6}
                required
              />
            </div>

            <button
              type="submit"
              disabled={joining}
              className="w-full rounded-xl border border-[#f97316]/40 bg-[#f97316] px-4 py-2.5 text-sm font-black uppercase tracking-widest text-[#0d1117] transition-all hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {joining ? "Joining..." : "Join Group"}
            </button>
          </form>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
