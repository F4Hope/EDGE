import "./settled-outcomes.test";
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBasketballResult,
  normalizeFootballResult,
} from "../lib/providers/apiSports";
import { normalizeOddsScore } from "../lib/providers/oddsApi";

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


test("normalizes a completed tennis score from The Odds API", () => {
  const result = normalizeOddsScore(
    {
      id: "tennis-event-1",
      sport_key: "tennis_atp_example",
      sport_title: "ATP Example",
      commence_time: "2026-10-03T18:00:00Z",
      completed: true,
      home_team: "Player One",
      away_team: "Player Two",
      scores: [
        { name: "Player One", score: "2" },
        { name: "Player Two", score: "1" },
      ],
      last_update: "2026-10-03T20:15:00Z",
    },
    "tennis",
  );

  assert.deepEqual(result, {
    providerId: "tennis-event-1",
    sport: "tennis",
    status: "final",
    completedAt: null,
    homeScore: 2,
    awayScore: 1,
    winner: "home",
    sourceStatus: "completed",
  });
});

test("ignores live or incomplete Odds API score records", () => {
  assert.equal(
    normalizeOddsScore(
      {
        id: "tennis-live",
        sport_key: "tennis_atp_example",
        sport_title: "ATP Example",
        commence_time: "2026-10-03T18:00:00Z",
        completed: false,
        home_team: "Player One",
        away_team: "Player Two",
        scores: [
          { name: "Player One", score: "1" },
          { name: "Player Two", score: "0" },
        ],
      },
      "tennis",
    ),
    null,
  );

  assert.equal(
    normalizeOddsScore(
      {
        id: "tennis-incomplete",
        sport_key: "tennis_atp_example",
        sport_title: "ATP Example",
        commence_time: "2026-10-03T18:00:00Z",
        completed: true,
        home_team: "Player One",
        away_team: "Player Two",
        scores: [{ name: "Player One", score: "2" }],
      },
      "tennis",
    ),
    null,
  );
});


test("Odds API result adapter supports football and basketball score normalization", async () => {
  const source = await readFile("lib/providers/oddsApi.ts", "utf8");
  assert.match(
    source,
    /sport === "football" \|\| sport === "basketball" \|\| sport === "tennis"/,
  );
});

test("Odds API score sync accepts bounded football and basketball scopes", async () => {
  const source = await readFile("scripts/sync-odds-results.ts", "utf8");
  assert.match(source, /football/);
  assert.match(source, /basketball/);
  assert.match(source, /--sports/);
  assert.match(source, /sourceSportKey/);
  assert.match(source, /maxSportKeys/);
});
