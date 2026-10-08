import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  compareOpportunityPriority,
  MIN_MODEL_MARKET_LIFT,
  passesIndependentEvidenceGate,
  rankBestPicksByLeague,
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


test("best picks by league returns at most three distinct games per league", () => {
  const candidates = [
    candidate({ eventId: "a", selectionName: "A", edgeScore: 90 }),
    candidate({ eventId: "b", selectionName: "B", edgeScore: 85 }),
    candidate({ eventId: "c", selectionName: "C", edgeScore: 80 }),
    candidate({ eventId: "d", selectionName: "D", edgeScore: 75 }),
    candidate({
      eventId: "e",
      selectionName: "E",
      league: "Other League",
      edgeScore: 70,
    }),
  ];

  const groups = rankBestPicksByLeague(candidates, 3);
  const primary = groups.find((group) => group.league === "Test League");
  const other = groups.find((group) => group.league === "Other League");

  assert.equal(primary?.picks.length, 3);
  assert.deepEqual(
    primary?.picks.map((pick) => pick.eventId),
    ["a", "b", "c"],
  );
  assert.equal(other?.picks.length, 1);
});

test("best picks by league never duplicates the same game", () => {
  const groups = rankBestPicksByLeague(
    [
      candidate({
        eventId: "same",
        selectionName: "Home",
        edgeScore: 92,
      }),
      candidate({
        eventId: "same",
        selectionName: "Over 2.5",
        marketKey: "totals",
        point: 2.5,
        edgeScore: 88,
      }),
      candidate({
        eventId: "other",
        selectionName: "Away",
        edgeScore: 80,
      }),
    ],
    3,
  );

  assert.deepEqual(
    groups[0]?.picks.map((pick) => pick.eventId),
    ["same", "other"],
  );
});


test("opportunity ranking is probability-first and admits small price drag for safer picks", async () => {
  const source = await readFile("lib/data/uiOpportunities.ts", "utf8");

  assert.match(source, /MIN_PICK_MODEL_PROBABILITY = 0\.6/);
  assert.match(source, /MIN_PICK_ESTIMATED_VALUE = -0\.05/);
  assert.match(source, /modelProbability: \{ gte: MIN_PICK_MODEL_PROBABILITY \}/);
  assert.match(source, /estimatedValue: \{ gte: MIN_PICK_ESTIMATED_VALUE \}/);
  assert.match(
    source,
    /statusRank\(b\.status\)[\s\S]*b\.modelProbability - a\.modelProbability[\s\S]*riskRank/,
  );
});
