import { useState } from "react";

export default function BottomSheetOption({
  label,
  sublabel,
  photoUrl,
  selected = false,
  disabled = false,
  badge,        // e.g. "↩ Return" or "🃏 Joker"
  badgeColor,   // tailwind color string e.g. "text-amber-400"
  onClick,
}) {
  const [imgErr, setImgErr] = useState(false);
  const initial = (label || "?").trim().charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 rounded-xl border px-3 
        py-2.5 text-left transition-all active:scale-[0.98]
        ${selected
          ? "border-[#f97316]/60 bg-[#f97316]/10"
          : disabled
            ? "border-white/5 bg-white/3 opacity-40 cursor-not-allowed"
            : "border-white/8 bg-white/4 hover:border-white/15 hover:bg-white/8"
        }`}
    >
      {/* Avatar */}
      <span className="inline-flex h-9 w-9 shrink-0 rounded-full 
        overflow-hidden ring-2 ring-white/10">
        {photoUrl && !imgErr ? (
          <img
            src={photoUrl}
            alt={label}
            className="h-full w-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center 
            bg-gradient-to-br from-slate-600 to-slate-800 
            text-sm font-bold text-slate-200">
            {initial}
          </span>
        )}
      </span>

      {/* Labels */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-bold 
          ${selected ? "text-[#f97316]" : "text-white"}`}>
          {label}
        </p>
        {sublabel && (
          <p className="truncate text-[11px] text-slate-500">{sublabel}</p>
        )}
      </div>

      {/* Badge */}
      {badge && (
        <span className={`shrink-0 rounded-full border border-white/10 
          bg-white/5 px-2 py-0.5 text-[10px] font-black uppercase 
          tracking-widest ${badgeColor || "text-slate-400"}`}>
          {badge}
        </span>
      )}

      {/* Selected check */}
      {selected && (
        <span className="shrink-0 text-[#f97316] font-black text-sm">✓</span>
      )}
    </button>
  );
}
