export function normalizeNextPath(value: string | null | undefined, fallback = "/today") {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  return value;
}
