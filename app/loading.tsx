export default function Loading() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading your outfit"
    >
      <div className="app-card shimmer h-40 rounded-3xl" aria-hidden="true" />
      <div className="outfit-hero" aria-hidden="true">
        <div className="outfit-hero-item outfit-hero-main shimmer" />
        <div className="outfit-hero-item shimmer" />
        <div className="outfit-hero-item shimmer" />
      </div>
      <span className="sr-only">Loading your outfit…</span>
    </div>
  );
}
