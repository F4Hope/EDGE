import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getSystemReadiness } from "@/lib/system/readiness";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const readiness = await getSystemReadiness();

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="SYSTEM READINESS"
        title="Status"
        description="A live readiness view for configuration, database reachability, stored data, and enabled analytical capabilities."
        action={
          <span
            className={
              readiness.overall === "READY"
                ? "status-pill"
                : "status-pill no-bet"
            }
          >
            {readiness.overall}
          </span>
        }
      />

      <section className="readiness-matrix">
        {readiness.checks.map((check) => (
          <article className="readiness-row" key={check.key}>
            <div>
              <span className={`readiness-level ${check.level.toLowerCase()}`}>
                {check.level}
              </span>
              <strong>{check.label}</strong>
            </div>
            <p>{check.detail}</p>
          </article>
        ))}
      </section>

      {readiness.counts ? (
        <section className="analysis-block">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">DATABASE</p>
              <h2>Stored evidence</h2>
            </div>
          </div>

          <div className="metric-grid">
            <div className="metric-placeholder">
              <span className="metric-placeholder-label">EVENTS</span>
              <strong>{readiness.counts.events}</strong>
              <span className="metric-note ready">Normalized records</span>
            </div>
            <div className="metric-placeholder">
              <span className="metric-placeholder-label">ODDS SNAPSHOTS</span>
              <strong>{readiness.counts.oddsSnapshots}</strong>
              <span className="metric-note ready">Bookmaker history</span>
            </div>
            <div className="metric-placeholder">
              <span className="metric-placeholder-label">FEATURES</span>
              <strong>{readiness.counts.features}</strong>
              <span className="metric-note ready">Model-input snapshots</span>
            </div>
            <div className="metric-placeholder">
              <span className="metric-placeholder-label">RESULTS</span>
              <strong>{readiness.counts.results}</strong>
              <span className="metric-note ready">Audit records</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="security-note">
        <span className="empty-status">CAPABILITIES</span>
        <h2>Evidence first.</h2>
        <p>
          Event ingestion: {readiness.capabilities.eventIngestion ? "ready" : "not configured"} ·
          Odds ingestion: {readiness.capabilities.oddsIngestion ? "ready" : "not configured"} ·
          Result ingestion: {readiness.capabilities.resultIngestion ? "ready" : "not configured"} ·
          Feature engine: {readiness.capabilities.featureEngine ? "ready" : "waiting"} ·
          Movement diagnostics: {readiness.capabilities.movementDiagnostics ? "ready" : "waiting"}.
        </p>
      </section>
    </MobileShell>
  );
}
