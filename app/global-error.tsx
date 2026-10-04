"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0A0B0D",
          color: "#F4F0E7",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <section style={{ maxWidth: 460 }}>
            <p
              style={{
                color: "#C8A96B",
                fontSize: 11,
                letterSpacing: "0.18em",
                fontWeight: 800,
              }}
            >
              EDGE SYSTEM ERROR
            </p>
            <h1
              style={{
                margin: "12px 0 0",
                fontFamily: "Georgia, serif",
                fontSize: 34,
                fontWeight: 400,
              }}
            >
              The application stopped safely.
            </h1>
            <p style={{ color: "#92908A", lineHeight: 1.65 }}>
              A root-level application error occurred. No incomplete intelligence is being
              presented as valid data.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: 48,
                width: "100%",
                marginTop: 16,
                border: "1px solid rgba(200,169,107,.35)",
                borderRadius: 12,
                background: "rgba(200,169,107,.08)",
                color: "#E4D2A6",
                fontWeight: 800,
                letterSpacing: ".12em",
              }}
            >
              TRY AGAIN
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
