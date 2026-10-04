import test from "node:test";
import assert from "node:assert/strict";
import { buildMarketFeatures } from "../lib/features/market";
import { buildSportSpecificFeatures } from "../lib/features/sports";
import { calculateFeatureQuality } from "../lib/features/quality";
import { featureFingerprint } from "../lib/features/fingerprint";

test("market features keep latest bookmaker quotes and consensus summaries", () => {
  const features = buildMarketFeatures(
    [
      {
        key: "h2h",
        oddsSnapshots: [
          {
            bookmakerKey: "book-a",
            selectionKey: "h2h:alpha:na",
            selectionName: "Alpha",
            point: null,
            decimalOdds: 1.8,
            capturedAt: new Date("2026-10-03T10:00:00Z"),
          },
          {
            bookmakerKey: "book-a",
            selectionKey: "h2h:alpha:na",
            selectionName: "Alpha",
            point: null,
            decimalOdds: 1.85,
            capturedAt: new Date("2026-10-03T11:00:00Z"),
          },
          {
            bookmakerKey: "book-b",
            selectionKey: "h2h:alpha:na",
            selectionName: "Alpha",
            point: null,
            decimalOdds: 1.9,
            capturedAt: new Date("2026-10-03T11:00:00Z"),
          },
          {
            bookmakerKey: "book-a",
            selectionKey: "h2h:beta:na",
            selectionName: "Beta",
            point: null,
            decimalOdds: 2.05,
            capturedAt: new Date("2026-10-03T11:00:00Z"),
          },
          {
            bookmakerKey: "book-b",
            selectionKey: "h2h:beta:na",
            selectionName: "Beta",
            point: null,
            decimalOdds: 2.1,
            capturedAt: new Date("2026-10-03T11:00:00Z"),
          },
        ],
      },
    ],
    new Date("2026-10-03T15:00:00Z"),
  );

  assert.equal(features.marketCount, 1);
  assert.equal(features.snapshotCount, 5);
  assert.equal(features.bookmakerCount, 2);
  assert.equal(features.latestSnapshotMinutesBeforeStart, 240);
  assert.equal(features.markets[0].currentQuoteCount, 4);

  const alpha = features.markets[0].selections.find(
    (selection) => selection.selectionName === "Alpha",
  );
  assert.ok(alpha);
  assert.equal(alpha.bookmakerCount, 2);
  assert.equal(alpha.bestDecimalOdds, 1.9);
  assert.equal(alpha.meanDecimalOdds, 1.875);
  assert.ok((features.markets[0].meanRelativePriceDispersion ?? 0) > 0);
});

test("feature quality rewards evidence coverage without becoming confidence", () => {
  const emptySchedule = {
    priorEvents60d: 0,
    eventsLast7d: 0,
    restDays: null,
    backToBack: null,
  };
  const coveredSchedule = {
    priorEvents60d: 4,
    eventsLast7d: 1,
    restDays: 5,
    backToBack: false,
  };

  const low = calculateFeatureQuality({
    identityComplete: true,
    homeSchedule: emptySchedule,
    awaySchedule: emptySchedule,
    market: {
      marketCount: 0,
      snapshotCount: 0,
      bookmakerCount: 0,
      latestSnapshotMinutesBeforeStart: null,
      markets: [],
    },
    sportSpecific: {
      values: {},
      available: [],
      missing: ["recentForm", "goalsScored"],
    },
  });

  const higher = calculateFeatureQuality({
    identityComplete: true,
    homeSchedule: coveredSchedule,
    awaySchedule: coveredSchedule,
    market: {
      marketCount: 1,
      snapshotCount: 8,
      bookmakerCount: 3,
      latestSnapshotMinutesBeforeStart: 120,
      markets: [],
    },
    sportSpecific: {
      values: { homeRestDays: 5, awayRestDays: 5 },
      available: ["homeRestDays", "awayRestDays"],
      missing: ["recentForm"],
    },
  });

  assert.ok(low.overall < higher.overall);
  assert.ok(higher.overall <= 1);
  assert.equal(low.identity, 1);
});

test("sport-specific feature sets expose missing evidence explicitly", () => {
  const schedule = {
    priorEvents60d: 3,
    eventsLast7d: 1,
    restDays: 4,
    backToBack: false,
  };
  const emptyForm = {
    sampleSize: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    winRate: null,
    averageFor: null,
    averageAgainst: null,
  };
  const emptyHeadToHead = {
    sampleSize: 0,
    participantAWins: 0,
    draws: 0,
    participantBWins: 0,
    participantAWinRate: null,
    participantBWinRate: null,
    averageParticipantAScore: null,
    averageParticipantBScore: null,
  };

  const football = buildSportSpecificFeatures("football", {
    home: schedule,
    away: schedule,
    homeForm: emptyForm,
    awayForm: emptyForm,
    headToHead: emptyHeadToHead,
    participantKind: "team",
  });
  const basketball = buildSportSpecificFeatures("basketball", {
    home: schedule,
    away: schedule,
    homeForm: emptyForm,
    awayForm: emptyForm,
    headToHead: emptyHeadToHead,
    participantKind: "team",
  });
  const tennis = buildSportSpecificFeatures("tennis", {
    home: schedule,
    away: schedule,
    homeForm: emptyForm,
    awayForm: emptyForm,
    headToHead: emptyHeadToHead,
    participantKind: "player",
  });

  assert.ok(football.available.includes("homeRestDays"));
  assert.ok(football.missing.includes("expectedGoals"));
  assert.ok(basketball.missing.includes("offensiveRating"));
  assert.ok(tennis.missing.includes("playingSurface"));
  assert.ok(tennis.available.includes("playerAMatchesLast7d"));
});

test("feature fingerprints are stable for equivalent object key ordering", () => {
  const first = featureFingerprint({
    eventId: "event-1",
    schemaVersion: "features-v1",
    values: { b: 2, a: { y: 2, x: 1 } },
  });
  const second = featureFingerprint({
    eventId: "event-1",
    schemaVersion: "features-v1",
    values: { a: { x: 1, y: 2 }, b: 2 },
  });
  const changed = featureFingerprint({
    eventId: "event-1",
    schemaVersion: "features-v1",
    values: { a: { x: 1, y: 3 }, b: 2 },
  });

  assert.equal(first, second);
  assert.notEqual(first, changed);
});


test("settled recent form resolves generic form gaps without hiding unsupported metrics", () => {
  const schedule = {
    priorEvents60d: 6,
    eventsLast7d: 2,
    restDays: 3,
    backToBack: false,
  };
  const form = {
    sampleSize: 5,
    wins: 3,
    draws: 1,
    losses: 1,
    winRate: 0.6,
    averageFor: 1.8,
    averageAgainst: 1,
  };
  const headToHead = {
    sampleSize: 0,
    participantAWins: 0,
    draws: 0,
    participantBWins: 0,
    participantAWinRate: null,
    participantBWinRate: null,
    averageParticipantAScore: null,
    averageParticipantBScore: null,
  };

  const football = buildSportSpecificFeatures("football", {
    home: schedule,
    away: schedule,
    homeForm: form,
    awayForm: form,
    headToHead,
    participantKind: "team",
  });

  assert.equal(football.values.homeRecentMatches, 5);
  assert.equal(football.values.awayRecentWinRate, 0.6);
  assert.ok(football.available.includes("homeRecentAverageFor"));
  assert.ok(!football.missing.includes("recentForm"));
  assert.ok(!football.missing.includes("goalsScored"));
  assert.ok(football.missing.includes("expectedGoals"));
  assert.ok(football.missing.includes("headToHead"));
});

test("one-sided form remains explicitly incomplete", () => {
  const schedule = {
    priorEvents60d: 4,
    eventsLast7d: 1,
    restDays: 5,
    backToBack: false,
  };
  const form = {
    sampleSize: 2,
    wins: 2,
    draws: 0,
    losses: 0,
    winRate: 1,
    averageFor: 2,
    averageAgainst: 0.5,
  };
  const emptyForm = {
    sampleSize: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    winRate: null,
    averageFor: null,
    averageAgainst: null,
  };
  const emptyHeadToHead = {
    sampleSize: 0,
    participantAWins: 0,
    draws: 0,
    participantBWins: 0,
    participantAWinRate: null,
    participantBWinRate: null,
    averageParticipantAScore: null,
    averageParticipantBScore: null,
  };

  const tennis = buildSportSpecificFeatures("tennis", {
    home: schedule,
    away: schedule,
    homeForm: form,
    awayForm: emptyForm,
    headToHead: emptyHeadToHead,
    participantKind: "player",
  });

  assert.ok(tennis.available.includes("playerARecentWinRate"));
  assert.ok(tennis.missing.includes("recentForm"));
});


test("settled head-to-head resolves the matchup history gap", () => {
  const schedule = {
    priorEvents60d: 5,
    eventsLast7d: 1,
    restDays: 4,
    backToBack: false,
  };
  const form = {
    sampleSize: 3,
    wins: 2,
    draws: 0,
    losses: 1,
    winRate: 0.6667,
    averageFor: 2,
    averageAgainst: 1,
  };
  const headToHead = {
    sampleSize: 3,
    participantAWins: 2,
    draws: 0,
    participantBWins: 1,
    participantAWinRate: 0.6667,
    participantBWinRate: 0.3333,
    averageParticipantAScore: 2,
    averageParticipantBScore: 1.3333,
  };

  const tennis = buildSportSpecificFeatures("tennis", {
    home: schedule,
    away: schedule,
    homeForm: form,
    awayForm: form,
    headToHead,
    participantKind: "player",
  });

  assert.equal(tennis.values.h2hSampleSize, 3);
  assert.equal(tennis.values.h2hParticipantAWinRate, 0.6667);
  assert.ok(!tennis.missing.includes("headToHead"));
  assert.ok(tennis.missing.includes("playingSurface"));
});
