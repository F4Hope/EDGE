import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { MobileShell } from "@/components/MobileShell";
import { OpportunityCard } from "@/components/OpportunityCard";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getUiOpportunities } from "@/lib/data/uiOpportunities";
import {
  supportedSports,
  type SupportedSport,
} from "@/lib/providers/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseSport(value: string | undefined): SupportedSport | undefined {
  if (!value) return undefined;
  return supportedSports.includes(value as SupportedSport)
    ? (value as SupportedSport)
    : undefined;
}

function opportunitiesHref(sport?: SupportedSport): string {
  return sport ? `/opportunities?sport=${sport}` : "/opportunities";
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const sport = parseSport(first(params.sport));
  const state = await getUiOpportunities({
    sport,
    hours: 72,
    limit: 30,
  });

  const lowRiskCount = state.opportunities.filter(
    (item) => item.risk === "LOW",
  ).length;

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow="RANKED INTELLIGENCE"
        title="Opportunities"
        description="Future model outputs ranked by decision quality after odds, value, risk, data-quality, and agreement gates. The current baseline remains validation-gated."
        action={
          <span
            className={
              state.opportunities.length > 0
                ? "status-pill"
                : "status-pill no-bet"
            }
          >
            {state.opportunities.length > 0
              ? `${state.opportunities.length} WATCH`
              : "NO BET"}
          </span>
        }
      />

      <div className="filter-rail" aria-label="Opportunity filters">
        <Link
          className={!sport ? "filter-chip active" : "filter-chip"}
          href={opportunitiesHref()}
        >
          ALL
        </Link>
        {supportedSports.map((item) => (
          <Link
            key={item}
            className={sport === item ? "filter-chip active" : "filter-chip"}
            href={opportunitiesHref(item)}
          >
            {item.toUpperCase()}
          </Link>
        ))}
      </div>

      <section className="opportunity-readiness">
        <div>
          <span>QUALIFIED SELECTIONS</span>
          <strong>{state.qualifiedPredictions}</strong>
          <small>Before one-per-event ranking</small>
        </div>
        <div>
          <span>RANKED EVENTS</span>
          <strong>{state.opportunities.length}</strong>
          <small>Future events passing gates</small>
        </div>
        <div>
          <span>LOW RISK</span>
          <strong>{lowRiskCount}</strong>
          <small>Within the current model rubric</small>
        </div>
      </section>

      <section className="readiness-card">
        <span className="empty-status">OPPORTUNITY GATES</span>
        <div className="data-ladder">
          <div className="ladder-row ready">
            <span>01</span><strong>EVENT + H2H ODDS</strong><em>REQUIRED</em>
          </div>
          <div className="ladder-row ready">
            <span>02</span><strong>FEATURE VECTOR</strong><em>≥ 50% QUALITY</em>
          </div>
          <div className="ladder-row ready">
            <span>03</span><strong>MODEL AGREEMENT</strong><em>≥ 60%</em>
          </div>
          <div className="ladder-row ready">
            <span>04</span><strong>ESTIMATED VALUE</strong><em>POSITIVE</em>
          </div>
          <div className="ladder-row">
            <span>05</span><strong>BETPAWA CHECK</strong><em>UNCONFIRMED</em>
          </div>
        </div>
      </section>

      <section className="list-section opportunities-list-section">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">MODEL WATCHLIST</p>
            <h2>
              {sport
                ? `${sport[0].toUpperCase() + sport.slice(1)} opportunities`
                : "Ranked opportunities"}
            </h2>
          </div>
          <span className="count-badge">
            {state.available
              ? `${state.opportunities.length} FOUND`
              : "UNAVAILABLE"}
          </span>
        </div>

        {state.opportunities.length > 0 ? (
          <>
            <div className="opportunity-list">
              {state.opportunities.map((opportunity, index) => (
                <OpportunityCard
                  key={opportunity.predictionId}
                  opportunity={opportunity}
                  rank={index + 1}
                />
              ))}
            </div>
            <p className="opportunity-methodology">
              Ranking order: model status, lower risk, estimated value, model
              agreement, data quality, then model probability. One selection is
              shown per event. Current outputs remain analytical WATCH results
              unless a future validated model explicitly enables BETTABLE.
            </p>
          </>
        ) : (
          <EmptyState
            status={state.available ? "NO BET" : "DATA OFFLINE"}
            title={
              state.available
                ? "No model output passes the opportunity gates."
                : "Opportunity data is unavailable."
            }
            description={
              state.message ??
              "EDGE needs a future event with H2H odds, a current feature vector, and a qualified model output before it will rank an opportunity."
            }
            action={
              <Link className="secondary-link" href="/events">
                BROWSE EVENTS →
              </Link>
            }
          />
        )}
      </section>
    </MobileShell>
  );
}
