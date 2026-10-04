import test from "node:test";
import assert from "node:assert/strict";
import { describeFreshness } from "../lib/system/freshness";

const now = new Date("2026-10-04T12:00:00Z");

test("freshness distinguishes fresh, aging, stale, and empty evidence", () => {
  assert.deepEqual(
    describeFreshness("2026-10-04T11:45:00Z", now, 30, 120),
    { state: "FRESH", ageMinutes: 15 },
  );
  assert.deepEqual(
    describeFreshness("2026-10-04T11:00:00Z", now, 30, 120),
    { state: "AGING", ageMinutes: 60 },
  );
  assert.deepEqual(
    describeFreshness("2026-10-04T08:00:00Z", now, 30, 120),
    { state: "STALE", ageMinutes: 240 },
  );
  assert.deepEqual(describeFreshness(null, now, 30, 120), {
    state: "EMPTY",
    ageMinutes: null,
  });
});

test("future provider timestamps do not produce negative ages", () => {
  assert.deepEqual(
    describeFreshness("2026-10-04T12:05:00Z", now, 30, 120),
    { state: "FRESH", ageMinutes: 0 },
  );
});
