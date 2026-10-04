import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOddsPayload, OddsApiProvider } from "../lib/providers/oddsApi";
import {
  makeSelectionKey,
  makeSnapshotFingerprint,
} from "../lib/data/syncOdds";

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

test("selection keys distinguish handicap and totals lines", () => {
  assert.equal(
    makeSelectionKey("spreads", { name: "Alpha FC", price: 1.91, point: -1.5 }),
    "spreads:alpha-fc:-1.5",
  );
  assert.equal(
    makeSelectionKey("totals", { name: "Over", price: 1.88, point: 2.5 }),
    "totals:over:2.5",
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
