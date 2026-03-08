import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProfileToolbarButton({ className = "" }) {
  const { user } = useAuth();
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [user?.photoUrl]);

  const initials = useMemo(() => {
    const name = (user?.name || "").trim();
    if (!name) return "U";

    return (
      name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("")
        .toUpperCase() || "U"
    );
  }, [user?.name]);

  return (
    <Link
      to="/profile"
      className={`inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5 text-sm text-slate-300 transition-all hover:border-[#f97316]/40 hover:text-[#f97316] ${className}`}
      title="Profile"
    >
      {user?.photoUrl && !imgError ? (
        <img
          src={user.photoUrl}
          alt={user?.name || "Profile"}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="score-num text-[11px] font-bold text-slate-200">
          {initials}
        </span>
      )}
    </Link>
  );
}
