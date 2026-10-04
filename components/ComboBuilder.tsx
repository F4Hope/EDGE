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
  selectionKey: string;
  selectionName: string;
  decimalOdds: number;
  modelProbability: number;
  estimatedValue: number | null;
  dataQuality: number | null;
  modelAgreement: number | null;
  risk: "LOW" | "MEDIUM" | "HIGH";
  status: "BETTABLE" | "WATCH" | "HIGH_RISK" | "NO_BET";
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
  error?: string;
  requestId?: string;
};

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function ComboBuilder() {
  const [target, setTarget] = useState<Target>(5);
  const [risk, setRisk] = useState<Risk>("BALANCED");
  const [result, setResult] = useState<ComboResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  async function build() {
    setBuilding(true);
    setError(null);

    try {
      const response = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          targetOdds: target,
          riskMode: risk,
        }),
      });

      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Combo construction failed.");
      }

      setResult(payload.data);
    } catch (caught) {
      setResult(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Combo construction failed.",
      );
    } finally {
      setBuilding(false);
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
              onClick={() => {
                setTarget(item);
                setResult(null);
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
              onClick={() => {
                setRisk(item);
                setResult(null);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="combo-summary">
        <div>
          <span>REQUEST</span>
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
        EDGE searches stored pre-event Phase 7 H2H forecasts and bookmaker odds,
        applies your selected evidence threshold, and never uses more than one
        selection from the same event.
      </p>

      <button
        className="primary-button combo-build-button"
        type="button"
        disabled={building}
        onClick={build}
      >
        {building ? "BUILDING COMBO..." : "BUILD QUALITY COMBO"}
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
                      <span>{leg.sport.toUpperCase()} · {leg.league}</span>
                      <strong>{leg.selectionName}</strong>
                      <p>{leg.matchup}</p>
                    </div>
                    <div className="combo-leg-metrics">
                      <strong>{leg.decimalOdds.toFixed(2)}</strong>
                      <span>{percent(leg.modelProbability)}</span>
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
