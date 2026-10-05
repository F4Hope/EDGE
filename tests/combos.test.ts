import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCombo,
  type ComboCandidate,
} from "../lib/combo/engine";

function candidate(
  index: number,
  overrides: Partial<ComboCandidate> = {},
): ComboCandidate {
  return {
    predictionId: "prediction-" + index,
    eventId: "event-" + index,
    sport: index % 2 === 0 ? "football" : "basketball",
    league: "League " + index,
    startsAt: "2026-10-05T18:00:00.000Z",
    matchup: "Home " + index + " vs Away " + index,
    selectionKey: "home",
    selectionName: "Home " + index,
    decimalOdds: 1.8,
    modelProbability: 0.6,
    estimatedValue: 0.08,
    dataQuality: 0.88,
    modelAgreement: 0.93,
    risk: "LOW",
    status: "WATCH",
    ...overrides,
  };
}

test("combo builder reaches target with unique events", () => {
  const result = buildCombo(
    [candidate(1), candidate(2), candidate(3), candidate(4)],
    5,
    "BALANCED",
  );

  assert.equal(result.status, "TARGET_REACHED");
  assert.equal(result.targetReached, true);
  assert.ok((result.actualOdds ?? 0) >= 5);
  assert.ok(result.legs.length >= 3);

  const eventIds = new Set(result.legs.map((leg) => leg.eventId));
  assert.equal(eventIds.size, result.legs.length);
});

test("LOW mode rejects medium-risk and weak-quality candidates", () => {
  const result = buildCombo(
    [
      candidate(1, { risk: "MEDIUM" }),
      candidate(2, { dataQuality: 0.6 }),
      candidate(3, { modelAgreement: 0.6 }),
    ],
    2,
    "LOW",
  );

  assert.equal(result.status, "NO_QUALIFYING_COMBO");
  assert.equal(result.legs.length, 0);
});

test("NO_BET outputs are never used even in aggressive mode", () => {
  const result = buildCombo(
    [
      candidate(1, {
        risk: "HIGH",
        status: "NO_BET",
        decimalOdds: 10,
        modelProbability: 0.4,
      }),
    ],
    5,
    "AGGRESSIVE",
  );

  assert.equal(result.status, "NO_QUALIFYING_COMBO");
});

test("builder returns best effort when qualified data cannot reach target", () => {
  const result = buildCombo(
    [candidate(1, { decimalOdds: 1.5 }), candidate(2, { decimalOdds: 1.5 })],
    10,
    "BALANCED",
  );

  assert.equal(result.status, "BEST_EFFORT");
  assert.equal(result.targetReached, false);
  assert.ok((result.actualOdds ?? 0) < 10);
  assert.ok(result.legs.length > 0);
});


test("combo candidate loader requires positive value and independent evidence", async () => {
  const source = await readFile("lib/data/uiCombos.ts", "utf8");

  assert.match(source, /estimatedValue <= 0/);
  assert.match(source, /independentEvidenceSupport/);
  assert.match(source, /MIN_MODEL_MARKET_LIFT/);
  assert.match(source, /evidenceSupport <= 1e-9/);
  assert.match(source, /bookmakerName: bestSnapshot\.bookmakerName/);
  assert.match(source, /oddsProvider: bestSnapshot\.provider/);
});


test("combo page defaults to a 2x balanced Today’s Best output", async () => {
  const [page, component] = await Promise.all([
    readFile("app/combos/page.tsx", "utf8"),
    readFile("components/ComboBuilder.tsx", "utf8"),
  ]);

  assert.match(page, /buildCombo\(candidates, 2, "BALANCED"\)/);
  assert.match(page, /Today’s Best balanced combo targeting 2x/);
  assert.match(component, /\?\? 2/);
  assert.match(component, /TODAY’S BEST/);
});


test("combo controls rebuild immediately with the selected target and risk", async () => {
  const source = await readFile("components/ComboBuilder.tsx", "utf8");

  assert.match(source, /async function build\(\s*requestedTarget: Target = target,/);
  assert.match(source, /requestedRisk: Risk = risk/);
  assert.match(source, /targetOdds: requestedTarget/);
  assert.match(source, /riskMode: requestedRisk/);
  assert.match(source, /void build\(item, risk\)/);
  assert.match(source, /void build\(target, item\)/);
  assert.match(source, /disabled=\{building\}/);
});


test("combo API exposes candidate rejection diagnostics", async () => {
  const [loader, route] = await Promise.all([
    readFile("lib/data/uiCombos.ts", "utf8"),
    readFile("app/api/combos/route.ts", "utf8"),
  ]);

  assert.match(loader, /export type ComboCandidateDiagnostics/);
  assert.match(loader, /missingStoredOdds/);
  assert.match(loader, /nonPositiveEstimatedValue/);
  assert.match(loader, /missingMarketProbability/);
  assert.match(loader, /missingIndependentEvidence/);
  assert.match(loader, /insufficientModelMarketLift/);
  assert.match(loader, /qualifiedCandidates/);
  assert.match(route, /candidateDiagnostics: pool\.diagnostics/);
});
