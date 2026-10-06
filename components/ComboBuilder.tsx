"use client";

import { useState } from "react";

const targets = [2, 5, 10, 20, 50, 100, 1000] as const;
const risks = ["LOW", "BALANCED", "AGGRESSIVE"] as const;

type Target = (typeof targets)[number];
type Risk = (typeof risks)[number];

type ComboLeg = {
  predictionId: string;
  eventId: string;
  sport: string;
  league: string;
  startsAt: string;
  matchup: string;
  marketKey: string;
  point: number | null;
  selectionKey: string;
  selectionName: string;
  decimalOdds: number;
  modelProbability: number;
  estimatedValue: number | null;
  dataQuality: number | null;
  modelAgreement: number | null;
  risk: "LOW" | "MEDIUM" | "HIGH";
  status: "BETTABLE" | "WATCH" | "HIGH_RISK" | "NO_BET";
  bookmakerName?: string | null;
  oddsProvider?: string | null;
  marketProbability?: number | null;
  modelLift?: number | null;
  evidenceSupport?: number | null;
};

type ComboEvidenceSignal = {
  type: string;
  severity: string;
  source: string;
  headline: string;
  affectsHome: boolean | null;
  affectsAway: boolean | null;
  participant: string | null;
};

type ComboEvidenceResearchCandidate = {
  predictionId: string;
  eventId: string;
  sport: string;
  league: string;
  startsAt: string;
  matchup: string;
  marketKey: string;
  point: number | null;
  selectionName: string;
  decimalOdds: number;
  modelProbability: number;
  marketProbability: number;
  estimatedValue: number;
  bookmakerName: string | null;
  oddsProvider: string;
  intelligenceSignals: ComboEvidenceSignal[];
};

type ComboCandidateDiagnostics = {
  queriedPredictions: number;
  latestPredictions: number;
  duplicatesCollapsed: number;
  missingStoredOdds: number;
  nonPositiveEstimatedValue: number;
  belowEstimatedValueFloor: number;
  missingMarketProbability: number;
  missingIndependentEvidence: number;
  evidenceResearchCandidates: number;
  evidenceResearchWithActiveIntelligence: number;
  insufficientModelMarketLift: number;
  qualifiedCandidates: number;
};

type ComboResult = {
  status: "TARGET_REACHED" | "BEST_EFFORT" | "NO_QUALIFYING_COMBO";
  targetOdds: number;
  riskMode: Risk;
  actualOdds: number | null;
  estimatedProbability: number | null;
  estimatedValue: number | null;
  diversificationScore: number | null;
  targetReached: boolean;
  legs: ComboLeg[];
  candidateCount: number;
  message: string;
  methodology: string;
};

type ApiResponse = {
  data?: ComboResult;
  meta?: {
    candidateDiagnostics?: ComboCandidateDiagnostics;
    evidenceResearchQueue?: ComboEvidenceResearchCandidate[];
  };
  error?: string;
  requestId?: string;
};

type ComboResearchArticle = {
  headline: string;
  publisherName: string | null;
  publisherUrl: string | null;
  discoveryUrl: string;
  publishedAt: string;
  summary: string | null;
  provider: "google-news-rss" | "bing-news-rss";
  query: string;
};

type ComboResearchData = {
  predictionId: string;
  eventId: string;
  matchup: string;
  selectionName: string;
  generatedAt: string;
  articles: ComboResearchArticle[];
  rules: {
    discoveryOnly: boolean;
    mustReviewBeforeImport: boolean;
    noAutomaticQualification: boolean;
  };
};

type ResearchApiResponse = {
  data?: ComboResearchData;
  error?: string;
  requestId?: string;
};

type ResearchState = {
  loading: boolean;
  error: string | null;
  data: ComboResearchData | null;
};

function percent(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : `${(value * 100).toFixed(1)}%`;
}

function marketLabel(marketKey: string): string {
  if (marketKey === "h2h") return "MATCH WINNER";
  if (marketKey === "totals") return "TOTAL GOALS";
  if (marketKey === "spreads") return "HANDICAP";
  if (marketKey === "double_chance") return "DOUBLE CHANCE";
  return marketKey.replaceAll("_", " ").toUpperCase();
}

function sourceLabel(leg: ComboLeg): string {
  const bookmaker = leg.bookmakerName ?? "Bookmaker";
  const provider = leg.oddsProvider
    ? leg.oddsProvider.replaceAll("-", " ").toUpperCase()
    : "STORED ODDS";
  return `${bookmaker} · ${provider}`;
}

export function ComboBuilder({
  initialResult,
  initialDiagnostics,
  initialResearchQueue,
}: {
  initialResult?: ComboResult | null;
  initialDiagnostics?: ComboCandidateDiagnostics | null;
  initialResearchQueue?: ComboEvidenceResearchCandidate[] | null;
}) {
  const [target, setTarget] = useState<Target>(
    (initialResult?.targetOdds as Target | undefined) ?? 2,
  );
  const [risk, setRisk] = useState<Risk>(
    initialResult?.riskMode ?? "BALANCED",
  );
  const [result, setResult] = useState<ComboResult | null>(
    initialResult ?? null,
  );
  const [diagnostics, setDiagnostics] =
    useState<ComboCandidateDiagnostics | null>(initialDiagnostics ?? null);
  const [researchQueue, setResearchQueue] = useState<
    ComboEvidenceResearchCandidate[]
  >(initialResearchQueue ?? []);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [researchByPrediction, setResearchByPrediction] = useState<
    Record<string, ResearchState>
  >({});

  async function build(
    requestedTarget: Target = target,
    requestedRisk: Risk = risk,
  ) {
    setBuilding(true);
    setError(null);

    try {
      const response = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          targetOdds: requestedTarget,
          riskMode: requestedRisk,
        }),
      });

      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Combo construction failed.");
      }

      setResult(payload.data);
      setDiagnostics(payload.meta?.candidateDiagnostics ?? null);
      setResearchQueue(payload.meta?.evidenceResearchQueue ?? []);
    } catch (caught) {
      setResult(null);
      setResearchQueue([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "Combo construction failed.",
      );
    } finally {
      setBuilding(false);
    }
  }

  async function research(candidate: ComboEvidenceResearchCandidate) {
    const predictionId = candidate.predictionId;

    setResearchByPrediction((current) => ({
      ...current,
      [predictionId]: {
        loading: true,
        error: null,
        data: current[predictionId]?.data ?? null,
      },
    }));

    try {
      const response = await fetch("/api/combos/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ predictionId }),
      });

      const payload = (await response.json()) as ResearchApiResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Research discovery failed.");
      }

      setResearchByPrediction((current) => ({
        ...current,
        [predictionId]: {
          loading: false,
          error: null,
          data: payload.data ?? null,
        },
      }));
    } catch (caught) {
      setResearchByPrediction((current) => ({
        ...current,
        [predictionId]: {
          loading: false,
          error:
            caught instanceof Error
              ? caught.message
              : "Research discovery failed.",
          data: current[predictionId]?.data ?? null,
        },
      }));
    }
  }

  const statusLabel = result
    ? result.status.replaceAll("_", " ")
    : "READY";

  return (
    <div className="combo-builder-card">
      <div className="selector-section">
        <span className="selector-label">TARGET ODDS</span>
        <div className="selector-grid target-grid" role="group" aria-label="Target odds">
          {targets.map((item) => (
            <button
              key={item}
              type="button"
              className={item === target ? "selector-button active" : "selector-button"}
              disabled={building}
              onClick={() => {
                setTarget(item);
                void build(item, risk);
              }}
            >
              {item}x
            </button>
          ))}
        </div>
      </div>

      <div className="selector-section">
        <span className="selector-label">RISK MODE</span>
        <div className="selector-grid risk-grid" role="group" aria-label="Risk mode">
          {risks.map((item) => (
            <button
              key={item}
              type="button"
              className={item === risk ? "selector-button active" : "selector-button"}
              disabled={building}
              onClick={() => {
                setRisk(item);
                void build(target, item);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="combo-summary">
        <div>
          <span>{target === 2 && risk === "BALANCED" ? "TODAY’S BEST" : "REQUEST"}</span>
          <strong>{target}x / {risk}</strong>
        </div>
        <span
          className={
            result?.status === "TARGET_REACHED"
              ? "status-pill"
              : "status-pill no-bet"
          }
        >
          {building ? "BUILDING" : statusLabel}
        </span>
      </div>

      <p className="combo-message">
        EDGE builds immediately from future model-supported selections and real
        stored bookmaker prices. Win probability and model quality come before
        target odds. Independent form, H2H, injury and news evidence improves
        ranking and review confidence but does not block the Combo from showing a
        playable selection. One selection per event is allowed.
      </p>

      <button
        className="primary-button combo-build-button"
        type="button"
        disabled={building}
        onClick={() => void build()}
      >
        {building ? "BUILDING COMBO..." : "REBUILD COMBO"}
        <span aria-hidden="true">→</span>
      </button>

      {error ? (
        <div className="combo-result combo-result-error">
          <strong>COMBO ERROR</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {result ? (
        <section className="combo-result" aria-live="polite">
          <div className="combo-result-heading">
            <div>
              <span>EDGE COMBO OUTPUT</span>
              <strong>
                {result.actualOdds === null
                  ? "No qualifying combination"
                  : `${result.actualOdds.toFixed(2)}x`}
              </strong>
            </div>
            <span>{result.legs.length} LEGS</span>
          </div>

          <p className="combo-result-message">{result.message}</p>

          {diagnostics && result.legs.length === 0 ? (
            <div className="combo-metrics">
              <div>
                <span>LATEST</span>
                <strong>{diagnostics.latestPredictions}</strong>
              </div>
              <div>
                <span>≤0 EV</span>
                <strong>{diagnostics.nonPositiveEstimatedValue}</strong>
              </div>
              <div>
                <span>BELOW FLOOR</span>
                <strong>{diagnostics.belowEstimatedValueFloor}</strong>
              </div>
              <div>
                <span>NO EVIDENCE</span>
                <strong>{diagnostics.missingIndependentEvidence}</strong>
              </div>
              <div>
                <span>INTEL READY</span>
                <strong>{diagnostics.evidenceResearchWithActiveIntelligence}</strong>
              </div>
            </div>
          ) : null}

          {result.legs.length === 0 && researchQueue.length > 0 ? (
            <div className="combo-leg-list">
              <div className="combo-result-heading">
                <div>
                  <span>RESEARCH BACKLOG — NOT BET PICKS</span>
                  <strong>{researchQueue.length} selections failed evidence review</strong>
                </div>
              </div>
              <p className="combo-research-note">
                These are rejected research candidates, not recommended bets.
                They do not enter your Combo unless they later pass the model and
                evidence gates. Higher model probability is shown first.
              </p>
              {researchQueue.slice(0, 5).map((candidate, index) => (
                <article className="combo-leg" key={candidate.predictionId}>
                  <div className="combo-leg-index">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="combo-leg-copy">
                    <span>
                      {candidate.sport.toUpperCase()} · {candidate.league} ·{" "}
                      {marketLabel(candidate.marketKey)}
                    </span>
                    <strong>{candidate.selectionName}</strong>
                    <p>{candidate.matchup}</p>
                    <small>
                      {candidate.bookmakerName ?? "Bookmaker"} ·{" "}
                      {candidate.oddsProvider.replaceAll("-", " ").toUpperCase()}
                    </small>
                    <small>
                      Model {percent(candidate.modelProbability)} · Market{" "}
                      {percent(candidate.marketProbability)}
                      {candidate.modelProbability < 0.5 ? " · LOW WIN PROBABILITY" : ""}
                    </small>
                    <small>
                      {candidate.intelligenceSignals.length > 0
                        ? candidate.intelligenceSignals.length + " active research signal(s)"
                        : "No active injury/lineup intelligence yet"}
                    </small>
                  </div>
                  <div className="combo-leg-metrics">
                    <strong>{candidate.decimalOdds.toFixed(2)}</strong>
                    <span>{percent(candidate.estimatedValue)} EV</span>
                  </div>

                  <div className="combo-research-panel">
                    <button
                      type="button"
                      className="combo-research-button"
                      disabled={
                        researchByPrediction[candidate.predictionId]?.loading ===
                        true
                      }
                      onClick={() => void research(candidate)}
                    >
                      {researchByPrediction[candidate.predictionId]?.loading
                        ? "RESEARCHING..."
                        : "RESEARCH"}
                    </button>

                    {researchByPrediction[candidate.predictionId]?.error ? (
                      <p className="combo-research-error">
                        {researchByPrediction[candidate.predictionId]?.error}
                      </p>
                    ) : null}

                    {researchByPrediction[candidate.predictionId]?.data ? (
                      <div className="combo-research-results">
                        <small className="combo-research-note">
                          Discovery only. Review attributable sources before any
                          separate evidence import; this does not approve the leg.
                        </small>

                        {researchByPrediction[candidate.predictionId]?.data
                          ?.articles.length ? (
                          <div className="combo-research-article-list">
                            {researchByPrediction[
                              candidate.predictionId
                            ]?.data?.articles.map((article, articleIndex) => (
                              <a
                                key={article.discoveryUrl + "-" + articleIndex}
                                className="combo-research-article"
                                href={article.discoveryUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <strong>{article.headline}</strong>
                                <span>
                                  {article.publisherName ??
                                    article.provider
                                      .replaceAll("-", " ")
                                      .toUpperCase()}{" "}
                                  · {article.publishedAt.slice(0, 10)}
                                </span>
                                {article.summary ? <p>{article.summary}</p> : null}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="combo-research-empty">
                            No acceptable independent pre-event articles were
                            found. Nothing was imported or approved.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {result.legs.length > 0 ? (
            <>
              <div className="combo-metrics">
                <div>
                  <span>MODEL PROB.</span>
                  <strong>{percent(result.estimatedProbability)}</strong>
                </div>
                <div>
                  <span>EST. VALUE</span>
                  <strong>{percent(result.estimatedValue)}</strong>
                </div>
                <div>
                  <span>DIVERSIFY</span>
                  <strong>{percent(result.diversificationScore)}</strong>
                </div>
              </div>

              <div className="combo-leg-list">
                {result.legs.map((leg, index) => (
                  <article className="combo-leg" key={leg.predictionId}>
                    <div className="combo-leg-index">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="combo-leg-copy">
                      <span>
                        {leg.sport.toUpperCase()} · {leg.league} ·{" "}
                        {marketLabel(leg.marketKey)}
                      </span>
                      <strong>{leg.selectionName}</strong>
                      <p>{leg.matchup}</p>
                      <small>{sourceLabel(leg)}</small>
                      <small>
                        Model {percent(leg.modelProbability)}
                        {leg.marketProbability !== null &&
                        leg.marketProbability !== undefined
                          ? ` · Market ${percent(leg.marketProbability)}`
                          : ""}
                        {leg.modelLift !== null && leg.modelLift !== undefined
                          ? ` · Lift ${percent(leg.modelLift)}`
                          : ""}
                      </small>
                    </div>
                    <div className="combo-leg-metrics">
                      <strong>{leg.decimalOdds.toFixed(2)}</strong>
                      <span>{percent(leg.estimatedValue)} EV</span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          <p className="combo-methodology">{result.methodology}</p>
        </section>
      ) : null}
    </div>
  );
}
