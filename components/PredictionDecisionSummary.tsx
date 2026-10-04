import type { UiPrediction } from "@/lib/data/uiPredictions";

function percent(value: number | null, digits = 1): string {
  return value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function decimal(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function signed(value: number | null): string {
  if (value === null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(3)}`;
}

function freshness(iso: string): string {
  const ageMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "JUST NOW";
  if (minutes < 60) return `${minutes}M OLD`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H OLD`;
  return `${Math.floor(hours / 24)}D OLD`;
}

export function PredictionDecisionSummary({
  prediction,
}: {
  prediction: UiPrediction;
}) {
  const guarded =
    prediction.bettableEnabled !== true ||
    prediction.validationState === "UNVALIDATED_BASELINE";

  return (
    <section className="decision-summary-card">
      <div className="decision-summary-head">
        <div>
          <span className="empty-status">LEADING MODEL VIEW</span>
          <h2>{prediction.selectionName}</h2>
          <p>
            Ranked by status, risk, estimated value, agreement and data quality;
            not by favorite probability alone.
          </p>
        </div>
        <span
          className={`status-pill ${prediction.status === "NO_BET" ? "no-bet" : ""}`}
        >
          {prediction.status.replaceAll("_", " ")}
        </span>
      </div>

      <div className="decision-summary-grid">
        <div>
          <span>MODEL PROBABILITY</span>
          <strong>{percent(prediction.modelProbability)}</strong>
        </div>
        <div>
          <span>MARKET PROBABILITY</span>
          <strong>{percent(prediction.marketProbability)}</strong>
        </div>
        <div>
          <span>BEST STORED ODDS</span>
          <strong>{decimal(prediction.bestDecimalOdds)}</strong>
        </div>
        <div>
          <span>ESTIMATED VALUE</span>
          <strong>{percent(prediction.estimatedValue)}</strong>
        </div>
        <div>
          <span>RISK</span>
          <strong>{prediction.risk}</strong>
        </div>
        <div>
          <span>DATA QUALITY</span>
          <strong>{percent(prediction.dataQuality, 0)}</strong>
        </div>
        <div>
          <span>MODEL AGREEMENT</span>
          <strong>{percent(prediction.modelAgreement, 0)}</strong>
        </div>
        <div>
          <span>BOOKMAKERS</span>
          <strong>{prediction.bookmakerCount ?? "—"}</strong>
        </div>
      </div>

      <div className="decision-evidence">
        <div>
          <span>MARKET ANCHOR</span>
          <b>{percent(prediction.evidence.marketAnchor)}</b>
        </div>
        <div>
          <span>FORM WEIGHT</span>
          <b>{signed(prediction.evidence.formAdjustment)}</b>
        </div>
        <div>
          <span>H2H WEIGHT</span>
          <b>{signed(prediction.evidence.headToHeadAdjustment)}</b>
        </div>
        <div>
          <span>REST WEIGHT</span>
          <b>{signed(prediction.evidence.restAdjustment)}</b>
        </div>
        <div>
          <span>TOTAL ADJUSTMENT</span>
          <b>{signed(prediction.evidence.totalAdjustment)}</b>
        </div>
      </div>

      <div className="decision-summary-foot">
        <span>{prediction.modelVersion}</span>
        <span>{freshness(prediction.createdAt)}</span>
      </div>

      {guarded ? (
        <p className="decision-guardrail">
          This model remains validation-gated. The leading view is analytical
          output, not a bet recommendation or guarantee of outcome.
        </p>
      ) : null}
    </section>
  );
}
