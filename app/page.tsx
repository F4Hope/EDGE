import Link from "next/link";
import { EdgeScore } from "@/components/EdgeScore";
import { MobileShell } from "@/components/MobileShell";
import { getUiOpportunities } from "@/lib/data/uiOpportunities";
import { getUiPredictionSummary } from "@/lib/data/uiPredictions";
import type { SupportedSport } from "@/lib/providers/types";

const sports: Array<{
  key: SupportedSport;
  label: string;
  code: string;
}> = [
  { key: "football", label: "Football", code: "FT" },
  { key: "basketball", label: "Basketball", code: "BK" },
  { key: "tennis", label: "Tennis", code: "TN" },
];

function marketLabel(key: string): string {
  if (key === "h2h") return "Match winner";
  if (key === "totals") return "Total";
  if (key === "spreads") return "Handicap";
  if (key === "double_chance") return "Double chance";
  return key.replaceAll("_", " ");
}

function matchup(home: string | null, away: string | null): string {
  return `${home ?? "Participant"} vs ${away ?? "Participant"}`;
}

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [predictionState, opportunityState] = await Promise.all([
    getUiPredictionSummary(),
    getUiOpportunities({ hours: 168, limit: 50 }),
  ]);

  const top = opportunityState.opportunities[0] ?? null;
  const score = top?.edgeScore ?? 0;
  const status = top?.status ?? "NO BET";

  return (
    <MobileShell>
      <section className="hero-section" aria-labelledby="todays-edge-title">
        <div className="eyebrow-row">
          <p className="eyebrow" id="todays-edge-title">TODAY&apos;S EDGE</p>
          <span className="data-state"><i /> PRE-LIVE</span>
        </div>

        <article className="hero-card">
          <div className="hero-card-topline">
            <span>MARKET INTELLIGENCE</span>
            <span>01</span>
          </div>

          <div className="hero-content">
            <EdgeScore score={score} status={status} />

            <div className="hero-copy">
              <p className="hero-overline">
                {top ? "QUALIFIED EDGE FOUND" : "DATA GATE ACTIVE"}
              </p>
              <h1>
                {top
                  ? matchup(top.home, top.away)
                  : predictionState.count > 0
                    ? "Baseline forecasts are live."
                    : "Prediction engine is connected."}
              </h1>
              <p className="hero-description">
                {top
                  ? `${marketLabel(top.marketKey)} · ${top.selectionName} @ ${top.bestDecimalOdds.toFixed(2)} · ${top.league}. EDGE score is a quality/ranking composite, not a win probability.`
                  : "No future selection currently passes every opportunity gate. EDGE keeps researching prices and independent evidence instead of manufacturing a pick."}
              </p>

              <div className="metric-strip" aria-label="Current analysis state">
                <div>
                  <span>EVENTS</span>
                  <strong>{predictionState.futureEventCount} UPCOMING</strong>
                </div>
                <div>
                  <span>ODDS</span>
                  <strong>{predictionState.pricedEventCount} PRICED</strong>
                </div>
                <div>
                  <span>MODEL</span>
                  <strong>
                    {predictionState.count > 0
                      ? `${predictionState.count} FORECASTS`
                      : "READY"}
                  </strong>
                </div>
              </div>

              <Link className="primary-link" href="/opportunities">
                VIEW OPPORTUNITIES <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </article>
      </section>

      <section className="opportunities-section" aria-labelledby="top-opportunities-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">INTELLIGENCE QUEUE</p>
            <h2 id="top-opportunities-title">Top opportunities</h2>
          </div>
          <span className="count-badge">
            {opportunityState.qualifiedPredictions} QUALIFIED
          </span>
        </div>

        <div className="opportunity-rail">
          {sports.map((sport) => {
            const pick = opportunityState.opportunities.find(
              (item) => item.sport === sport.key,
            );

            return (
              <Link
                className="opportunity-card"
                key={sport.key}
                href={`/opportunities?sport=${sport.key}`}
              >
                <div className="sport-code">{sport.code}</div>
                <div className="opportunity-copy">
                  <span>{sport.label}</span>
                  <strong>
                    {pick ? pick.selectionName : "No qualified opportunity"}
                  </strong>
                  <p>
                    {pick
                      ? `${matchup(pick.home, pick.away)} · ${marketLabel(pick.marketKey)} @ ${pick.bestDecimalOdds.toFixed(2)}`
                      : "No selection passes all current gates"}
                  </p>
                </div>
                <div className="card-score">{pick?.edgeScore ?? "—"}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="principle-card" aria-label="EDGE operating principle">
        <span className="principle-index">EDGE / 001</span>
        <p>QUALITY FIRST.</p>
        <p>DATA FIRST.</p>
        <p className="muted-line">DISCIPLINE FIRST.</p>
        <span className="principle-note">No evidence. No bet.</span>
      </section>
    </MobileShell>
  );
}
