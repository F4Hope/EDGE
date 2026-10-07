import test from "node:test";
import assert from "node:assert/strict";
import {
  compareOpportunityPriority,
  MIN_MODEL_MARKET_LIFT,
  passesIndependentEvidenceGate,
  rankOneOpportunityPerEvent,
  type UiOpportunity,
} from "../lib/data/uiOpportunities";

function candidate(
  overrides: Partial<UiOpportunity> &
    Pick<UiOpportunity, "eventId" | "selectionName">,
): UiOpportunity {
  const { eventId, selectionName, ...rest } = overrides;

  return {
    predictionId: `${eventId}:${selectionName}`,
    eventId,
    sport: "football",
    league: "Test League",
    country: "Test",
    home: "Home",
    away: "Away",
    startsAt: "2026-10-06T18:00:00.000Z",
    marketKey: "h2h",
    point: null,
    selectionName,
    modelVersion: "market-evidence-v1",
    modelProbability: 0.52,
    marketProbability: 0.5,
    modelLift: 0.02,
    evidenceSupport: 0.04,
    edgeScore: 70,
    bestDecimalOdds: 2.05,
    estimatedEdge: 0.03,
    estimatedValue: 0.066,
    risk: "MEDIUM",
    status: "WATCH",
    dataQuality: 0.7,
    modelAgreement: 0.9,
    bookmakerCount: 3,
    validationState: "UNVALIDATED_BASELINE",
    bettableEnabled: false,
    createdAt: "2026-10-05T08:00:00.000Z",
    ...rest,
  };
}

test("opportunity ranking favors lower risk before nominal value", () => {
  const medium = candidate({
    eventId: "event-a",
    selectionName: "Medium",
    risk: "MEDIUM",
    estimatedValue: 0.12,
  });
  const low = candidate({
    eventId: "event-b",
    selectionName: "Low",
    risk: "LOW",
    estimatedValue: 0.04,
  });

  assert.ok(compareOpportunityPriority(low, medium) < 0);
});

test("BETTABLE status ranks before WATCH when otherwise qualified", () => {
  const watch = candidate({
    eventId: "event-a",
    selectionName: "Watch",
    status: "WATCH",
    risk: "LOW",
    estimatedValue: 0.2,
  });
  const bettable = candidate({
    eventId: "event-b",
    selectionName: "Bettable",
    status: "BETTABLE",
    risk: "LOW",
    estimatedValue: 0.03,
    bettableEnabled: true,
    validationState: "VALIDATED",
  });

  assert.ok(compareOpportunityPriority(bettable, watch) < 0);
});

test("ranked opportunities keep only the highest-priority selection per event", () => {
  const stronger = candidate({
    eventId: "same-event",
    selectionName: "Stronger",
    risk: "LOW",
    estimatedValue: 0.05,
  });
  const weaker = candidate({
    eventId: "same-event",
    selectionName: "Weaker",
    risk: "MEDIUM",
    estimatedValue: 0.2,
  });
  const other = candidate({
    eventId: "other-event",
    selectionName: "Other",
    estimatedValue: 0.03,
  });

  const ranked = rankOneOpportunityPerEvent(
    [weaker, other, stronger],
    10,
  );

  assert.equal(ranked.length, 2);
  assert.equal(
    ranked.find((item) => item.eventId === "same-event")?.selectionName,
    "Stronger",
  );
});


test("pure market mirrors do not qualify as model opportunities", () => {
  assert.equal(
    passesIndependentEvidenceGate({
      modelProbability: 0.5,
      marketProbability: 0.5,
      evidenceSupport: 0,
    }),
    false,
  );
});

test("independent evidence must create measurable market separation", () => {
  assert.equal(
    passesIndependentEvidenceGate({
      modelProbability: 0.501,
      marketProbability: 0.5,
      evidenceSupport: 0.05,
    }),
    false,
  );

  assert.equal(
    passesIndependentEvidenceGate({
      modelProbability: 0.5 + MIN_MODEL_MARKET_LIFT,
      marketProbability: 0.5,
      evidenceSupport: 0.05,
    }),
    true,
  );
});
