import { MobileShell } from "@/components/MobileShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getSystemReadiness } from "@/lib/system/readiness";
import { describeFreshness } from "@/lib/system/freshness";

export const dynamic = "force-dynamic";

function ageLabel(ageMinutes: number | null): string {
  if (ageMinutes === null) return "No data";
  if (ageMinutes < 60) return ageMinutes + "m ago";
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 48) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

export default async function StatusPage() {
  const readiness = await getSystemReadiness();
  const now = new Date();
  const freshness = readiness.freshness
    ? [
        {
          key: "events",
          label: "EVENT DATA",
          timestamp: readiness.freshness.events,
          descriptor: describeFreshness(readiness.freshness.events, now, 180, 1440),
        },
        {
          key: "odds",
          label: "ODDS",
          timestamp: readiness.freshness.odds,
          descriptor: describeFreshness(readiness.freshness.odds, now, 30, 180),
        },
        {
          key: "features",
          label: "FEATURES",
          timestamp: readiness.freshness.features,
          descriptor: describeFreshness(readiness.freshness.features, now, 360, 1440),
        },
        {
          key: "results",
          label: "RESULTS",
          timestamp: readiness.freshness.results,
          descriptor: describeFreshness(readiness.freshness.results, now, 720, 2880),
        },
        {
          key: "intelligence",
          label: "INTELLIGENCE",
          timestamp: readiness.freshness.intelligence,
          descriptor: describeFreshness(readiness.freshness.intelligence, now, 480, 1440),
        },
        {
          key: "injury-sync",
          label: "INJURY SYNC",
          timestamp: readiness.freshness.injurySync,
          descriptor: describeFreshness(readiness.freshness.injurySync, now, 360, 720),
        },
      ]
    : [];

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

      {freshness.length > 0 ? (
        <section className="analysis-block">
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">OBSERVABILITY</p>
              <h2>Data freshness</h2>
            </div>
          </div>

          <div className="freshness-grid">
            {freshness.map((item) => (
              <article className="freshness-card" key={item.key}>
                <div>
                  <span>{item.label}</span>
                  <b className={"freshness-state " + item.descriptor.state.toLowerCase()}>
                    {item.descriptor.state}
                  </b>
                </div>
                <strong>{ageLabel(item.descriptor.ageMinutes)}</strong>
                <small>
                  {item.timestamp
                    ? new Date(item.timestamp).toLocaleString("en", {
                        timeZone: "UTC",
                        timeZoneName: "short",
                      })
                    : "No stored observation"}
                </small>
              </article>
            ))}
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
          Intelligence ingestion: {readiness.capabilities.intelligenceIngestion ? "ready" : "not configured"} ·
          Feature engine: {readiness.capabilities.featureEngine ? "ready" : "waiting"} ·
          Movement diagnostics: {readiness.capabilities.movementDiagnostics ? "ready" : "waiting"}.
        </p>
      </section>
    </MobileShell>
  );
}
