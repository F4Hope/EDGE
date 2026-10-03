import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function OpportunitiesPage() {
  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="RANKED INTELLIGENCE"
        title="Picks"
        description="Only opportunities that pass probability, value, risk, data-quality, and availability checks will appear here."
        action={<span className="status-pill no-bet">NO BET</span>}
      />

      <div className="filter-rail" aria-label="Opportunity filters">
        <span className="filter-chip active">ALL</span>
        <span className="filter-chip disabled-chip">FOOTBALL</span>
        <span className="filter-chip disabled-chip">BASKETBALL</span>
        <span className="filter-chip disabled-chip">TENNIS</span>
      </div>

      <section className="readiness-card">
        <span className="empty-status">PIPELINE READINESS</span>
        <div className="data-ladder">
          <div className="ladder-row ready"><span>01</span><strong>EVENT DATA</strong><em>READY</em></div>
          <div className="ladder-row"><span>02</span><strong>MARKET ODDS</strong><em>PHASE 5</em></div>
          <div className="ladder-row"><span>03</span><strong>FEATURES + MODELS</strong><em>PENDING</em></div>
          <div className="ladder-row"><span>04</span><strong>EDGE + RISK</strong><em>PENDING</em></div>
          <div className="ladder-row"><span>05</span><strong>BETPAWA CHECK</strong><em>UNCONFIRMED</em></div>
        </div>
      </section>

      <EmptyState
        status="NO BET"
        title="No ranked opportunities yet."
        description="EDGE will not turn raw events into picks. Odds, probability, estimated value, scoring, and risk gates must exist first."
        action={<Link className="secondary-link" href="/events">BROWSE RAW EVENTS →</Link>}
      />
    </MobileShell>
  );
}
