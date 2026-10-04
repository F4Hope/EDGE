import { EmptyState } from "@/components/EmptyState";
import { MetricPlaceholder } from "@/components/MetricPlaceholder";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getUiHistory } from "@/lib/data/uiHistory";

export const dynamic = "force-dynamic";

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function resultTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      }).format(date);
}

export default async function HistoryPage() {
  const state = await getUiHistory();
  const evaluation = state.performance.evaluation;

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="AUDIT TRAIL"
        title="History"
        description="Stored event results and model records remain traceable. Statistical performance is shown only when real settled prediction data supports it."
      />

      <div className="metric-grid">
        <MetricPlaceholder
          label="PREDICTIONS"
          value={String(state.predictionCount)}
          note="Stored analytical records"
          state={state.predictionCount > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="SETTLED EVENTS"
          value={String(state.settledEvents)}
          note="Final source-backed results"
          state={state.settledEvents > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="ACCURACY"
          value={pct(evaluation.accuracyAtHalf)}
          note={
            evaluation.count > 0
              ? `${evaluation.count} scored outcomes`
              : "Insufficient data"
          }
          state={evaluation.count > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="CALIBRATION ERROR"
          value={pct(evaluation.calibrationError)}
          note="Lower is better"
          state={evaluation.count > 0 ? "ready" : "pending"}
        />
      </div>

      {state.recentResults.length > 0 ? (
        <section className="history-results-block">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">SOURCE-BACKED</p>
              <h2>Settled results</h2>
            </div>
            <span className="empty-status">{state.recentResults.length} RECENT</span>
          </div>

          <div className="result-list">
            {state.recentResults.map((result) => (
              <article className="result-card" key={result.eventId}>
                <div className="result-meta">
                  <span>{result.sport.toUpperCase()}</span>
                  <span>{result.league}</span>
                  <span>{resultTime(result.observedAt)}</span>
                </div>

                <div className="result-match">
                  <div>
                    <strong>{result.home}</strong>
                    <span>HOME</span>
                  </div>

                  {result.status === "VOID" ? (
                    <b className="result-score void">VOID</b>
                  ) : (
                    <b className="result-score">
                      {result.homeScore ?? "—"} <i>:</i> {result.awayScore ?? "—"}
                    </b>
                  )}

                  <div className="result-away">
                    <strong>{result.away}</strong>
                    <span>AWAY</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {state.performance.sampleCount === 0 ? (
        <EmptyState
          status={state.available ? "INSUFFICIENT DATA" : "DATA OFFLINE"}
          title={
            state.available
              ? "No settled model sample exists yet."
              : "Historical evaluation unavailable."
          }
          description={
            state.message ??
            "Performance statistics require real stored model records and settled outcomes."
          }
        />
      ) : (
        <section className="security-note">
          <span className="empty-status">CALIBRATION</span>
          <h2>{state.performance.sampleCount} evaluated outcomes</h2>
          <p>
            Brier score: {evaluation.brierScore?.toFixed(4) ?? "—"} · Calibration
            error: {pct(evaluation.calibrationError)}. No performance statistic is
            displayed without settled source data.
          </p>
        </section>
      )}
    </MobileShell>
  );
}
