import type { StylePreferences } from "@/lib/style-preferences";

/**
 * What today is for. Picked per day on /today (remembered per weekday) and
 * turned into a target formality the outfit is scored against, since the
 * spread-only formality check can't tell "office" from "weekend".
 */
export const OCCASIONS = ["casual", "work", "going_out", "active"] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const OCCASION_LABELS: Record<Occasion, string> = {
  casual: "Casual",
  work: "Work",
  going_out: "Going out",
  active: "Active",
};

/** Prisma `Occasion` enum value for each client value. */
export const OCCASION_DB_VALUES = {
  casual: "CASUAL",
  work: "WORK",
  going_out: "GOING_OUT",
  active: "ACTIVE",
} as const satisfies Record<Occasion, string>;

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
export type OccasionByWeekday = Partial<Record<WeekdayKey, Occasion>>;

export type OccasionSource = "request" | "weekday" | "quiz" | "default";

export function isOccasion(value: unknown): value is Occasion {
  return typeof value === "string" && (OCCASIONS as readonly string[]).includes(value);
}

/** Weekday of a YYYY-MM-DD calendar date (independent of server timezone). */
export function weekdayKeyForDateKey(dateKey: string): WeekdayKey {
  return WEEKDAY_KEYS[new Date(`${dateKey}T00:00:00.000Z`).getUTCDay()];
}

/** Keeps only valid weekday → occasion entries from the stored JSON. */
export function parseOccasionByWeekday(raw: unknown): OccasionByWeekday {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: OccasionByWeekday = {};
  for (const key of WEEKDAY_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (isOccasion(value)) result[key] = value;
  }
  return result;
}

export function defaultOccasionFromPreferences(prefs?: StylePreferences | null): Occasion | null {
  if (!prefs) return null;
  if (prefs.dressCode === "casual") return "casual";
  return "work";
}

/**
 * Picks the occasion for a day: an explicit chip tap wins, then the user's
 * last pick for that weekday, then the quiz dress code, then casual.
 */
export function resolveOccasion(args: {
  requested?: Occasion | null;
  byWeekday: OccasionByWeekday;
  dateKey: string;
  stylePreferences?: StylePreferences | null;
}): { occasion: Occasion; source: OccasionSource } {
  if (args.requested) return { occasion: args.requested, source: "request" };
  const remembered = args.byWeekday[weekdayKeyForDateKey(args.dateKey)];
  if (remembered) return { occasion: remembered, source: "weekday" };
  const fromQuiz = defaultOccasionFromPreferences(args.stylePreferences);
  if (fromQuiz) return { occasion: fromQuiz, source: "quiz" };
  return { occasion: "casual", source: "default" };
}

/** Target on the RELAXED(0) – ELEVATED(1) – DRESSY(2) formality scale. */
export function targetFormalityFor(
  occasion: Occasion,
  stylePreferences?: StylePreferences | null,
): number {
  switch (occasion) {
    case "casual":
    case "active":
      return 0;
    case "work":
      return stylePreferences?.dressCode === "formal" ? 2 : 1;
    case "going_out":
      return 1.5;
  }
}
