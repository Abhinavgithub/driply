export function getServerDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dateKeyToUtcStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}
