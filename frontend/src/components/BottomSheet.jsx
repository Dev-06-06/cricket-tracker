import { useEffect, useRef } from "react";

// RISK: only one sheet open at a time — parent controls isOpen state
// RISK: never use position:fixed — use fixed manually with z-index
// RISK: sheet must not close when scrolling inside it

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  disableClose = false,   // when true, backdrop click and swipe do nothing
  height = "auto",        // "auto" | "full" | "half" | css string
}) {
  const sheetRef = useRef(null);
  const startYRef = useRef(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Close on Escape key unless disableClose
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape" && !disableClose) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, disableClose]);

  // Swipe down to close
  const handleTouchStart = (e) => {
    startYRef.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e) => {
    if (disableClose) return;
    const delta = e.changedTouches[0].clientY - (startYRef.current || 0);
    if (delta > 80) onClose();
  };

  const heightClass =
    height === "full" ? "max-h-[96vh]" :
    height === "half" ? "max-h-[50vh]" :
    height === "auto" ? "max-h-[92vh]" :
    "";

  const heightStyle = !["full","half","auto"].includes(height)
    ? { maxHeight: height }
    : {};

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ fontFamily: "'DM Sans', sans-serif" }}>
      
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => { if (!disableClose) onClose(); }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`relative w-full rounded-t-2xl border-t border-white/10 
          bg-[#101722] shadow-2xl shadow-black/60 
          flex flex-col overflow-hidden ${heightClass}`}
        style={heightStyle}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-slate-700" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between 
            border-b border-white/5 px-4 py-3 shrink-0">
            <p className="text-sm font-black uppercase tracking-widest 
              text-white">
              {title}
            </p>
            {!disableClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center 
                  rounded-full bg-white/5 text-slate-400 
                  hover:bg-white/10 hover:text-white transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 
          py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
