import test from "node:test";
import assert from "node:assert/strict";
import { buildSetupPlan } from "../lib/system/setup";
import type { SystemReadiness } from "../lib/system/readiness";

function readiness(overrides: Partial<SystemReadiness> = {}): SystemReadiness {
  return {
    generatedAt: "2026-10-04T12:00:00.000Z",
    overall: "DEGRADED",
    checks: [],
    counts: null,
    freshness: null,
    syncs: [],
    capabilities: {
      eventIngestion: false,
      oddsIngestion: false,
      resultIngestion: false,
      intelligenceIngestion: false,
      featureEngine: false,
      resultAudit: false,
      intelligenceSignals: false,
      movementDiagnostics: false,
      automatedWagering: false,
    },
    ...overrides,
  };
}

test("setup plan starts with database action when infrastructure is unavailable", () => {
  const plan = buildSetupPlan(
    readiness({
      checks: [
        {
          key: "database-env",
          label: "Database",
          level: "WARNING",
          detail: "Missing",
        },
      ],
    }),
  );

  assert.equal(plan.percent, 0);
  assert.match(plan.nextAction ?? "", /codespace:resume/);
  assert.equal(plan.steps[3].state, "WAITING");
});

test("setup percentage reflects real configured and stored evidence only", () => {
  const plan = buildSetupPlan(
    readiness({
      overall: "READY",
      checks: [
        {
          key: "database-env",
          label: "Database",
          level: "READY",
          detail: "Configured",
        },
        {
          key: "database-reachability",
          label: "Database",
          level: "READY",
          detail: "Reachable",
        },
        {
          key: "api-sports",
          label: "API-Sports",
          level: "READY",
          detail: "Configured",
        },
        {
          key: "odds-api",
          label: "Odds",
          level: "WARNING",
          detail: "Missing",
        },
      ],
      counts: {
        sports: 3,
        events: 12,
        markets: 0,
        oddsSnapshots: 0,
        features: 12,
        results: 0,
        intelligenceSignals: 0,
      },
    }),
  );

  assert.equal(plan.completed, 4);
  assert.equal(plan.total, 5);
  assert.equal(plan.percent, 80);
  assert.match(plan.nextAction ?? "", /ODDS_API_KEY/);
});

test("setup plan never exposes credential values", () => {
  const plan = buildSetupPlan(readiness());
  const serialized = JSON.stringify(plan);

  assert.doesNotMatch(serialized, /postgresql:\/\//);
  assert.doesNotMatch(serialized, /sk_live|api_key=/i);
});
