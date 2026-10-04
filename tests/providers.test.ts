import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiSportsProvider,
  normalizeBasketballGame,
  normalizeFootballFixture,
} from "../lib/providers/apiSports";
import {
  OddsApiProvider,
  normalizeOddsEvent,
} from "../lib/providers/oddsApi";

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


test("football discovery queries API-Sports by UTC date instead of standalone from/to", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
    requestedUrls.push(url.toString());

    const day = url.searchParams.get("date") ?? "2026-10-04";
    return new Response(
      JSON.stringify({
        errors: [],
        results: 1,
        response: [
          {
            fixture: {
              id: day === "2026-10-04" ? 1001 : 1002,
              date: day + "T18:00:00+00:00",
              status: { short: "NS" },
            },
            league: {
              id: 39,
              name: "Example League",
              country: "Example",
            },
            teams: {
              home: { id: 1, name: "Alpha FC" },
              away: { id: 2, name: "Beta FC" },
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const provider = new ApiSportsProvider("test-key");
    const events = await provider.getEvents({
      sport: "football",
      from: new Date("2026-10-04T12:00:00Z"),
      to: new Date("2026-10-05T12:00:00Z"),
    });

    assert.equal(events.length, 2);
    assert.deepEqual(
      requestedUrls.map((value) => new URL(value).searchParams.get("date")),
      ["2026-10-04", "2026-10-05"],
    );

    for (const value of requestedUrls) {
      const params = new URL(value).searchParams;
      assert.equal(params.get("from"), null);
      assert.equal(params.get("to"), null);
      assert.equal(params.get("timezone"), "UTC");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("tennis discovery caps sport keys before event requests", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
    requestedUrls.push(url.toString());

    if (url.pathname.endsWith("/sports")) {
      return new Response(
        JSON.stringify([
          {
            key: "tennis_atp_alpha",
            group: "Tennis",
            title: "ATP Alpha",
            active: true,
          },
          {
            key: "tennis_atp_beta",
            group: "Tennis",
            title: "ATP Beta",
            active: true,
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify([
        {
          id: "tennis-event-1",
          sport_key: "tennis_atp_alpha",
          sport_title: "ATP Alpha",
          commence_time: "2026-10-04T12:00:00Z",
          home_team: "Player One",
          away_team: "Player Two",
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const provider = new OddsApiProvider("test-key");
    const events = await provider.getEvents({
      sport: "tennis",
      from: new Date("2026-10-04T00:00:00Z"),
      to: new Date("2026-10-04T23:59:59Z"),
      maxSourceSportKeys: 1,
    });

    assert.equal(events.length, 1);
    assert.equal(requestedUrls.length, 2);
    assert.match(requestedUrls[0], /\/v4\/sports\/\?/);
    assert.match(requestedUrls[1], /tennis_atp_alpha\/events/);
    assert.doesNotMatch(requestedUrls.join("\n"), /tennis_atp_beta\/events/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tennis discovery honors explicit sport keys before event requests", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
    requestedUrls.push(url.toString());

    if (url.pathname.endsWith("/sports")) {
      return new Response(
        JSON.stringify([
          {
            key: "tennis_atp_alpha",
            group: "Tennis",
            title: "ATP Alpha",
            active: true,
          },
          {
            key: "tennis_atp_beta",
            group: "Tennis",
            title: "ATP Beta",
            active: true,
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify([
        {
          id: "tennis-event-2",
          sport_key: "tennis_atp_beta",
          sport_title: "ATP Beta",
          commence_time: "2026-10-04T14:00:00Z",
          home_team: "Player Three",
          away_team: "Player Four",
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const provider = new OddsApiProvider("test-key");
    const events = await provider.getEvents({
      sport: "tennis",
      from: new Date("2026-10-04T00:00:00Z"),
      to: new Date("2026-10-04T23:59:59Z"),
      sourceSportKeys: ["tennis_atp_beta"],
      maxSourceSportKeys: 1,
    });

    assert.equal(events.length, 1);
    assert.equal(requestedUrls.length, 2);
    assert.match(requestedUrls[1], /tennis_atp_beta\/events/);
    assert.doesNotMatch(requestedUrls.join("\n"), /tennis_atp_alpha\/events/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
