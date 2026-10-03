import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBasketballGame,
  normalizeFootballFixture,
} from "../lib/providers/apiSports";
import { normalizeOddsEvent } from "../lib/providers/oddsApi";

test("normalizes API-Sports football fixtures", () => {
  const event = normalizeFootballFixture({
    fixture: { id: 101, date: "2026-10-04T19:00:00+00:00", status: { short: "NS" } },
    league: { id: 39, name: "Premier League", country: "England" },
    teams: {
      home: { id: 1, name: "Alpha FC", code: "ALP" },
      away: { id: 2, name: "Beta FC", code: "BET" },
    },
  });

  assert.equal(event.providerId, "101");
  assert.equal(event.sport, "football");
  assert.equal(event.status, "scheduled");
  assert.equal(event.home.kind, "team");
  assert.equal(event.competition.name, "Premier League");
});

test("normalizes API-Sports basketball games", () => {
  const event = normalizeBasketballGame({
    id: 202,
    date: "2026-10-04T20:00:00+00:00",
    status: { short: "Q2" },
    league: { id: 12, name: "NBA" },
    country: { name: "USA" },
    teams: {
      home: { id: 10, name: "Home Hoops" },
      away: { id: 11, name: "Away Hoops" },
    },
  });

  assert.equal(event.providerId, "202");
  assert.equal(event.sport, "basketball");
  assert.equal(event.status, "live");
  assert.equal(event.competition.country, "USA");
});

test("normalizes The Odds API tennis events as player participants", () => {
  const event = normalizeOddsEvent(
    {
      id: "tennis-303",
      sport_key: "tennis_atp_example",
      sport_title: "ATP Example",
      commence_time: "2026-10-04T12:00:00Z",
      home_team: "Player One",
      away_team: "Player Two",
    },
    "tennis",
  );

  assert.equal(event.sport, "tennis");
  assert.equal(event.status, "unknown");
  assert.equal(event.home.kind, "player");
  assert.equal(event.away.kind, "player");
  assert.equal(event.competition.id, "tennis_atp_example");
});
