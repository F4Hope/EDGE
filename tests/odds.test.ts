import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOddsPayload } from "../lib/providers/oddsApi";
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
