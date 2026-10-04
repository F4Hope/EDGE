import test from "node:test";
import assert from "node:assert/strict";
import { buildLaunchGate } from "../lib/system/launch";
import type { ProviderCredentialCheck } from "../lib/providers/health";
import type { SystemReadiness } from "../lib/system/readiness";

function provider(
  providerName: "api-sports" | "odds-api",
  ok: boolean,
): ProviderCredentialCheck {
  return {
    provider: providerName,
    configured: ok,
    ok,
    detail: ok ? "ready" : "missing",
    quotaRemaining: null,
  };
}

function readiness(
  counts: {
    events: number;
    oddsSnapshots: number;
    features: number;
  },
): SystemReadiness {
  return {
    generatedAt: "2026-10-04T12:00:00.000Z",
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
        label: "Odds API",
        level: "READY",
        detail: "Configured",
      },
    ],
    counts: {
      sports: 3,
      events: counts.events,
      markets: counts.oddsSnapshots > 0 ? 2 : 0,
      oddsSnapshots: counts.oddsSnapshots,
      features: counts.features,
      results: 0,
      intelligenceSignals: 0,
    },
    freshness: null,
    syncs: [],
    capabilities: {
      eventIngestion: true,
      oddsIngestion: true,
      resultIngestion: true,
      intelligenceIngestion: true,
      featureEngine: true,
      resultAudit: true,
      intelligenceSignals: true,
      movementDiagnostics: counts.oddsSnapshots > 1,
      automatedWagering: false,
    },
  };
}

test("launch gate passes only with full runtime, providers, and stored evidence", () => {
  const gate = buildLaunchGate(
    readiness({ events: 25, oddsSnapshots: 100, features: 25 }),
    provider("api-sports", true),
    provider("odds-api", true),
    22,
  );

  assert.equal(gate.ready, true);
  assert.ok(gate.checks.every((check) => check.passed));
});

test("launch gate blocks missing provider or data evidence", () => {
  const gate = buildLaunchGate(
    readiness({ events: 25, oddsSnapshots: 0, features: 0 }),
    provider("api-sports", true),
    provider("odds-api", false),
    22,
  );

  assert.equal(gate.ready, false);
  assert.equal(
    gate.checks.find((check) => check.key === "odds-api")?.passed,
    false,
  );
  assert.equal(
    gate.checks.find((check) => check.key === "odds")?.passed,
    false,
  );
  assert.equal(
    gate.checks.find((check) => check.key === "features")?.passed,
    false,
  );
});

test("launch gate blocks an unsupported Node major even when data is ready", () => {
  const gate = buildLaunchGate(
    readiness({ events: 10, oddsSnapshots: 10, features: 10 }),
    provider("api-sports", true),
    provider("odds-api", true),
    24,
  );

  assert.equal(gate.ready, false);
  assert.equal(
    gate.checks.find((check) => check.key === "runtime")?.passed,
    false,
  );
});
