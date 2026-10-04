import type { FeatureVector } from "@/lib/features/types";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function restLabel(value: number | null): string {
  return value === null ? "UNKNOWN" : `${value.toFixed(1)} DAYS`;
}

export function FeatureReadiness({
  feature,
  computedAt,
}: {
  feature: FeatureVector;
  computedAt: string | null;
}) {
  return (
    <section className="feature-readiness-card">
      <div className="feature-readiness-head">
        <div>
          <span className="empty-status">FEATURE ENGINE</span>
          <h3>Data readiness</h3>
        </div>
        <strong>{percent(feature.quality.overall)}</strong>
      </div>

      <div className="feature-readiness-grid">
        <div>
          <span>HOME / A REST</span>
          <b>{restLabel(feature.temporal.home.restDays)}</b>
        </div>
        <div>
          <span>AWAY / B REST</span>
          <b>{restLabel(feature.temporal.away.restDays)}</b>
        </div>
        <div>
          <span>MARKETS</span>
          <b>{feature.market.marketCount}</b>
        </div>
        <div>
          <span>BOOKMAKERS</span>
          <b>{feature.market.bookmakerCount}</b>
        </div>
      </div>

      <div className="feature-coverage">
        <div>
          <span>AVAILABLE SPORT FEATURES</span>
          <strong>{feature.sportSpecific.available.length}</strong>
        </div>
        <div>
          <span>MISSING SPORT FEATURES</span>
          <strong>{feature.sportSpecific.missing.length}</strong>
        </div>
      </div>

      <p className="feature-missing">
        Missing: {feature.sportSpecific.missing.slice(0, 6).join(", ")}
        {feature.sportSpecific.missing.length > 6 ? "…" : ""}
      </p>

      {computedAt ? (
        <span className="feature-timestamp">
          Feature snapshot: {new Date(computedAt).toLocaleString("en")}
        </span>
      ) : null}
    </section>
  );
}
