export function getServerDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dateKeyToUtcStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** Local hour (0–23) as a short label: 0 → "12am", 14 → "2pm". */
export function formatHour(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${suffix}`;
}
