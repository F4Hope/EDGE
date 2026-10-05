import { EmptyState } from "@/components/EmptyState";
import { MetricPlaceholder } from "@/components/MetricPlaceholder";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getUiHistory } from "@/lib/data/uiHistory";

export const dynamic = "force-dynamic";

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function signed(value: number | null, digits = 3): string {
  if (value === null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}`;
}

export default async function ModelPage() {
  const state = await getUiHistory();
  const report = state.performance;
  const eventBenchmark = report.eventMarketBenchmark;

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="MODEL INTELLIGENCE"
        title="Performance"
        description="Calibration and accuracy are derived from settled records only. No unsupported strengths or weaknesses are claimed."
      />

      <div className="metric-grid">
        <MetricPlaceholder
          label="SAMPLE"
          value={String(report.sampleCount)}
          note="Settled scored outcomes"
          state={report.sampleCount > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="ACCURACY"
          value={pct(report.evaluation.accuracyAtHalf)}
          note="0.50 classification threshold"
          state={report.sampleCount > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="BRIER SCORE"
          value={
            report.evaluation.brierScore === null
              ? "—"
              : report.evaluation.brierScore.toFixed(3)
          }
          note="Probability error; lower is better"
          state={report.sampleCount > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="CALIBRATION"
          value={pct(report.evaluation.calibrationError)}
          note="Absolute calibration error"
          state={report.sampleCount > 0 ? "ready" : "pending"}
        />
      </div>

      <div className="metric-grid">
        <MetricPlaceholder
          label="PAIRED EVENTS"
          value={String(eventBenchmark.count)}
          note="Settled H2H markets scored once per event"
          state={eventBenchmark.count > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="EDGE EVENT BRIER"
          value={
            eventBenchmark.modelBrierScore === null
              ? "—"
              : eventBenchmark.modelBrierScore.toFixed(3)
          }
          note="Multiclass event-level probability error"
          state={eventBenchmark.count > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="MARKET EVENT BRIER"
          value={
            eventBenchmark.marketBrierScore === null
              ? "—"
              : eventBenchmark.marketBrierScore.toFixed(3)
          }
          note="Paired de-vigged market baseline"
          state={eventBenchmark.count > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="EVENT BRIER SKILL"
          value={pct(eventBenchmark.brierSkillScore)}
          note="Positive = improvement over market consensus"
          state={eventBenchmark.count > 0 ? "ready" : "pending"}
        />
      </div>

      <section className="split-card">
        <div>
          <span className="empty-status">PAIRED BRIER LIFT</span>
          <strong>{signed(eventBenchmark.brierDelta)}</strong>
          <p>
            {eventBenchmark.brierDeltaCi95
              ? `95% CI ${signed(eventBenchmark.brierDeltaCi95.lower)} to ${signed(eventBenchmark.brierDeltaCi95.upper)}`
              : "At least two paired settled events are required for a confidence interval."}
          </p>
        </div>
        <div>
          <span className="empty-status">VALIDATION SIGNAL</span>
          <strong>
            {eventBenchmark.positiveLiftSupported === true
              ? "POSITIVE"
              : eventBenchmark.positiveLiftSupported === false
                ? "UNPROVEN"
                : "PENDING"}
          </strong>
          <p>
            {eventBenchmark.positiveLiftSupported === true
              ? "The current 95% interval for event-level Brier improvement is entirely above zero."
              : "EDGE remains validation-gated until event-level market improvement is supported by settled evidence."}
          </p>
        </div>
      </section>

      <div className="metric-grid">
        <MetricPlaceholder
          label="EDGE TOP-1"
          value={pct(eventBenchmark.modelTop1Accuracy)}
          note="Highest-probability selection won"
          state={eventBenchmark.count > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="MARKET TOP-1"
          value={pct(eventBenchmark.marketTop1Accuracy)}
          note="Market favorite won"
          state={eventBenchmark.count > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="TOP-1 Δ"
          value={pct(eventBenchmark.accuracyDelta)}
          note="EDGE minus market top-1 accuracy"
          state={eventBenchmark.count > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="SELECTION BRIER"
          value={
            report.marketBenchmark.model.brierScore === null
              ? "—"
              : report.marketBenchmark.model.brierScore.toFixed(3)
          }
          note={`${report.marketBenchmark.count} paired selection outcomes`}
          state={report.marketBenchmark.count > 0 ? "ready" : "pending"}
        />
      </div>

      <section className="split-card">
        <div>
          <span className="empty-status">MOST EVIDENCE</span>
          <strong>{report.bySport[0]?.key ?? "—"}</strong>
          <p>
            {report.bySport[0]
              ? `${report.bySport[0].count} settled observations`
              : "No sport segment has enough settled evidence."}
          </p>
        </div>
        <div>
          <span className="empty-status">MODEL VERSION</span>
          <strong>{report.byModelVersion[0]?.key ?? "—"}</strong>
          <p>
            {report.byModelVersion[0]
              ? `${report.byModelVersion[0].count} evaluated observations`
              : "No evaluated model version exists yet."}
          </p>
        </div>
      </section>

      {report.sampleCount === 0 ? (
        <EmptyState
          status="INSUFFICIENT DATA"
          title="Performance starts with settled evidence."
          description="EDGE will not invent model strengths, weaknesses, accuracy, or calibration."
        />
      ) : null}
    </MobileShell>
  );
}
