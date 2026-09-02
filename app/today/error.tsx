"use client";

export default function TodayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="app-card rounded-3xl p-6 text-center">
      <h2 className="text-base font-semibold text-foreground">
        Couldn&apos;t load today&apos;s outfit
      </h2>
      <p className="mt-2 text-sm muted-copy">{error.message || "Please try again."}</p>
      <button type="button" onClick={() => reset()} className="button-primary mt-4">
        Retry
      </button>
    </section>
  );
}
