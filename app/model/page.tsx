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

function signedPct(value: number | null): string {
  if (value === null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${(value * 100).toFixed(1)}%`;
}

export default async function ModelPage() {
  const state = await getUiHistory();
  const report = state.performance;
  const confidence60 =
    report.confidenceThresholds.find(
      (row) => Math.abs(row.minProbability - 0.6) < 1e-9,
    ) ?? null;
  const confidence70 =
    report.confidenceThresholds.find(
      (row) => Math.abs(row.minProbability - 0.7) < 1e-9,
    ) ?? null;
  const confidence80 =
    report.confidenceThresholds.find(
      (row) => Math.abs(row.minProbability - 0.8) < 1e-9,
    ) ?? null;

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

      <section className="security-note">
        <span className="empty-status">HIGH-CONFIDENCE AUDIT</span>
        <h2>Do 60%+ forecasts win like 60%+ forecasts?</h2>
        <p>
          EDGE separately audits the probability tiers used by Picks and Weekly
          Combo. Observed win rate should converge toward the average forecast as
          the settled sample grows.
        </p>
      </section>

      <div className="metric-grid">
        <MetricPlaceholder
          label="60%+ SAMPLE"
          value={String(confidence60?.count ?? 0)}
          note="Settled predictions at or above 60%"
          state={(confidence60?.count ?? 0) > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="60%+ HIT RATE"
          value={pct(confidence60?.observedRate ?? null)}
          note="Observed wins in the 60%+ tier"
          state={(confidence60?.count ?? 0) > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="60%+ AVG FORECAST"
          value={pct(confidence60?.averageProbability ?? null)}
          note="Mean model probability in the tier"
          state={(confidence60?.count ?? 0) > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="60%+ CALIBRATION GAP"
          value={signedPct(confidence60?.calibrationGap ?? null)}
          note="Observed win rate minus average forecast"
          state={(confidence60?.count ?? 0) > 0 ? "ready" : "pending"}
        />
      </div>

      <section className="split-card">
        <div>
          <span className="empty-status">70%+ TIER</span>
          <strong>{confidence70?.count ?? 0} settled</strong>
          <p>
            Hit rate {pct(confidence70?.observedRate ?? null)} · forecast{" "}
            {pct(confidence70?.averageProbability ?? null)} · gap{" "}
            {signedPct(confidence70?.calibrationGap ?? null)}
          </p>
        </div>
        <div>
          <span className="empty-status">80%+ TIER</span>
          <strong>{confidence80?.count ?? 0} settled</strong>
          <p>
            Hit rate {pct(confidence80?.observedRate ?? null)} · forecast{" "}
            {pct(confidence80?.averageProbability ?? null)} · gap{" "}
            {signedPct(confidence80?.calibrationGap ?? null)}
          </p>
        </div>
      </section>

      <div className="metric-grid">
        <MetricPlaceholder
          label="MARKET BRIER"
          value={
            report.marketBenchmark.market.brierScore === null
              ? "—"
              : report.marketBenchmark.market.brierScore.toFixed(3)
          }
          note={`${report.marketBenchmark.count} paired settled selections`}
          state={report.marketBenchmark.count > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="BRIER Δ"
          value={signed(report.marketBenchmark.brierDelta)}
          note="Positive means EDGE beat market baseline"
          state={report.marketBenchmark.count > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="BRIER SKILL"
          value={pct(report.marketBenchmark.brierSkillScore)}
          note="Positive = improvement over market consensus"
          state={report.marketBenchmark.count > 0 ? "ready" : "pending"}
        />
        <MetricPlaceholder
          label="CALIBRATION Δ"
          value={pct(report.marketBenchmark.calibrationDelta)}
          note="Positive means lower calibration error than market"
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
