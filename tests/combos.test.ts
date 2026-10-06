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
    marketKey: "h2h",
    point: null,
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


test("combo candidate loader admits small target-fit margin drag and tracks its floor", async () => {
  const source = await readFile("lib/data/uiCombos.ts", "utf8");

  assert.match(source, /MIN_COMBO_ESTIMATED_VALUE = -0\.05/);
  assert.match(source, /estimatedValue <= 0/);
  assert.match(source, /estimatedValue < MIN_COMBO_ESTIMATED_VALUE/);
  assert.match(source, /belowEstimatedValueFloor/);
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

  assert.match(page, /buildCombo\(pool\.candidates, 2, "BALANCED"\)/);
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
  assert.match(loader, /belowEstimatedValueFloor/);
  assert.match(loader, /missingMarketProbability/);
  assert.match(loader, /missingIndependentEvidence/);
  assert.match(loader, /insufficientModelMarketLift/);
  assert.match(loader, /qualifiedCandidates/);
  assert.match(route, /candidateDiagnostics: pool\.diagnostics/);
});


test("combo screen surfaces candidate rejection diagnostics when no legs qualify", async () => {
  const [page, component] = await Promise.all([
    readFile("app/combos/page.tsx", "utf8"),
    readFile("components/ComboBuilder.tsx", "utf8"),
  ]);

  assert.match(page, /getComboCandidatePool/);
  assert.match(page, /initialDiagnostics/);
  assert.match(component, /candidateDiagnostics/);
  assert.match(component, /≤0 EV/);
  assert.match(component, /BELOW FLOOR/);
  assert.match(component, /NO EVIDENCE/);
  assert.match(component, /INTEL READY/);
});


test("combo exposes positive-EV evidence research candidates without qualifying them", async () => {
  const [loader, route, page, component] = await Promise.all([
    readFile("lib/data/uiCombos.ts", "utf8"),
    readFile("app/api/combos/route.ts", "utf8"),
    readFile("app/combos/page.tsx", "utf8"),
    readFile("components/ComboBuilder.tsx", "utf8"),
  ]);

  assert.match(loader, /evidenceResearchQueue/);
  assert.match(loader, /evidenceResearchWithActiveIntelligence/);
  assert.match(loader, /intelligenceSignals/);
  assert.match(loader, /comboResearchSignalTypes/);
  assert.match(loader, /evidenceSupport <= 1e-9/);
  assert.match(route, /evidenceResearchQueue: pool\.evidenceResearchQueue/);
  assert.match(page, /initialResearchQueue/);
  assert.match(component, /EVIDENCE RESEARCH QUEUE/);
  assert.match(component, /INTEL READY/);
  assert.match(component, /active research signal/);
});


test("combo research action is read-only and review gated", async () => {
  const [route, component] = await Promise.all([
    readFile("app/api/combos/research/route.ts", "utf8"),
    readFile("components/ComboBuilder.tsx", "utf8"),
  ]);

  assert.match(route, /requireOpaqueId/);
  assert.match(route, /evidenceResearchQueue\.find/);
  assert.match(route, /discoverPublicNews/);
  assert.match(route, /mustReviewBeforeImport: true/);
  assert.match(route, /noAutomaticQualification: true/);
  assert.doesNotMatch(route, /prediction\.(create|update|upsert)/);
  assert.doesNotMatch(route, /oddsSnapshot\.(create|update|upsert)/);
  assert.doesNotMatch(route, /intelligenceSignal\.(create|update|upsert)/);

  assert.match(component, /"RESEARCH"/);
  assert.match(component, /\/api\/combos\/research/);
  assert.match(component, /Discovery only/);
  assert.match(component, /does not approve the leg/);
});


test("combo pool supports winner totals and handicap markets without research blocking", async () => {
  const [loader, component] = await Promise.all([
    readFile("lib/data/uiCombos.ts", "utf8"),
    readFile("components/ComboBuilder.tsx", "utf8"),
  ]);

  assert.match(
    loader,
    /key: \{ in: \["h2h", "totals", "spreads", "double_chance"\] \}/,
  );
  assert.match(loader, /marketKey: row\.market\.key/);
  assert.match(loader, /selectionLabel/);
  assert.doesNotMatch(
    loader,
    /insufficientModelMarketLift \+= 1;\s*continue;/,
  );
  assert.match(component, /MATCH WINNER/);
  assert.match(component, /TOTAL GOALS/);
  assert.match(component, /HANDICAP/);
  assert.match(component, /DOUBLE CHANCE/);
});


test("balanced combo accepts model-classified medium risk selections at the model quality floor", () => {
  const result = buildCombo(
    [
      candidate(21, {
        decimalOdds: 1.55,
        modelProbability: 0.68,
        estimatedValue: 0.054,
        dataQuality: 0.56,
        modelAgreement: 0.55,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(22, {
        decimalOdds: 1.5,
        modelProbability: 0.7,
        estimatedValue: 0.05,
        dataQuality: 0.58,
        modelAgreement: 0.57,
        risk: "MEDIUM",
        status: "WATCH",
      }),
    ],
    2,
    "BALANCED",
  );

  assert.equal(result.status, "TARGET_REACHED");
  assert.equal(result.legs.length, 2);
  assert.ok((result.actualOdds ?? 0) >= 2);
});

test("combo output requires at least two different events", () => {
  const result = buildCombo(
    [
      candidate(31, {
        decimalOdds: 2.2,
        modelProbability: 0.55,
        estimatedValue: 0.21,
      }),
    ],
    2,
    "BALANCED",
  );

  assert.equal(result.status, "NO_QUALIFYING_COMBO");
  assert.equal(result.legs.length, 0);
});


test("balanced combo requires at least 50 percent model probability per leg", () => {
  const result = buildCombo(
    [
      candidate(41, {
        eventId: "event-a",
        decimalOdds: 1.77,
        modelProbability: 0.540553,
        estimatedValue: 0.000024,
        dataQuality: 0.63529,
        modelAgreement: 1,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(42, {
        eventId: "event-b",
        decimalOdds: 3.14,
        modelProbability: 0.507047,
        estimatedValue: 0.004664,
        dataQuality: 0.63529,
        modelAgreement: 1,
        risk: "MEDIUM",
        status: "WATCH",
      }),
    ],
    2,
    "BALANCED",
  );

  assert.equal(result.status, "TARGET_REACHED");
  assert.equal(result.legs.length, 2);
  assert.equal(new Set(result.legs.map((leg) => leg.eventId)).size, 2);
});

test("balanced mode rejects sub-50-percent long shots", () => {
  const result = buildCombo(
    [
      candidate(51, {
        eventId: "event-a",
        decimalOdds: 1.77,
        modelProbability: 0.540553,
        estimatedValue: 0.000024,
        dataQuality: 0.63529,
        modelAgreement: 1,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(52, {
        eventId: "event-b",
        decimalOdds: 7.5,
        modelProbability: 0.49,
        estimatedValue: 0.1385,
        dataQuality: 0.63529,
        modelAgreement: 1,
        risk: "MEDIUM",
        status: "WATCH",
      }),
    ],
    2,
    "BALANCED",
  );

  assert.equal(result.status, "NO_QUALIFYING_COMBO");
});


test("balanced combo prefers the reached combination closest to the requested odds", () => {
  const result = buildCombo(
    [
      candidate(61, {
        eventId: "event-a",
        decimalOdds: 1.45,
        modelProbability: 0.67,
        estimatedValue: -0.0285,
        dataQuality: 0.7,
        modelAgreement: 0.82,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(62, {
        eventId: "event-b",
        decimalOdds: 1.45,
        modelProbability: 0.67,
        estimatedValue: -0.0285,
        dataQuality: 0.7,
        modelAgreement: 0.82,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(63, {
        eventId: "event-c",
        decimalOdds: 3.14,
        modelProbability: 0.33,
        estimatedValue: 0.0362,
        dataQuality: 0.7,
        modelAgreement: 0.82,
        risk: "MEDIUM",
        status: "WATCH",
      }),
    ],
    2,
    "BALANCED",
  );

  assert.equal(result.status, "TARGET_REACHED");
  assert.equal(result.legs.length, 2);
  assert.equal(result.actualOdds, 2.1025);
  assert.ok(result.message.includes("2x target"));
});

test("low mode still rejects negative-value target-fit legs", () => {
  const result = buildCombo(
    [
      candidate(71, {
        eventId: "event-a",
        decimalOdds: 1.45,
        modelProbability: 0.67,
        estimatedValue: -0.0285,
      }),
      candidate(72, {
        eventId: "event-b",
        decimalOdds: 1.45,
        modelProbability: 0.67,
        estimatedValue: -0.0285,
      }),
    ],
    2,
    "LOW",
  );

  assert.equal(result.status, "NO_QUALIFYING_COMBO");
});


test("balanced combo accepts today's short-priced target-fit favorites at the loader floor", () => {
  const result = buildCombo(
    [
      candidate(81, {
        eventId: "goias-athletic",
        decimalOdds: 1.78,
        modelProbability: 0.535709,
        estimatedValue: -0.046438,
        dataQuality: 0.63529,
        modelAgreement: 1,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(82, {
        eventId: "sport-sao-bernardo",
        decimalOdds: 1.88,
        modelProbability: 0.50545,
        estimatedValue: -0.049754,
        dataQuality: 0.63529,
        modelAgreement: 1,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(83, {
        eventId: "goias-athletic",
        decimalOdds: 3.71,
        modelProbability: 0.270928,
        estimatedValue: 0.005144,
        dataQuality: 0.63529,
        modelAgreement: 1,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(84, {
        eventId: "sport-sao-bernardo",
        decimalOdds: 3.92,
        modelProbability: 0.260583,
        estimatedValue: 0.021484,
        dataQuality: 0.63529,
        modelAgreement: 1,
        risk: "MEDIUM",
        status: "WATCH",
      }),
    ],
    2,
    "BALANCED",
  );

  assert.equal(result.status, "TARGET_REACHED");
  assert.equal(result.actualOdds, 3.3464);
  assert.deepEqual(
    result.legs.map((leg) => leg.decimalOdds).sort((a, b) => a - b),
    [1.78, 1.88],
  );
});


test("combo loader renders participant-friendly double chance selections", async () => {
  const source = await readFile("lib/data/uiCombos.ts", "utf8");

  assert.match(source, /marketKey === "double_chance"/);
  assert.match(source, /\$\{home\} or Draw/);
  assert.match(source, /\$\{home\} or \$\{away\}/);
  assert.match(source, /Draw or \$\{away\}/);
});


test("balanced combo prefers higher combined win probability before target closeness", () => {
  const result = buildCombo(
    [
      candidate(91, {
        eventId: "safe-a",
        decimalOdds: 1.6,
        modelProbability: 0.8,
        estimatedValue: 0.02,
        dataQuality: 0.82,
        modelAgreement: 0.9,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(92, {
        eventId: "safe-b",
        decimalOdds: 1.6,
        modelProbability: 0.78,
        estimatedValue: 0.01,
        dataQuality: 0.82,
        modelAgreement: 0.9,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(93, {
        eventId: "riskier-a",
        decimalOdds: 1.42,
        modelProbability: 0.55,
        estimatedValue: -0.02,
        dataQuality: 0.7,
        modelAgreement: 0.8,
        risk: "MEDIUM",
        status: "WATCH",
      }),
      candidate(94, {
        eventId: "riskier-b",
        decimalOdds: 1.42,
        modelProbability: 0.55,
        estimatedValue: -0.02,
        dataQuality: 0.7,
        modelAgreement: 0.8,
        risk: "MEDIUM",
        status: "WATCH",
      }),
    ],
    2,
    "BALANCED",
  );

  assert.equal(result.status, "TARGET_REACHED");
  assert.deepEqual(
    result.legs.map((leg) => leg.eventId).sort(),
    ["safe-a", "safe-b"],
  );
  assert.equal(result.actualOdds, 2.56);
});

test("risk profiles enforce win-probability floors", async () => {
  const engine = await readFile("lib/combo/engine.ts", "utf8");

  assert.match(engine, /LOW:[\s\S]*minProbability: 0\.6/);
  assert.match(engine, /BALANCED:[\s\S]*minProbability: 0\.5/);
  assert.match(engine, /AGGRESSIVE:[\s\S]*minProbability: 0\.35/);
  assert.match(engine, /b\.probability - a\.probability/);
});
