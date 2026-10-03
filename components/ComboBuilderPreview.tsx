"use client";

import { useState } from "react";

const targets = ["2x", "5x", "10x", "20x", "50x", "100x", "1000x"] as const;
const risks = ["LOW", "BALANCED", "AGGRESSIVE"] as const;

export function ComboBuilderPreview() {
  const [target, setTarget] = useState<(typeof targets)[number]>("5x");
  const [risk, setRisk] = useState<(typeof risks)[number]>("BALANCED");

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
              onClick={() => setTarget(item)}
            >
              {item}
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
              onClick={() => setRisk(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="combo-summary">
        <div>
          <span>REQUEST</span>
          <strong>{target} / {risk}</strong>
        </div>
        <span className="status-pill no-bet">NO BET</span>
      </div>

      <p className="combo-message">
        Combo optimization is intentionally locked until scored opportunities, odds,
        risk, and correlation data exist. EDGE will not add weak selections just to
        reach a target.
      </p>

      <button className="primary-button" type="button" disabled>
        BUILD QUALITY COMBO <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
