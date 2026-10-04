import { EmptyState } from "@/components/EmptyState";
import { MetricPlaceholder } from "@/components/MetricPlaceholder";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getUiHistory } from "@/lib/data/uiHistory";

export const dynamic = "force-dynamic";

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export default async function ModelPage() {
  const state = await getUiHistory();
  const report = state.performance;

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
