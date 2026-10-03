import { EmptyState } from "@/components/EmptyState";
import { MetricPlaceholder } from "@/components/MetricPlaceholder";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function ModelPage() {
  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="MODEL INTELLIGENCE"
        title="Performance"
        description="A future audit surface for calibration, strengths, weaknesses, and model-version performance."
      />

      <div className="metric-grid">
        <MetricPlaceholder label="ACCURACY" note="Insufficient data" />
        <MetricPlaceholder label="CALIBRATION" note="Insufficient data" />
        <MetricPlaceholder label="CLOSING LINE VALUE" note="Odds phase pending" />
        <MetricPlaceholder label="MODEL AGREEMENT" note="Models pending" />
      </div>

      <section className="split-card">
        <div>
          <span className="empty-status">MODEL STRENGTHS</span>
          <strong>—</strong>
          <p>No statistically supported strengths can be claimed yet.</p>
        </div>
        <div>
          <span className="empty-status">MODEL WEAKNESSES</span>
          <strong>—</strong>
          <p>No statistically supported weaknesses can be measured yet.</p>
        </div>
      </section>

      <EmptyState
        status="INSUFFICIENT DATA"
        title="Performance starts with evidence."
        description="EDGE will populate this page after prediction models, settled results, and backtesting data exist."
      />
    </MobileShell>
  );
}
