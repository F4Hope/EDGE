import test from "node:test";
import assert from "node:assert/strict";
import {
  buildResearchSignalDraft,
  persistedSignalType,
  researchSelectionMatches,
} from "../lib/intelligence/researchImport";
import {
  validateSourceBackedResearchEvidence,
} from "../lib/intelligence/researchEvidence";

function evidence() {
  return validateSourceBackedResearchEvidence({
    eventId: "event-1",
    predictionId: "prediction-1",
    selectionName: "Alpha FC",
    evidenceType: "FORM",
    severity: "MEDIUM",
    direction: "SUPPORTS_SELECTION",
    confidence: 0.72,
    sourceName: "Example Sports",
    sourceUrl: "https://example.com/form/alpha",
    headline: "Alpha enter fixture in strong form",
    summary: "Five-match form review.",
    rationale: "Recent settled results favor Alpha.",
    publishedAt: "2026-10-05T10:00:00Z",
    observedAt: "2026-10-05T10:05:00Z",
  });
}

test("generic research categories persist as NEWS while retaining exact evidence type", () => {
  assert.equal(persistedSignalType("FORM"), "NEWS");
  assert.equal(persistedSignalType("HEAD_TO_HEAD"), "NEWS");
  assert.equal(persistedSignalType("STATISTICS"), "NEWS");

  const signal = buildResearchSignalDraft(evidence());
  assert.equal(signal.type, "NEWS");
  assert.equal(signal.metadata.researchEvidence.evidenceType, "FORM");
});

test("native availability categories retain their intelligence type", () => {
  assert.equal(persistedSignalType("INJURY"), "INJURY");
  assert.equal(persistedSignalType("SUSPENSION"), "SUSPENSION");
  assert.equal(persistedSignalType("LINEUP"), "LINEUP");
  assert.equal(persistedSignalType("WITHDRAWAL"), "WITHDRAWAL");
  assert.equal(persistedSignalType("WEATHER"), "WEATHER");
});

test("research signal draft preserves attributable provenance and direction", () => {
  const signal = buildResearchSignalDraft(evidence());

  assert.equal(signal.source, "web-research:Example Sports");
  assert.equal(
    signal.metadata.researchEvidence.sourceUrl,
    "https://example.com/form/alpha",
  );
  assert.equal(
    signal.metadata.researchEvidence.direction,
    "SUPPORTS_SELECTION",
  );
  assert.equal(signal.metadata.researchEvidence.confidence, 0.72);
  assert.equal(signal.metadata.researchEvidence.predictionId, "prediction-1");
  assert.ok(signal.fingerprint.length > 20);
});

test("research signal draft never stores bookmaker odds", () => {
  const signal = buildResearchSignalDraft(evidence());
  const serialized = JSON.stringify(signal);

  assert.doesNotMatch(serialized, /decimalOdds/);
  assert.doesNotMatch(serialized, /bookmaker/);
  assert.doesNotMatch(serialized, /oddsProvider/);
});

test("selection linkage is normalized but remains exact", () => {
  assert.equal(researchSelectionMatches("Alpha FC", "alpha-fc"), true);
  assert.equal(researchSelectionMatches("Álpha FC", "Alpha FC"), true);
  assert.equal(researchSelectionMatches("Alpha FC", "Beta FC"), false);
});

test("research import script enforces event, prediction, selection and pre-event linkage", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("scripts/import-research-evidence.ts", "utf8"),
  );

  assert.match(source, /Unknown predictionId/);
  assert.match(source, /eventId does not match prediction/);
  assert.match(source, /selectionName does not match prediction/);
  assert.match(source, /published at or after event start/);
  assert.match(source, /observed at or after event start/);
  assert.match(source, /intelligenceSignal\.upsert/);
  assert.match(source, /expiresAt: prediction\.event\.startTime/);
});
