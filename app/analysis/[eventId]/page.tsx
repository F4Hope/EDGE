import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { FeatureReadiness } from "@/components/FeatureReadiness";
import { IntelligencePanel } from "@/components/IntelligencePanel";
import { MovementPanel } from "@/components/MovementPanel";
import { MetricPlaceholder } from "@/components/MetricPlaceholder";
import { MobileShell } from "@/components/MobileShell";
import { OddsTable } from "@/components/OddsTable";
import { PredictionDecisionSummary } from "@/components/PredictionDecisionSummary";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getUiEventById } from "@/lib/data/uiEvents";
import { getUiOddsForEvent } from "@/lib/data/uiOdds";
import { getUiFeatureForEvent } from "@/lib/data/uiFeatures";
import { getUiIntelligenceForEvent } from "@/lib/data/uiIntelligence";
import { getUiMovementForEvent } from "@/lib/data/uiMovement";
import {
  getUiPredictionsForEvent,
  pickPrimaryPrediction,
} from "@/lib/data/uiPredictions";

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

function formContext(
  sampleSize: number,
  winRate: number | null,
): string {
  if (sampleSize === 0 || winRate === null) return "Insufficient sample";
  return `${sampleSize} matches · ${Math.round(winRate * 100)}% wins`;
}

function restContext(value: number | null): string {
  return value === null ? "Unknown" : `${value.toFixed(1)} days`;
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
  const primaryPrediction = pickPrimaryPrediction(predictionState.predictions);

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

      <section className="analysis-block analysis-decision-block">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">DECISION SUMMARY</p>
            <h2>Model view</h2>
          </div>
          <span className="count-badge">
            {primaryPrediction ? "ANALYZED" : "PENDING"}
          </span>
        </div>

        {primaryPrediction ? (
          <PredictionDecisionSummary prediction={primaryPrediction} />
        ) : (
          <EmptyState
            status={predictionState.available ? "ANALYSIS PENDING" : "DATA OFFLINE"}
            title={
              oddsState.markets.length > 0
                ? featureState.feature
                  ? "Prediction generation is pending."
                  : "Odds are ready; features are pending."
                : "Market evidence is not ready."
            }
            description={
              predictionState.message ??
              "EDGE needs a pre-event feature vector and stored H2H odds before it can produce a model view."
            }
          />
        )}
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
                  {prediction.bestDecimalOdds
                    ? `${prediction.bestDecimalOdds.toFixed(2)} odds · `
                    : ""}
                  {prediction.estimatedValue === null
                    ? ""
                    : `${(prediction.estimatedValue * 100).toFixed(1)}% EV · `}
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
          <div>
            <span>HOME FORM</span>
            <strong>
              {featureState.feature
                ? formContext(
                    featureState.feature.form.home.sampleSize,
                    featureState.feature.form.home.winRate,
                  )
                : "Not calculated"}
            </strong>
          </div>
          <div>
            <span>AWAY FORM</span>
            <strong>
              {featureState.feature
                ? formContext(
                    featureState.feature.form.away.sampleSize,
                    featureState.feature.form.away.winRate,
                  )
                : "Not calculated"}
            </strong>
          </div>
          <div>
            <span>HEAD TO HEAD</span>
            <strong>
              {featureState.feature
                ? featureState.feature.headToHead.sampleSize > 0
                  ? `${featureState.feature.headToHead.sampleSize} settled meetings`
                  : "No settled sample"
                : "Not calculated"}
            </strong>
          </div>
          <div>
            <span>REST</span>
            <strong>
              {featureState.feature
                ? `${restContext(featureState.feature.temporal.home.restDays)} / ${restContext(featureState.feature.temporal.away.restDays)}`
                : "Not calculated"}
            </strong>
          </div>
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
              ? "Leading model view generated."
              : "No model view generated."}
          </h2>
          <p>
            {primaryPrediction
              ? "EDGE ranks the current market selections using pre-event odds plus bounded form, head-to-head and rest evidence. The displayed leading view is chosen by decision quality and estimated value rather than raw favorite probability alone."
              : "Real market odds can be displayed before model output exists, but a pre-event feature vector and prediction are required for the decision summary."}
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
