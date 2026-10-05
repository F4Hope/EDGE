import test from "node:test";
import assert from "node:assert/strict";
import { syncProviderResults } from "../lib/data/syncResults";
import { calculateModelPerformance } from "../lib/evaluation/performance";
import type { ResultProvider } from "../lib/providers/resultTypes";
import {
  buildSelectionOutcomes,
  resolveSelectionOutcome,
  settledSelectionRole,
} from "../lib/results/selectionOutcomes";

test("settled selection roles map participant aliases and draw labels", () => {
  const participants = {
    home: "Godoy Cruz FC",
    away: "Los Andes",
  };

  assert.equal(settledSelectionRole("Godoy Cruz", participants), "home");
  assert.equal(settledSelectionRole("Los Andes", participants), "away");
  assert.equal(settledSelectionRole("Draw", participants), "draw");
  assert.equal(settledSelectionRole("Unknown Club", participants), null);
});

test("selection outcomes are generated only for resolvable prediction selections", () => {
  const outcomes = buildSelectionOutcomes(
    [
      {
        selectionKey: "home-key",
        explanation: { selectionName: "Godoy Cruz" },
      },
      {
        selectionKey: "draw-key",
        explanation: { selectionName: "Draw" },
      },
      {
        selectionKey: "away-key",
        explanation: { selectionName: "Los Andes" },
      },
      {
        selectionKey: "unknown-key",
        explanation: { selectionName: "Mystery" },
      },
    ],
    "home",
    { home: "Godoy Cruz FC", away: "Los Andes" },
  );

  assert.deepEqual(outcomes, {
    "home-key": "win",
    "draw-key": "loss",
    "away-key": "loss",
  });
});

test("stored outcomes are authoritative and legacy winner payloads remain evaluable", () => {
  assert.equal(
    resolveSelectionOutcome(
      { selectionOutcomes: { "selection-a": "loss" }, winner: "home" },
      {
        selectionKey: "selection-a",
        explanation: { selectionName: "Home" },
      },
      { home: "Alpha", away: "Beta" },
    ),
    0,
  );

  assert.equal(
    resolveSelectionOutcome(
      { winner: "away" },
      {
        selectionKey: "selection-b",
        explanation: { selectionName: "Beta" },
      },
      { home: "Alpha", away: "Beta" },
    ),
    1,
  );
});

test("provider result sync persists per-selection outcomes", async () => {
  let persistedPayload: unknown = null;

  const db = {
    eventSource: {
      findUnique: async () => ({
        eventId: "event-1",
        event: {
          homeTeam: { name: "Alpha FC" },
          awayTeam: { name: "Beta" },
          homePlayer: null,
          awayPlayer: null,
          predictions: [
            {
              selectionKey: "alpha",
              explanation: { selectionName: "Alpha" },
            },
            {
              selectionKey: "draw",
              explanation: { selectionName: "Draw" },
            },
            {
              selectionKey: "beta",
              explanation: { selectionName: "Beta" },
            },
          ],
        },
      }),
    },
    event: {
      update: async () => ({ id: "event-1" }),
    },
    result: {
      upsert: async (args: {
        update: { payload: unknown };
      }) => {
        persistedPayload = args.update.payload;
        return { id: "result-1" };
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
  };

  const provider: ResultProvider = {
    name: "test-provider",
    supportsResults: () => true,
    getResults: async () => [
      {
        providerId: "provider-event-1",
        sport: "football",
        status: "final",
        completedAt: "2026-10-05T20:00:00.000Z",
        homeScore: 2,
        awayScore: 1,
        winner: "home",
        sourceStatus: "FT",
      },
    ],
  };

  const summary = await syncProviderResults(
    db as never,
    provider,
    "football",
    new Date("2026-10-05T00:00:00.000Z"),
    new Date("2026-10-05T23:59:59.999Z"),
  );

  assert.equal(summary.finalized, 1);
  assert.deepEqual(
    (persistedPayload as { selectionOutcomes: Record<string, string> })
      .selectionOutcomes,
    {
      alpha: "win",
      draw: "loss",
      beta: "loss",
    },
  );
});

test("model performance derives legacy outcomes and deduplicates prediction revisions", async () => {
  const eventStart = new Date("2026-10-05T20:00:00.000Z");
  const market = { id: "market-1", key: "h2h" };
  const completedRun = {
    modelVersion: "market-evidence-v1",
    status: "COMPLETED",
  };

  const db = {
    result: {
      findMany: async () => [
        {
          status: "FINAL",
          payload: {
            score: { home: 2, away: 1 },
            winner: "home",
          },
          event: {
            startTime: eventStart,
            sport: { key: "football" },
            homeTeam: { name: "Alpha FC" },
            awayTeam: { name: "Beta" },
            homePlayer: null,
            awayPlayer: null,
            predictions: [
              {
                selectionKey: "alpha",
                modelProbability: 0.55,
                explanation: {
                  selectionName: "Alpha",
                  marketProbability: 0.56,
                },
                createdAt: new Date("2026-10-05T16:00:00.000Z"),
                market,
                modelRun: completedRun,
              },
              {
                selectionKey: "alpha",
                modelProbability: 0.6,
                explanation: {
                  selectionName: "Alpha",
                  marketProbability: 0.58,
                },
                createdAt: new Date("2026-10-05T18:00:00.000Z"),
                market,
                modelRun: completedRun,
              },
              {
                selectionKey: "beta",
                modelProbability: 0.4,
                explanation: {
                  selectionName: "Beta",
                  marketProbability: 0.42,
                },
                createdAt: new Date("2026-10-05T18:00:00.000Z"),
                market,
                modelRun: completedRun,
              },
              {
                selectionKey: "draw",
                modelProbability: 0.2,
                explanation: { selectionName: "Draw" },
                createdAt: new Date("2026-10-05T18:00:00.000Z"),
                market,
                modelRun: {
                  modelVersion: "market-evidence-v1",
                  status: "FAILED",
                },
              },
              {
                selectionKey: "post-start",
                modelProbability: 0.9,
                explanation: { selectionName: "Alpha" },
                createdAt: new Date("2026-10-05T20:05:00.000Z"),
                market,
                modelRun: completedRun,
              },
            ],
          },
        },
      ],
    },
  };

  const report = await calculateModelPerformance(db as never);

  assert.equal(report.sampleCount, 2);
  assert.equal(report.evaluation.count, 2);
  assert.equal(report.evaluation.accuracyAtHalf, 1);
  assert.equal(report.evaluation.brierScore, 0.16);
  assert.equal(report.marketBenchmark.count, 2);
  assert.equal(report.marketBenchmark.model.brierScore, 0.16);
  assert.equal(report.marketBenchmark.market.brierScore, 0.1764);
  assert.equal(report.marketBenchmark.brierDelta, 0.0164);
  assert.equal(report.marketBenchmark.brierSkillScore, 0.092971);
  assert.equal(report.marketBenchmark.calibrationDelta, 0.02);
  assert.equal(report.eventMarketBenchmark.count, 1);
  assert.equal(report.eventMarketBenchmark.modelBrierScore, 0.16);
  assert.equal(report.eventMarketBenchmark.marketBrierScore, 0.1764);
  assert.equal(report.eventMarketBenchmark.brierDelta, 0.0164);
  assert.equal(report.eventMarketBenchmark.brierSkillScore, 0.092971);
  assert.equal(report.eventMarketBenchmark.brierDeltaCi95, null);
  assert.equal(report.eventMarketBenchmark.modelTop1Accuracy, 1);
  assert.equal(report.eventMarketBenchmark.marketTop1Accuracy, 1);
  assert.equal(report.eventMarketBenchmark.accuracyDelta, 0);
  assert.equal(report.eventMarketBenchmark.positiveLiftSupported, null);
  assert.equal(report.bySport[0]?.count, 2);
  assert.equal(report.byMarket[0]?.count, 2);
  assert.equal(report.byModelVersion[0]?.count, 2);
});


test("event market benchmark counts a three-way H2H market as one settled event", async () => {
  const eventStart = new Date("2026-10-06T20:00:00.000Z");
  const market = { id: "market-3way", key: "h2h" };
  const modelRun = {
    modelVersion: "market-evidence-v1",
    status: "COMPLETED",
  };

  const predictions = [
    {
      selectionKey: "home",
      modelProbability: 0.5,
      explanation: {
        selectionName: "Alpha",
        marketProbability: 0.46,
      },
      createdAt: new Date("2026-10-06T18:00:00.000Z"),
      market,
      modelRun,
    },
    {
      selectionKey: "draw",
      modelProbability: 0.25,
      explanation: {
        selectionName: "Draw",
        marketProbability: 0.29,
      },
      createdAt: new Date("2026-10-06T18:00:00.000Z"),
      market,
      modelRun,
    },
    {
      selectionKey: "away",
      modelProbability: 0.25,
      explanation: {
        selectionName: "Beta",
        marketProbability: 0.25,
      },
      createdAt: new Date("2026-10-06T18:00:00.000Z"),
      market,
      modelRun,
    },
  ];

  const db = {
    result: {
      findMany: async () => [
        {
          status: "FINAL",
          payload: {
            winner: "home",
            selectionOutcomes: {
              home: "win",
              draw: "loss",
              away: "loss",
            },
          },
          event: {
            startTime: eventStart,
            sport: { key: "football" },
            homeTeam: { name: "Alpha" },
            awayTeam: { name: "Beta" },
            homePlayer: null,
            awayPlayer: null,
            predictions,
          },
        },
      ],
    },
  };

  const report = await calculateModelPerformance(db as never);

  assert.equal(report.sampleCount, 3);
  assert.equal(report.marketBenchmark.count, 3);
  assert.equal(report.eventMarketBenchmark.count, 1);
  assert.equal(report.eventMarketBenchmark.brierDeltaCi95, null);
  assert.equal(report.eventMarketBenchmark.modelTop1Accuracy, 1);
  assert.equal(report.eventMarketBenchmark.marketTop1Accuracy, 1);
});


test("event benchmark reports supported positive lift when paired event deltas are consistently positive", async () => {
  const market = { id: "market-paired", key: "h2h" };
  const modelRun = {
    modelVersion: "market-evidence-v1",
    status: "COMPLETED",
  };

  const makePredictions = (
    createdAt: string,
    modelHome: number,
    marketHome: number,
  ) => [
    {
      selectionKey: "home",
      modelProbability: modelHome,
      explanation: {
        selectionName: "Alpha",
        marketProbability: marketHome,
      },
      createdAt: new Date(createdAt),
      market,
      modelRun,
    },
    {
      selectionKey: "away",
      modelProbability: 1 - modelHome,
      explanation: {
        selectionName: "Beta",
        marketProbability: 1 - marketHome,
      },
      createdAt: new Date(createdAt),
      market,
      modelRun,
    },
  ];

  const db = {
    result: {
      findMany: async () => [
        {
          status: "FINAL",
          payload: {
            winner: "home",
            selectionOutcomes: { home: "win", away: "loss" },
          },
          event: {
            startTime: new Date("2026-10-07T20:00:00.000Z"),
            sport: { key: "football" },
            homeTeam: { name: "Alpha" },
            awayTeam: { name: "Beta" },
            homePlayer: null,
            awayPlayer: null,
            predictions: makePredictions(
              "2026-10-07T18:00:00.000Z",
              0.6,
              0.55,
            ),
          },
        },
        {
          status: "FINAL",
          payload: {
            winner: "home",
            selectionOutcomes: { home: "win", away: "loss" },
          },
          event: {
            startTime: new Date("2026-10-08T20:00:00.000Z"),
            sport: { key: "football" },
            homeTeam: { name: "Alpha" },
            awayTeam: { name: "Beta" },
            homePlayer: null,
            awayPlayer: null,
            predictions: makePredictions(
              "2026-10-08T18:00:00.000Z",
              0.65,
              0.6,
            ),
          },
        },
      ],
    },
  };

  const report = await calculateModelPerformance(db as never);

  assert.equal(report.eventMarketBenchmark.count, 2);
  assert.equal(report.eventMarketBenchmark.brierDelta, 0.04);
  assert.deepEqual(report.eventMarketBenchmark.brierDeltaCi95, {
    lower: 0.0351,
    upper: 0.0449,
  });
  assert.equal(report.eventMarketBenchmark.positiveLiftSupported, true);
});
