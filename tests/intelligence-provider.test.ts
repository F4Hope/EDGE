import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  availabilityFingerprint,
  normalizeApiSportsInjury,
} from "../lib/intelligence/apiSportsInjuries";

test("normalizes a missing injured player as high-severity injury intelligence", () => {
  const signal = normalizeApiSportsInjury({
    player: {
      id: 521,
      name: "R. Lewandowski",
      type: "Missing Fixture",
      reason: "Knee Injury",
    },
    team: { id: 157, name: "Bayern Munich" },
    fixture: { id: 686314, date: "2026-10-05T19:00:00Z" },
  });

  assert.equal(signal?.type, "INJURY");
  assert.equal(signal?.severity, "HIGH");
  assert.equal(signal?.providerFixtureId, "686314");
  assert.equal(signal?.providerPlayerId, "521");
});

test("classifies explicit disciplinary absence as suspension", () => {
  const signal = normalizeApiSportsInjury({
    player: {
      id: 42,
      name: "Player Example",
      type: "Missing Fixture",
      reason: "Suspended",
    },
    team: { id: 2, name: "Example FC" },
    fixture: { id: 99 },
  });

  assert.equal(signal?.type, "SUSPENSION");
  assert.equal(signal?.severity, "HIGH");
});

test("keeps uncertain non-medical availability as lineup intelligence", () => {
  const signal = normalizeApiSportsInjury({
    player: {
      id: 7,
      name: "Questionable Player",
      type: "Questionable",
      reason: "Coach decision",
    },
    team: { id: 3, name: "Example FC" },
    fixture: { id: 100 },
  });

  assert.equal(signal?.type, "LINEUP");
  assert.equal(signal?.severity, "MEDIUM");
});

test("availability fingerprint remains stable when the report reason changes", () => {
  assert.equal(
    availabilityFingerprint("686314", "521"),
    availabilityFingerprint("686314", "521"),
  );
  assert.notEqual(
    availabilityFingerprint("686314", "521"),
    availabilityFingerprint("686314", "510"),
  );
});

test("rejects incomplete provider rows instead of inventing identity", () => {
  const signal = normalizeApiSportsInjury({
    player: { name: "Unknown" },
    fixture: { id: 1 },
  });

  assert.equal(signal, null);
});

test("injury sync uses date queries instead of premium ids batching", async () => {
  const source = await readFile("scripts/sync-intelligence.ts", "utf8");

  assert.match(source, /requestInjuriesForDate/);
  assert.match(source, /url\.searchParams\.set\("date", date\)/);
  assert.match(source, /API_SPORTS_EVENT_FORWARD_HOURS/);
  assert.doesNotMatch(source, /url\.searchParams\.set\("ids"/);
});
