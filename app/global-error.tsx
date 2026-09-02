"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div style={{ padding: 32, textAlign: "center", fontFamily: "system-ui" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ marginTop: 8, color: "#666" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
