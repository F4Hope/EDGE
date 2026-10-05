import test from "node:test";
import assert from "node:assert/strict";
import {
  buildComboResearchTask,
  researchEvidenceFingerprint,
  validateSourceBackedResearchEvidence,
} from "../lib/intelligence/researchEvidence";

test("source-backed research requires attributable URL and explicit direction", () => {
  const record = validateSourceBackedResearchEvidence({
    eventId: "event-1",
    predictionId: "prediction-1",
    selectionName: "Alpha FC",
    evidenceType: "INJURY",
    severity: "HIGH",
    direction: "SUPPORTS_SELECTION",
    confidence: 0.8,
    sourceName: "Example Sports",
    sourceUrl: "https://example.com/news/alpha#section",
    headline: "Opponent striker ruled out",
    summary: "Confirmed unavailable before the fixture.",
    rationale: "The absence weakens the opposing attack.",
    publishedAt: "2026-10-05T10:00:00Z",
    observedAt: "2026-10-05T10:15:00Z",
  });

  assert.equal(record.direction, "SUPPORTS_SELECTION");
  assert.equal(record.confidence, 0.8);
  assert.equal(record.sourceUrl, "https://example.com/news/alpha");
});

test("source-backed research rejects non-http URLs and invalid confidence", () => {
  assert.throws(
    () =>
      validateSourceBackedResearchEvidence({
        eventId: "event-1",
        predictionId: "prediction-1",
        selectionName: "Alpha FC",
        evidenceType: "NEWS",
        severity: "LOW",
        direction: "NEUTRAL",
        confidence: 1.2,
        sourceName: "Bad Source",
        sourceUrl: "javascript:alert(1)",
        headline: "Bad",
        rationale: "Bad",
        publishedAt: "2026-10-05T10:00:00Z",
        observedAt: "2026-10-05T10:05:00Z",
      }),
    /confidence must be between 0 and 1/,
  );

  assert.throws(
    () =>
      validateSourceBackedResearchEvidence({
        eventId: "event-1",
        predictionId: "prediction-1",
        selectionName: "Alpha FC",
        evidenceType: "NEWS",
        severity: "LOW",
        direction: "NEUTRAL",
        confidence: 0.5,
        sourceName: "Bad Source",
        sourceUrl: "javascript:alert(1)",
        headline: "Bad",
        rationale: "Bad",
        publishedAt: "2026-10-05T10:00:00Z",
        observedAt: "2026-10-05T10:05:00Z",
      }),
    /must use http or https/,
  );
});

test("research evidence fingerprint is stable for the same attributed record", () => {
  const input = {
    eventId: "event-1",
    predictionId: "prediction-1",
    evidenceType: "FORM" as const,
    sourceUrl: "https://example.com/form",
    headline: "Recent form",
    publishedAt: "2026-10-05T09:00:00.000Z",
  };

  assert.equal(
    researchEvidenceFingerprint(input),
    researchEvidenceFingerprint(input),
  );
});

test("combo research task creates sport-specific attributable search queries", () => {
  const tennis = buildComboResearchTask({
    eventId: "event-1",
    predictionId: "prediction-1",
    sport: "tennis",
    league: "WTA",
    startsAt: "2026-10-05T18:00:00.000Z",
    matchup: "Daria Snigur vs Mirra Andreeva",
    selectionName: "Daria Snigur",
    decimalOdds: 6.4,
    bookmakerName: "Example Book",
    oddsProvider: "odds-api",
  });

  assert.equal(tennis.searchQueries.length, 3);
  assert.match(tennis.searchQueries[0], /injury withdrawal fitness news/);
  assert.match(tennis.searchQueries[1], /recent form results statistics/);
  assert.ok(tennis.requiredEvidence.includes("WITHDRAWAL"));
  assert.equal(tennis.oddsSource, "Example Book · odds-api");

  const football = buildComboResearchTask({
    eventId: "event-2",
    predictionId: "prediction-2",
    sport: "football",
    league: "Liga",
    startsAt: "2026-10-05T20:00:00.000Z",
    matchup: "Alpha vs Beta",
    selectionName: "Alpha",
    decimalOdds: 2.2,
    bookmakerName: null,
    oddsProvider: "api-sports",
  });

  assert.match(football.searchQueries[0], /injuries suspensions lineup team news/);
  assert.ok(football.requiredEvidence.includes("LINEUP"));
  assert.ok(football.requiredEvidence.includes("SUSPENSION"));
});
