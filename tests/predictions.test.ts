import test from "node:test";
import assert from "node:assert/strict";
import {
  buildH2hPredictionCandidates,
  PREDICTION_MODEL_VERSION,
} from "../lib/prediction/model";
import type { FeatureVector } from "../lib/features/types";

function feature(): FeatureVector {
  return {
    schemaVersion: "features-v3",
    eventId: "event-1",
    sport: "football",
    identity: {
      league: "Test League",
      country: "CM",
      startsAt: "2026-10-05T18:00:00.000Z",
      homeParticipant: "Alpha FC",
      awayParticipant: "Beta FC",
      participantKind: "team",
    },
    temporal: {
      daysUntilStart: 1,
      eventHourUtc: 18,
      home: {
        priorEvents60d: 6,
        eventsLast7d: 1,
        restDays: 5,
        backToBack: false,
      },
      away: {
        priorEvents60d: 6,
        eventsLast7d: 2,
        restDays: 3,
        backToBack: false,
      },
    },
    form: {
      home: {
        sampleSize: 5,
        wins: 4,
        draws: 0,
        losses: 1,
        winRate: 0.8,
        averageFor: 2,
        averageAgainst: 1,
      },
      away: {
        sampleSize: 5,
        wins: 2,
        draws: 1,
        losses: 2,
        winRate: 0.4,
        averageFor: 1.2,
        averageAgainst: 1.4,
      },
    },
    headToHead: {
      sampleSize: 3,
      participantAWins: 2,
      draws: 0,
      participantBWins: 1,
      participantAWinRate: 0.6667,
      participantBWinRate: 0.3333,
      averageParticipantAScore: 1.7,
      averageParticipantBScore: 1,
    },
    market: {
      marketCount: 1,
      snapshotCount: 6,
      bookmakerCount: 3,
      latestSnapshotMinutesBeforeStart: 60,
      markets: [],
    },
    sportSpecific: {
      values: {},
      available: [],
      missing: [],
    },
    quality: {
      identity: 1,
      scheduleContext: 1,
      marketCoverage: 1,
      bookmakerBreadth: 1,
      sportSpecificCoverage: 0.8,
      overall: 0.86,
    },
  };
}

test("prediction model version is explicit and stable", () => {
  assert.equal(PREDICTION_MODEL_VERSION, "market-evidence-v1");
});

test("H2H candidates are normalized and evidence shifts probability conservatively", () => {
  const candidates = buildH2hPredictionCandidates(feature(), {
    key: "h2h",
    snapshotCount: 6,
    bookmakerCount: 3,
    currentQuoteCount: 6,
    meanRelativePriceDispersion: 0.02,
    selections: [
      {
        selectionName: "Alpha FC",
        point: null,
        bookmakerCount: 3,
        meanDecimalOdds: 2.05,
        bestDecimalOdds: 2.1,
        meanImpliedProbability: 0.4878,
      },
      {
        selectionName: "Draw",
        point: null,
        bookmakerCount: 3,
        meanDecimalOdds: 3.4,
        bestDecimalOdds: 3.5,
        meanImpliedProbability: 0.2941,
      },
      {
        selectionName: "Beta FC",
        point: null,
        bookmakerCount: 3,
        meanDecimalOdds: 3.1,
        bestDecimalOdds: 3.2,
        meanImpliedProbability: 0.3226,
      },
    ],
  });

  assert.equal(candidates.length, 3);
  const total = candidates.reduce(
    (sum, candidate) => sum + candidate.modelProbability,
    0,
  );
  assert.ok(Math.abs(total - 1) < 0.00001);

  const home = candidates.find((candidate) => candidate.selectionName === "Alpha FC");
  const away = candidates.find((candidate) => candidate.selectionName === "Beta FC");
  assert.ok(home);
  assert.ok(away);
  assert.ok(home.modelProbability > home.marketProbability);
  assert.ok(away.modelProbability < away.marketProbability);
  assert.equal(home.status, "WATCH");
});

test("weak market coverage keeps prediction in NO_BET state", () => {
  const low = feature();
  low.quality.overall = 0.4;

  const candidates = buildH2hPredictionCandidates(low, {
    key: "h2h",
    snapshotCount: 2,
    bookmakerCount: 1,
    currentQuoteCount: 2,
    meanRelativePriceDispersion: null,
    selections: [
      {
        selectionName: "Alpha FC",
        point: null,
        bookmakerCount: 1,
        meanDecimalOdds: 1.9,
        bestDecimalOdds: 1.9,
        meanImpliedProbability: 1 / 1.9,
      },
      {
        selectionName: "Beta FC",
        point: null,
        bookmakerCount: 1,
        meanDecimalOdds: 2.1,
        bestDecimalOdds: 2.1,
        meanImpliedProbability: 1 / 2.1,
      },
    ],
  });

  assert.equal(candidates.length, 2);
  assert.ok(candidates.every((candidate) => candidate.status === "NO_BET"));
  assert.ok(candidates.every((candidate) => candidate.risk === "HIGH"));
});
