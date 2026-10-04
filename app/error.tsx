"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="app-shell">
      <div className="page-frame">
        <section className="fatal-state">
          <span className="empty-status">EDGE ERROR</span>
          <h1>Something failed safely.</h1>
          <p>
            EDGE stopped this request rather than showing incomplete or fabricated data.
          </p>
          <button className="primary-button" type="button" onClick={reset}>
            TRY AGAIN <span aria-hidden="true">→</span>
          </button>
        </section>
      </div>
    </main>
  );
}
