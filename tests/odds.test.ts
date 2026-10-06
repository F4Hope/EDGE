import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOddsPayload, OddsApiProvider } from "../lib/providers/oddsApi";
import {
  makeSelectionKey,
  makeSnapshotFingerprint,
} from "../lib/data/syncOdds";
import { providerParticipantNamesEquivalent } from "../lib/data/eventIdentity";
import { normalizeApiSportsMatchWinnerRow } from "../lib/providers/apiSportsOdds";

test("normalizes featured decimal odds and ignores unsupported markets", () => {
  const event = normalizeOddsPayload(
    {
      id: "event-1",
      sport_key: "soccer_epl",
      sport_title: "EPL",
      commence_time: "2026-10-05T15:00:00Z",
      home_team: "Alpha FC",
      away_team: "Beta FC",
      bookmakers: [
        {
          key: "book-a",
          title: "Book A",
          last_update: "2026-10-03T22:00:00Z",
          markets: [
            {
              key: "h2h",
              last_update: "2026-10-03T22:01:00Z",
              outcomes: [
                { name: "Alpha FC", price: 1.8 },
                { name: "Beta FC", price: 2.2 },
              ],
            },
            {
              key: "player_goals",
              outcomes: [{ name: "Player X", price: 3.5 }],
            },
          ],
        },
      ],
    },
    "football",
  );

  assert.equal(event.providerId, "event-1");
  assert.equal(event.bookmakers.length, 1);
  assert.equal(event.bookmakers[0].markets.length, 1);
  assert.equal(event.bookmakers[0].markets[0].key, "h2h");
  assert.equal(event.bookmakers[0].markets[0].outcomes[0].price, 1.8);
});

test("selection keys distinguish featured and double chance markets", () => {
  assert.equal(
    makeSelectionKey("spreads", { name: "Alpha FC", price: 1.91, point: -1.5 }),
    "spreads:alpha-fc:-1.5",
  );
  assert.equal(
    makeSelectionKey("totals", { name: "Over", price: 1.88, point: 2.5 }),
    "totals:over:2.5",
  );
  assert.equal(
    makeSelectionKey("double_chance", { name: "Home/Draw", price: 1.22 }),
    "double_chance:home-draw:na",
  );
});

test("snapshot fingerprint deduplicates the same provider update", () => {
  const base = {
    marketId: "market-1",
    provider: "odds-api",
    bookmakerKey: "book-a",
    selectionKey: "h2h:alpha-fc:na",
    point: null,
    decimalOdds: 1.82,
    providerUpdatedAt: new Date("2026-10-03T22:01:00Z"),
  };

  const first = makeSnapshotFingerprint(base);
  const duplicate = makeSnapshotFingerprint(base);
  const changedPrice = makeSnapshotFingerprint({
    ...base,
    decimalOdds: 1.85,
  });

  assert.equal(first, duplicate);
  assert.notEqual(first, changedPrice);
});


test("Odds API timestamps omit milliseconds for event discovery", async () => {
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
            key: "tennis_atp_china_open",
            group: "Tennis",
            title: "ATP China Open",
            active: true,
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const provider = new OddsApiProvider("test-key");
    await provider.getEvents({
      sport: "tennis",
      from: new Date("2026-10-04T00:00:00.000Z"),
      to: new Date("2026-10-04T23:59:59.999Z"),
      sourceSportKeys: ["tennis_atp_china_open"],
      maxSourceSportKeys: 1,
    });

    const eventUrl = requestedUrls
      .map((value) => new URL(value))
      .find((url) => url.pathname.includes("/events"));

    assert.ok(eventUrl);
    assert.equal(
      eventUrl.searchParams.get("commenceTimeFrom"),
      "2026-10-04T00:00:00Z",
    );
    assert.equal(
      eventUrl.searchParams.get("commenceTimeTo"),
      "2026-10-04T23:59:59Z",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Odds API timestamps omit milliseconds for odds queries", async () => {
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

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const provider = new OddsApiProvider("test-key");
    await provider.getOdds({
      sport: "tennis",
      sportKeys: ["tennis_atp_china_open"],
      regions: ["eu"],
      markets: ["h2h"],
      from: new Date("2026-10-04T00:00:00.000Z"),
      to: new Date("2026-10-04T23:59:59.999Z"),
    });

    const oddsUrl = requestedUrls
      .map((value) => new URL(value))
      .find((url) => url.pathname.includes("/odds"));

    assert.ok(oddsUrl);
    assert.equal(
      oddsUrl.searchParams.get("commenceTimeFrom"),
      "2026-10-04T00:00:00Z",
    );
    assert.equal(
      oddsUrl.searchParams.get("commenceTimeTo"),
      "2026-10-04T23:59:59Z",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("cross-provider identity matches conservative football naming variants", () => {
  assert.equal(
    providerParticipantNamesEquivalent("Talleres", "Talleres Cordoba"),
    true,
  );
  assert.equal(
    providerParticipantNamesEquivalent(
      "Belgrano de Cordoba",
      "Belgrano Cordoba",
    ),
    true,
  );
  assert.equal(
    providerParticipantNamesEquivalent("Argentinos JRS", "Argentinos Juniors"),
    true,
  );
  assert.equal(
    providerParticipantNamesEquivalent("Tigre", "CA Tigre BA"),
    true,
  );
});

test("cross-provider identity still rejects materially different clubs", () => {
  assert.equal(
    providerParticipantNamesEquivalent("Manchester United", "Manchester City"),
    false,
  );
  assert.equal(
    providerParticipantNamesEquivalent("Real Madrid", "Atletico Madrid"),
    false,
  );
});


test("normalizes API-Sports Match Winner odds", () => {
  const normalized = normalizeApiSportsMatchWinnerRow({
    fixture: {
      id: 1493152,
      date: "2026-10-04T22:15:00+00:00",
    },
    league: {
      id: 128,
      name: "Liga Profesional Argentina",
      country: "Argentina",
    },
    update: "2026-10-04T18:00:25+00:00",
    bookmakers: [
      {
        id: 8,
        name: "Bet365",
        bets: [
          {
            id: 1,
            name: "Match Winner",
            values: [
              { value: "Home", odd: "1.85" },
              { value: "Draw", odd: "3.10" },
              { value: "Away", odd: "5.25" },
            ],
          },
        ],
      },
    ],
  });

  assert.ok(normalized);
  assert.equal(normalized.providerId, "1493152");
  assert.equal(normalized.bookmakers.length, 1);
  assert.equal(normalized.bookmakers[0].key, "api-sports:8");
  assert.deepEqual(normalized.bookmakers[0].outcomes, [
    { side: "home", price: 1.85 },
    { side: "draw", price: 3.1 },
    { side: "away", price: 5.25 },
  ]);
});

test("API-Sports Match Winner normalization ignores invalid prices and bets", () => {
  const normalized = normalizeApiSportsMatchWinnerRow({
    fixture: {
      id: 99,
      date: "2026-10-05T12:00:00Z",
    },
    bookmakers: [
      {
        id: 1,
        name: "Book",
        bets: [
          {
            id: 2,
            name: "Correct Score",
            values: [{ value: "1-0", odd: "6.0" }],
          },
          {
            id: 1,
            name: "Match Winner",
            values: [
              { value: "Home", odd: "0.95" },
              { value: "Away", odd: "2.10" },
            ],
          },
        ],
      },
    ],
  });

  assert.ok(normalized);
  assert.equal(normalized.bookmakers.length, 0);
});


test("API-Sports targeted odds requests use fixture id without pagination", async () => {
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

    return new Response(
      JSON.stringify({
        errors: [],
        results: 1,
        paging: { current: 1, total: 1 },
        response: [
          {
            fixture: {
              id: 1493152,
              date: "2026-10-04T22:15:00+00:00",
            },
            bookmakers: [
              {
                id: 8,
                name: "Bet365",
                bets: [
                  {
                    id: 1,
                    name: "Match Winner",
                    values: [
                      { value: "Home", odd: "1.85" },
                      { value: "Draw", odd: "3.10" },
                      { value: "Away", odd: "5.25" },
                    ],
                  },
                ],
              },
            ],
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
    const { ApiSportsFootballOddsClient } = await import(
      "../lib/providers/apiSportsOdds"
    );
    const client = new ApiSportsFootballOddsClient("test-key");
    const result = await client.getFixture("1493152");

    assert.ok(result);
    assert.equal(result.providerId, "1493152");

    const url = new URL(requestedUrls[0]);
    assert.equal(url.pathname, "/odds");
    assert.equal(url.searchParams.get("fixture"), "1493152");
    assert.equal(url.searchParams.has("bet"), false);
    assert.equal(url.searchParams.has("page"), false);
    assert.equal(url.searchParams.has("date"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("API-Sports featured odds normalization captures goal totals with their lines", () => {
  const normalized = normalizeApiSportsMatchWinnerRow({
    fixture: {
      id: 1493152,
      date: "2026-10-06T18:00:00Z",
    },
    bookmakers: [
      {
        id: 8,
        name: "Bet365",
        bets: [
          {
            id: 1,
            name: "Match Winner",
            values: [
              { value: "Home", odd: "1.85" },
              { value: "Draw", odd: "3.40" },
              { value: "Away", odd: "4.20" },
            ],
          },
          {
            id: 5,
            name: "Goals Over/Under",
            values: [
              { value: "Over 1.5", odd: "1.30" },
              { value: "Under 1.5", odd: "3.60" },
              { value: "Over 2.5", odd: "1.95" },
              { value: "Under 2.5", odd: "1.90" },
            ],
          },
        ],
      },
    ],
  });

  assert.ok(normalized);
  assert.equal(normalized.bookmakers.length, 1);
  assert.deepEqual(normalized.bookmakers[0].totalsOutcomes, [
    { side: "over", point: 1.5, price: 1.3 },
    { side: "under", point: 1.5, price: 3.6 },
    { side: "over", point: 2.5, price: 1.95 },
    { side: "under", point: 2.5, price: 1.9 },
  ]);
});


test("API-Sports featured odds normalization captures Double Chance bet 12", () => {
  const normalized = normalizeApiSportsMatchWinnerRow({
    fixture: {
      id: 1493152,
      date: "2026-10-06T18:00:00Z",
    },
    bookmakers: [
      {
        id: 8,
        name: "Bet365",
        bets: [
          {
            id: 12,
            name: "Double Chance",
            values: [
              { value: "Home/Draw", odd: "1.22" },
              { value: "Home/Away", odd: "1.30" },
              { value: "Draw/Away", odd: "1.95" },
            ],
          },
        ],
      },
    ],
  });

  assert.ok(normalized);
  assert.equal(normalized.bookmakers.length, 1);
  assert.deepEqual(normalized.bookmakers[0].doubleChanceOutcomes, [
    { side: "home_draw", price: 1.22 },
    { side: "home_away", price: 1.3 },
    { side: "draw_away", price: 1.95 },
  ]);
});
