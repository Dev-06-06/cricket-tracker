import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useActiveGroup } from "../context/ActiveGroupContext";
import { getMyGroups } from "../services/api";

/**
 * Compact header chip — shows active group name + dropdown to switch groups.
 * Reads/writes crictrack_active_group + crictrack_active_group_name in
 * localStorage so all pages stay in sync.
 */
export default function GroupChip() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { activeGroupId, activeGroupName, switchGroup } = useActiveGroup();
  const [groups, setGroups] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Load groups once
  useEffect(() => {
    if (!token) return;
    getMyGroups(token)
      .then((r) => setGroups(r.groups || []))
      .catch(() => {});
  }, [token]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!token) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl border border-[#f97316]/30 bg-[#f97316]/8 px-2.5 py-1.5 transition-all hover:border-[#f97316]/50 hover:bg-[#f97316]/15 max-w-[140px]"
      >
        <span className="text-[9px] font-black uppercase tracking-widest text-[#f97316]/60">
          GRP
        </span>
        <span className="truncate text-[11px] font-black uppercase tracking-wide text-white max-w-[80px]">
          {activeGroupName || "Select"}
        </span>
        <span className="text-[9px] text-[#f97316]/60 shrink-0">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] shadow-2xl shadow-black/70">
          {groups.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500">
              No groups yet.{" "}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate("/groups");
                }}
                className="text-[#f97316] underline"
              >
                Create one
              </button>
            </div>
          ) : (
            groups.map((g) => {
              const isActive = g._id === activeGroupId;
              return (
                <button
                  key={g._id}
                  type="button"
                  onClick={() => {
                    switchGroup(g._id, g.name);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between border-b border-white/5 px-4 py-2.5 text-left last:border-0 transition-colors ${
                    isActive
                      ? "bg-[#f97316]/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-black uppercase tracking-wide">
                      {g.name}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {g.members?.length || 0} members
                    </p>
                  </div>
                  {isActive && (
                    <span className="ml-2 shrink-0 text-[10px] font-black text-[#f97316]">
                      ✓
                    </span>
                  )}
                </button>
              );
            })
          )}
          <div className="border-t border-white/5 px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/groups");
              }}
              className="w-full rounded-lg py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:text-slate-300"
            >
              Manage Groups →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
