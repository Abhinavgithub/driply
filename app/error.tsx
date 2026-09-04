"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="app-card rounded-3xl p-6 text-center" role="alert" aria-live="assertive">
      <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
      <p className="mt-2 text-sm muted-copy">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <button type="button" onClick={() => reset()} className="button-primary mt-4">
        Try again
      </button>
    </section>
  );
}
