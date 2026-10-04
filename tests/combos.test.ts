import test from "node:test";
import assert from "node:assert/strict";
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
