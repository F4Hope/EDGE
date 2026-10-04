import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("data refresh keeps every Odds API call explicitly opt-in", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /include-odds/);
  assert.match(source, /SKIP The Odds API entirely/);
  assert.match(source, /--provider=odds-api/);
  assert.match(source, /odds:sync/);
  assert.match(source, /results:sync:odds/);
  assert.match(source, /results:sync/);
  assert.match(source, /intelligence:sync/);
  assert.match(source, /features:calculate/);

  const includeOddsIndex = source.indexOf("if (includeOdds)");
  const oddsProviderIndex = source.indexOf('"--provider=odds-api"');
  const oddsResultSyncIndex = source.indexOf('run("results:sync:odds"');
  const oddsSyncIndex = source.indexOf('run("odds:sync"');
  assert.ok(includeOddsIndex >= 0);
  assert.ok(oddsProviderIndex > includeOddsIndex);
  assert.ok(oddsResultSyncIndex > includeOddsIndex);
  assert.ok(oddsSyncIndex > includeOddsIndex);
});

test("normal refresh uses API-Sports for non-quota-sensitive evidence", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /--provider=api-sports/);
  assert.match(source, /--sports=football,basketball/);
});

test("data refresh directs Codespaces to local database bootstrap when needed", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /npm run db:local first/);
});
