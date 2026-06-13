"use client";

import { useMemo, useState } from "react";

import type { WornHistoryItem } from "@/lib/types/wardrobe";

type WeekHistoryProps = {
  wornDateKeys: Set<string>;
  wornHistory: WornHistoryItem[];
};

/** Last-7-days worn dots with streak badge and an inline outfit detail per day. */
export function WeekHistory({ wornDateKeys, wornHistory }: WeekHistoryProps) {
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<string | null>(null);

  const weekDays = useMemo(() => {
    const today = new Date();
    const todayKey = today.toLocaleDateString("en-CA");
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - 6 + i);
      const key = d.toLocaleDateString("en-CA");
      const isPast = key < todayKey;
      return {
        key,
        label: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3),
        state:
          key === todayKey
            ? "today"
            : wornDateKeys.has(key)
              ? "worn"
              : isPast
                ? "missed"
                : "future",
      };
    });
  }, [wornDateKeys]);

  const streak = useMemo(() => {
    let count = 0;
    const today = new Date();
    for (let i = 0; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      if (!wornDateKeys.has(d.toLocaleDateString("en-CA"))) break;
      count++;
    }
    return count;
  }, [wornDateKeys]);

  return (
    <div className="week-section">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          This week
        </span>
        {streak > 0 && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--warning)",
            }}
          >
            🔥 {streak}-day streak
          </span>
        )}
      </div>
      <div className="week-days">
        {weekDays.map((day) => (
          <div key={day.key} className="week-day">
            <div className="week-day-label">{day.label}</div>
            <button
              type="button"
              disabled={day.state !== "worn"}
              onClick={() =>
                day.state === "worn" &&
                setSelectedHistoryDay(selectedHistoryDay === day.key ? null : day.key)
              }
              className={`week-dot-wrap ${day.state}${selectedHistoryDay === day.key ? " selected" : ""}`}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: day.state === "worn" ? "pointer" : "default",
              }}
              aria-label={day.state === "worn" ? `View outfit worn on ${day.label}` : undefined}
            >
              <div className="week-dot" />
            </button>
          </div>
        ))}
      </div>

      {/* Inline outfit detail for selected day */}
      {selectedHistoryDay &&
        (() => {
          const entry = wornHistory.find((h) => h.dateKey === selectedHistoryDay);
          if (!entry) return null;
          const photos = [
            { url: entry.topPhotoUrl, label: "Top" },
            { url: entry.bottomPhotoUrl, label: "Bottom" },
            { url: entry.shoePhotoUrl, label: "Shoes" },
          ];
          return (
            <div
              style={{
                marginTop: 12,
                padding: "12px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 16,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {photos.map(({ url, label }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt={label}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--muted-foreground)",
                            fontSize: 20,
                          }}
                        >
                          ?
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--muted-foreground)",
                        fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                      }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
