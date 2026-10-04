import test from "node:test";
import assert from "node:assert/strict";
import { buildEventChangeSignals } from "../lib/intelligence/eventChanges";

const observedAt = new Date("2026-10-04T12:00:00Z");

test("initially unchanged event creates no intelligence", () => {
  const state = {
    startTime: new Date("2026-10-05T18:00:00Z"),
    status: "SCHEDULED",
  };

  assert.deepEqual(
    buildEventChangeSignals("api-sports", "101", state, state, observedAt),
    [],
  );
});

test("meaningful schedule move creates auditable schedule-change intelligence", () => {
  const signals = buildEventChangeSignals(
    "api-sports",
    "101",
    {
      startTime: new Date("2026-10-05T18:00:00Z"),
      status: "SCHEDULED",
    },
    {
      startTime: new Date("2026-10-05T21:00:00Z"),
      status: "SCHEDULED",
    },
    observedAt,
  );

  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "SCHEDULE_CHANGE");
  assert.equal(signals[0].severity, "MEDIUM");
  assert.equal(signals[0].metadata.deltaMinutes, 180);
});

test("sub-minute provider timestamp drift is ignored", () => {
  const signals = buildEventChangeSignals(
    "api-sports",
    "101",
    {
      startTime: new Date("2026-10-05T18:00:00Z"),
      status: "SCHEDULED",
    },
    {
      startTime: new Date("2026-10-05T18:00:30Z"),
      status: "SCHEDULED",
    },
    observedAt,
  );

  assert.equal(signals.length, 0);
});

test("postponement creates high-severity provider intelligence", () => {
  const signals = buildEventChangeSignals(
    "api-sports",
    "101",
    {
      startTime: new Date("2026-10-05T18:00:00Z"),
      status: "SCHEDULED",
    },
    {
      startTime: new Date("2026-10-05T18:00:00Z"),
      status: "POSTPONED",
    },
    observedAt,
  );

  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "POSTPONEMENT");
  assert.equal(signals[0].severity, "HIGH");
});

test("a 24-hour schedule move is high severity", () => {
  const signals = buildEventChangeSignals(
    "api-sports",
    "101",
    {
      startTime: new Date("2026-10-05T18:00:00Z"),
      status: "SCHEDULED",
    },
    {
      startTime: new Date("2026-10-06T18:00:00Z"),
      status: "SCHEDULED",
    },
    observedAt,
  );

  assert.equal(signals[0].severity, "HIGH");
});
