import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { MetricPlaceholder } from "@/components/MetricPlaceholder";
import { MobileShell } from "@/components/MobileShell";
import { OddsTable } from "@/components/OddsTable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getUiEventById } from "@/lib/data/uiEvents";
import { getUiOddsForEvent } from "@/lib/data/uiOdds";

export const dynamic = "force-dynamic";

function formatStartTime(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [state, oddsState] = await Promise.all([
    getUiEventById(eventId),
    getUiOddsForEvent(eventId),
  ]);

  if (!state.event) {
    return (
      <MobileShell>
        <ScreenHeader
          eyebrow="EVENT ANALYSIS"
          title="Analysis unavailable"
          description="EDGE could not load this event from the normalized event database."
        />
        <EmptyState
          status={state.available ? "NOT FOUND" : "DATA OFFLINE"}
          title="No event analysis can be shown."
          description={state.message ?? "The event is unavailable."}
          action={<Link className="secondary-link" href="/events">BACK TO EVENTS →</Link>}
        />
      </MobileShell>
    );
  }

  const event = state.event;
  const quoteCount = oddsState.markets.reduce(
    (total, market) => total + market.quotes.length,
    0,
  );

  return (
    <MobileShell>
      <ScreenHeader
        eyebrow={event.sport.toUpperCase()}
        title={`${event.home ?? "TBD"} vs ${event.away ?? "TBD"}`}
        description={`${event.league} · ${formatStartTime(event.startsAt)}`}
        action={<span className="event-status">{event.status.replaceAll("_", " ")}</span>}
      />

      <section className="event-overview-card">
        <div className="overview-row"><span>LEAGUE</span><strong>{event.league}</strong></div>
        <div className="overview-row"><span>START</span><strong>{formatStartTime(event.startsAt)}</strong></div>
        <div className="overview-row"><span>SOURCE</span><strong>{event.provider}</strong></div>
        <div className="overview-row"><span>BETPAWA</span><strong>AVAILABILITY UNCONFIRMED</strong></div>
      </section>

      <section className="analysis-block">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">MARKET DATA</p>
            <h2>Current odds</h2>
          </div>
          <span className="count-badge">
            {oddsState.available
              ? `${quoteCount} QUOTES`
              : "UNAVAILABLE"}
          </span>
        </div>

        {oddsState.markets.length > 0 ? (
          <OddsTable markets={oddsState.markets} />
        ) : (
          <EmptyState
            status={oddsState.available ? "NO ODDS" : "DATA OFFLINE"}
            title={
              oddsState.available
                ? "No market snapshots stored."
                : "Odds database unavailable."
            }
            description={
              oddsState.message ??
              "Run the Phase 5 odds sync for this event window."
            }
          />
        )}
      </section>

      <section className="analysis-block">
        <div className="section-heading compact-heading">
          <div><p className="eyebrow">CORE INTELLIGENCE</p><h2>Decision metrics</h2></div>
          <span className="status-pill no-bet">NO BET</span>
        </div>
        <div className="metric-grid">
          <MetricPlaceholder
            label="MARKET / ODDS"
            value={oddsState.markets.length > 0 ? String(oddsState.markets.length) : "—"}
            note={
              oddsState.markets.length > 0
                ? `${quoteCount} current bookmaker quotes`
                : "No stored market quotes"
            }
            state={oddsState.markets.length > 0 ? "ready" : "pending"}
          />
          <MetricPlaceholder label="MODEL PROBABILITY" note="Models pending" />
          <MetricPlaceholder label="EDGE SCORE" note="Scoring pending" />
          <MetricPlaceholder label="ESTIMATED VALUE" note="Requires odds + model" />
          <MetricPlaceholder label="RISK" note="Risk engine pending" />
          <MetricPlaceholder label="MODEL AGREEMENT" note="Ensemble pending" />
        </div>
      </section>

      <section className="analysis-block">
        <p className="eyebrow">CONTEXT</p>
        <div className="analysis-list">
          <div><span>FORM</span><strong>Not calculated</strong></div>
          <div><span>STATISTICS</span><strong>Not calculated</strong></div>
          <div><span>INJURIES</span><strong>Not connected</strong></div>
          <div><span>NEWS</span><strong>Not connected</strong></div>
          <div>
            <span>ODDS HISTORY</span>
            <strong>
              {oddsState.markets.some((market) => market.snapshotCount > market.quotes.length)
                ? "Snapshots recording"
                : "Insufficient movement history"}
            </strong>
          </div>
        </div>
      </section>

      <section className="why-risk-grid">
        <article>
          <span className="empty-status">WHY</span>
          <h2>No recommendation generated.</h2>
          <p>
            Real market odds can now be stored and displayed, but odds alone are not
            evidence of value. EDGE still needs a model probability and downstream
            validation before recommending a selection.
          </p>
        </article>
        <article>
          <span className="empty-status">RISKS</span>
          <h2>Analysis incomplete.</h2>
          <p>
            Model evidence, injury/news checks, movement interpretation, risk scoring,
            and BetPawa availability are not yet available for this event.
          </p>
        </article>
      </section>

      <Link className="secondary-link block-link" href="/events">← BACK TO EVENTS</Link>
    </MobileShell>
  );
}
