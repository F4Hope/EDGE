import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { FeatureReadiness } from "@/components/FeatureReadiness";
import { IntelligencePanel } from "@/components/IntelligencePanel";
import { MovementPanel } from "@/components/MovementPanel";
import { MetricPlaceholder } from "@/components/MetricPlaceholder";
import { MobileShell } from "@/components/MobileShell";
import { OddsTable } from "@/components/OddsTable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getUiEventById } from "@/lib/data/uiEvents";
import { getUiOddsForEvent } from "@/lib/data/uiOdds";
import { getUiFeatureForEvent } from "@/lib/data/uiFeatures";
import { getUiIntelligenceForEvent } from "@/lib/data/uiIntelligence";
import { getUiMovementForEvent } from "@/lib/data/uiMovement";
import { getUiPredictionsForEvent } from "@/lib/data/uiPredictions";

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
  const [
    state,
    oddsState,
    featureState,
    intelligenceState,
    movementState,
    predictionState,
  ] = await Promise.all([
      getUiEventById(eventId),
      getUiOddsForEvent(eventId),
      getUiFeatureForEvent(eventId),
      getUiIntelligenceForEvent(eventId),
      getUiMovementForEvent(eventId),
      getUiPredictionsForEvent(eventId),
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
  const primaryPrediction = predictionState.predictions[0] ?? null;

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
          <div>
            <p className="eyebrow">FEATURE ENGINE</p>
            <h2>Model input readiness</h2>
          </div>
          <span className="count-badge">
            {featureState.feature
              ? `${Math.round(featureState.feature.quality.overall * 100)}% QUALITY`
              : "NOT CALCULATED"}
          </span>
        </div>

        {featureState.feature ? (
          <FeatureReadiness
            feature={featureState.feature}
            computedAt={featureState.computedAt}
          />
        ) : (
          <EmptyState
            status={featureState.available ? "NOT CALCULATED" : "DATA OFFLINE"}
            title={
              featureState.available
                ? "Feature vector not generated yet."
                : "Feature engine data unavailable."
            }
            description={
              featureState.message ??
              "Run the Phase 6 feature calculation for this event."
            }
          />
        )}
      </section>

      <section className="analysis-block">
        <div className="section-heading compact-heading">
          <div><p className="eyebrow">CORE INTELLIGENCE</p><h2>Decision metrics</h2></div>
          <span
            className={`status-pill ${
              !primaryPrediction || primaryPrediction.status === "NO_BET"
                ? "no-bet"
                : ""
            }`}
          >
            {primaryPrediction
              ? primaryPrediction.status.replaceAll("_", " ")
              : "NO BET"}
          </span>
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
          <MetricPlaceholder
            label="MODEL PROBABILITY"
            value={
              primaryPrediction
                ? `${(primaryPrediction.modelProbability * 100).toFixed(1)}%`
                : "—"
            }
            note={
              primaryPrediction
                ? primaryPrediction.selectionName
                : predictionState.message ?? "Prediction not generated"
            }
            state={primaryPrediction ? "ready" : "pending"}
          />
          <MetricPlaceholder
            label="EDGE SCORE"
            value={
              primaryPrediction?.edgeScore === null ||
              primaryPrediction?.edgeScore === undefined
                ? "—"
                : String(primaryPrediction.edgeScore)
            }
            note="Validation-gated in baseline model"
            state={primaryPrediction ? "unconfirmed" : "pending"}
          />
          <MetricPlaceholder
            label="ESTIMATED VALUE"
            value={
              primaryPrediction?.estimatedValue === null ||
              primaryPrediction?.estimatedValue === undefined
                ? "—"
                : `${(primaryPrediction.estimatedValue * 100).toFixed(1)}%`
            }
            note="Model probability × best stored odds − 1"
            state={primaryPrediction ? "ready" : "pending"}
          />
          <MetricPlaceholder
            label="RISK"
            value={primaryPrediction?.risk ?? "—"}
            note="Evidence quality + bookmaker breadth"
            state={primaryPrediction ? "ready" : "pending"}
          />
          <MetricPlaceholder
            label="MODEL AGREEMENT"
            value={
              primaryPrediction?.modelAgreement === null ||
              primaryPrediction?.modelAgreement === undefined
                ? "—"
                : `${(primaryPrediction.modelAgreement * 100).toFixed(1)}%`
            }
            note="Agreement with de-vigged market anchor"
            state={primaryPrediction ? "ready" : "pending"}
          />
        </div>
      </section>

      <section className="analysis-block">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">PHASE 7 FORECAST</p>
            <h2>Market-evidence probabilities</h2>
          </div>
          <span className="count-badge">
            {predictionState.predictions.length} OUTPUTS
          </span>
        </div>

        {predictionState.predictions.length > 0 ? (
          <div className="analysis-list">
            {predictionState.predictions.map((prediction) => (
              <div key={prediction.id}>
                <span>{prediction.selectionName}</span>
                <strong>
                  {(prediction.modelProbability * 100).toFixed(1)}% ·{" "}
                  {prediction.status.replaceAll("_", " ")}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            status={predictionState.available ? "NOT GENERATED" : "DATA OFFLINE"}
            title="No model probability is stored for this event."
            description={
              predictionState.message ??
              "Run the Phase 7 prediction generator after odds and feature calculation."
            }
          />
        )}
      </section>

      <section className="analysis-block">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">NEWS / AVAILABILITY CONTEXT</p>
            <h2>Intelligence signals</h2>
          </div>
          <span className="count-badge">
            {intelligenceState.signals.length} ACTIVE
          </span>
        </div>

        {intelligenceState.signals.length > 0 ? (
          <IntelligencePanel signals={intelligenceState.signals} />
        ) : (
          <EmptyState
            status={intelligenceState.available ? "NO SIGNALS" : "DATA OFFLINE"}
            title={
              intelligenceState.available
                ? "No active intelligence signals."
                : "Intelligence data unavailable."
            }
            description={
              intelligenceState.message ??
              "Import verified injury, suspension, lineup, withdrawal, weather, or schedule information when available."
            }
          />
        )}
      </section>

      <section className="analysis-block">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">MARKET DIAGNOSTICS</p>
            <h2>Odds movement</h2>
          </div>
          <span className="count-badge">
            {movementState.markets.filter((market) => market.summary.flagged).length} FLAGGED
          </span>
        </div>

        {movementState.markets.some(
          (market) => market.summary.movements.length > 0,
        ) ? (
          <MovementPanel markets={movementState.markets} />
        ) : (
          <EmptyState
            status={movementState.available ? "INSUFFICIENT HISTORY" : "DATA OFFLINE"}
            title={
              movementState.available
                ? "More snapshots are required."
                : "Movement diagnostics unavailable."
            }
            description={
              movementState.message ??
              "Repeated odds snapshots are required before movement can be described."
            }
          />
        )}
      </section>

      <section className="analysis-block">
        <p className="eyebrow">CONTEXT</p>
        <div className="analysis-list">
          <div><span>FORM</span><strong>Not calculated</strong></div>
          <div><span>STATISTICS</span><strong>Not calculated</strong></div>
          <div>
            <span>INJURIES / NEWS</span>
            <strong>
              {intelligenceState.signals.length > 0
                ? `${intelligenceState.signals.length} active signals`
                : "No active records"}
            </strong>
          </div>
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
          <h2>
            {primaryPrediction
              ? "Baseline probability generated."
              : "No recommendation generated."}
          </h2>
          <p>
            {primaryPrediction
              ? "EDGE now generates a transparent market-anchored probability using pre-event odds plus bounded form, head-to-head, and rest evidence. The baseline remains WATCH/NO BET until settled forward performance supports a stronger decision gate."
              : "Real market odds can now be stored and displayed, but a prediction must be generated before downstream validation can begin."}
          </p>
        </article>
        <article>
          <span className="empty-status">RISKS</span>
          <h2>Validation still required.</h2>
          <p>
            The Phase 7 baseline does not enable BETTABLE status. Settled outcomes,
            calibration, injury/news checks, movement interpretation, and bookmaker
            availability still determine whether later model versions can graduate.
          </p>
        </article>
      </section>

      <Link className="secondary-link block-link" href="/events">← BACK TO EVENTS</Link>
    </MobileShell>
  );
}
