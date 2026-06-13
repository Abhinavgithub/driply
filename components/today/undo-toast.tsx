"use client";

/** "Outfit logged" toast pinned above the bottom nav with an undo action. */
export function UndoToast({ onUndo }: { onUndo: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "calc(64px + 16px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 9999,
        padding: "10px 16px 10px 20px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        whiteSpace: "nowrap",
        minWidth: 240,
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
        }}
      >
        Outfit logged ✓
      </span>
      <button
        type="button"
        onClick={onUndo}
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "oklch(75% 0.18 200)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 8px",
          borderRadius: 9999,
          fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
        }}
      >
        Undo
      </button>
    </div>
  );
}
