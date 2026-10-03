import { EmptyState } from "@/components/EmptyState";
import { MetricPlaceholder } from "@/components/MetricPlaceholder";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function HistoryPage() {
  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="AUDIT TRAIL"
        title="History"
        description="Predictions and results will remain traceable by model version, market, risk, odds, and settlement."
      />

      <div className="metric-grid">
        <MetricPlaceholder label="PREDICTIONS" note="Not recorded yet" />
        <MetricPlaceholder label="SETTLED" note="Insufficient data" />
        <MetricPlaceholder label="ROI" note="Never fabricated" />
        <MetricPlaceholder label="CALIBRATION" note="Awaiting history" />
      </div>

      <EmptyState
        status="INSUFFICIENT DATA"
        title="No prediction history exists yet."
        description="Performance statistics will appear only after real predictions have been stored and settled. EDGE will never invent a win rate or ROI."
      />
    </MobileShell>
  );
}
