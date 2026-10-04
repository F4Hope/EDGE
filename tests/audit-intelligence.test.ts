import test from "node:test";
import assert from "node:assert/strict";
import { validateResultImportRecord } from "../lib/results/validate";
import { validateIntelligenceRecord } from "../lib/intelligence/validate";
import { evaluateBinaryProbabilities } from "../lib/evaluation/metrics";
import { analyzeMarketMovement } from "../lib/odds/movement";

test("result imports validate auditable event records", () => {
  const record = validateResultImportRecord({
    eventId: "event-1",
    status: "FINAL",
    completedAt: "2026-10-04T12:00:00Z",
    payload: { score: { home: 2, away: 1 } },
  });

  assert.equal(record.status, "FINAL");
  assert.equal(record.eventId, "event-1");
});

test("intelligence imports require typed severity and source", () => {
  const record = validateIntelligenceRecord({
    eventId: "event-1",
    type: "INJURY",
    severity: "HIGH",
    source: "verified-provider",
    headline: "Player unavailable",
    occurredAt: "2026-10-04T10:00:00Z",
  });

  assert.equal(record.type, "INJURY");
  assert.equal(record.severity, "HIGH");
});

test("binary evaluation reports calibration without inventing samples", () => {
  const empty = evaluateBinaryProbabilities([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.accuracyAtHalf, null);

  const report = evaluateBinaryProbabilities([
    { probability: 0.8, outcome: 1 },
    { probability: 0.7, outcome: 1 },
    { probability: 0.3, outcome: 0 },
    { probability: 0.4, outcome: 0 },
  ]);

  assert.equal(report.count, 4);
  assert.equal(report.accuracyAtHalf, 1);
  assert.ok((report.brierScore ?? 1) < 0.2);
});

test("odds movement is descriptive and flags rapid probability shifts", () => {
  const summary = analyzeMarketMovement(
    [
      {
        bookmakerKey: "book-a",
        selectionKey: "alpha",
        selectionName: "Alpha",
        point: null,
        decimalOdds: 2,
        capturedAt: new Date("2026-10-04T10:00:00Z"),
      },
      {
        bookmakerKey: "book-a",
        selectionKey: "alpha",
        selectionName: "Alpha",
        point: null,
        decimalOdds: 1.65,
        capturedAt: new Date("2026-10-04T12:00:00Z"),
      },
    ],
    new Date("2026-10-05T15:00:00Z"),
  );

  assert.equal(summary.movements[0].direction, "SHORTENING");
  assert.equal(summary.movements[0].rapid, true);
  assert.equal(summary.flagged, true);
});
