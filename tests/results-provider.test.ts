import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBasketballResult,
  normalizeFootballResult,
} from "../lib/providers/apiSports";

test("normalizes a final football score without inventing completion time", () => {
  const result = normalizeFootballResult({
    fixture: {
      id: 9001,
      date: "2026-10-03T18:00:00Z",
      status: { short: "FT" },
    },
    goals: { home: 2, away: 1 },
  });

  assert.deepEqual(result, {
    providerId: "9001",
    sport: "football",
    status: "final",
    completedAt: null,
    homeScore: 2,
    awayScore: 1,
    winner: "home",
    sourceStatus: "FT",
  });
});

test("ignores non-final football results", () => {
  const result = normalizeFootballResult({
    fixture: { id: 9002, status: { short: "2H" } },
    goals: { home: 1, away: 1 },
  });

  assert.equal(result, null);
});

test("marks cancelled football events void", () => {
  const result = normalizeFootballResult({
    fixture: { id: 9003, status: { short: "CANC" } },
  });

  assert.equal(result?.status, "void");
  assert.equal(result?.homeScore, null);
  assert.equal(result?.winner, null);
});

test("normalizes a final basketball score", () => {
  const result = normalizeBasketballResult({
    id: 8001,
    status: { short: "FT" },
    scores: {
      home: { total: 104 },
      away: { total: 99 },
    },
  });

  assert.equal(result?.status, "final");
  assert.equal(result?.winner, "home");
  assert.equal(result?.homeScore, 104);
  assert.equal(result?.awayScore, 99);
});

test("does not convert incomplete final scores into fabricated numbers", () => {
  const result = normalizeBasketballResult({
    id: 8002,
    status: { short: "FT" },
    scores: {
      home: { total: null },
      away: { total: 88 },
    },
  });

  assert.equal(result?.status, "final");
  assert.equal(result?.homeScore, null);
  assert.equal(result?.winner, null);
});
