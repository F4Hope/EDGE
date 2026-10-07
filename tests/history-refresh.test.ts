import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("history refresh backfills event identities before settling results", async () => {
  const source = await readFile("scripts/refresh-history.ts", "utf8");

  assert.match(source, /API_SPORTS_HISTORY_LOOKBACK_HOURS/);
  assert.match(source, /48/);
  assert.match(source, /--provider=api-sports/);
  assert.match(source, /--sports=football,basketball/);
  assert.match(source, /run\("data:sync"/);
  assert.match(source, /"results:sync"/);
  assert.doesNotMatch(source, /odds:sync/);
  assert.doesNotMatch(source, /--provider=odds-api/);

  const eventIndex = source.indexOf('run("data:sync"');
  const resultIndex = source.indexOf('run("results:sync"');
  assert.ok(eventIndex >= 0);
  assert.ok(resultIndex > eventIndex);
});

test("history refresh requires database and API-Sports credentials", async () => {
  const source = await readFile("scripts/refresh-history.ts", "utf8");

  assert.match(source, /DATABASE_URL is not configured/);
  assert.match(source, /API_SPORTS_KEY is not configured/);
});


test("history refresh still settles known events when backfill fails", async () => {
  const source = await readFile("scripts/refresh-history.ts", "utf8");

  assert.match(source, /runBestEffort\(/);
  assert.match(source, /API-Sports historical event backfill/);
  assert.match(source, /stored event identities so result settlement can still run/);
  assert.match(source, /"results:sync"/);

  const backfillIndex = source.indexOf('runBestEffort(\n    "data:sync"');
  const resultIndex = source.indexOf('run("results:sync"');
  assert.ok(backfillIndex >= 0);
  assert.ok(resultIndex > backfillIndex);
});


test("history refresh falls back to bounded Odds API result settlement", async () => {
  const source = await readFile("scripts/refresh-history.ts", "utf8");

  assert.match(source, /API-Sports result settlement/);
  assert.match(source, /results:sync:odds/);
  assert.match(source, /--sports=football,basketball/);
  assert.match(source, /--max-sport-keys=3/);
  assert.match(source, /ODDS_API_KEY/);
  assert.match(source, /fallbackDays = Math\.min\(3/);
});
