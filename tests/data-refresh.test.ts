import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("data refresh keeps quota-sensitive Odds API calls explicitly opt-in", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /include-odds/);
  assert.match(source, /SKIP quota-sensitive Odds API result\/odds calls/);
  assert.match(source, /--provider=odds-api/);
  assert.match(source, /odds:sync/);
  assert.match(source, /results:sync:odds/);
  assert.match(source, /results:sync/);
  assert.match(source, /intelligence:sync/);
  assert.match(source, /features:calculate/);
  assert.match(source, /predictions:generate/);

  const includeOddsIndex = source.indexOf("if (includeOdds)");
  const oddsResultSyncIndex = source.indexOf('run("results:sync:odds"');
  const oddsSyncIndex = source.indexOf('run("odds:sync"');
  assert.ok(includeOddsIndex >= 0);
  assert.ok(oddsResultSyncIndex > includeOddsIndex);
  assert.ok(oddsSyncIndex > includeOddsIndex);
});

test("normal refresh uses API-Sports for non-quota-sensitive evidence", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /--provider=api-sports/);
  assert.match(source, /--sports=football,basketball/);
});

test("API-Sports refresh clamps free-plan event discovery to the current UTC date", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /API_SPORTS_EVENT_FORWARD_HOURS/);
  assert.match(source, /API_SPORTS_ALLOW_FUTURE_DATES/);
  assert.match(source, /API_SPORTS_RESULT_LOOKBACK_HOURS/);
  assert.match(source, /apiSportsEventTo/);
  assert.match(source, /endOfUtcDay/);
  assert.match(source, /const eventTo = apiSportsEventTo\(now, eventForwardHours\)/);
  assert.match(source, /"--to=" \+ eventTo/);
  assert.match(source, /"--from=" \+ isoOffset\(now, -resultLookbackHours\)/);
  assert.match(source, /"--to=" \+ now\.toISOString\(\)/);
});

test("data refresh directs Codespaces to local database bootstrap when needed", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /npm run db:local first/);
});


test("data refresh keeps result settlement mandatory after event discovery failure", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /runBestEffort\(/);
  assert.match(source, /API-Sports event discovery/);
  assert.match(source, /stored event identities so result settlement can still run/);
  assert.match(source, /run\("results:sync"/);

  const eventIndex = source.indexOf('runBestEffort(\n      "data:sync"');
  const resultIndex = source.indexOf('run("results:sync"');
  assert.ok(eventIndex >= 0);
  assert.ok(resultIndex > eventIndex);
});


test("normal refresh broadens soccer fixtures with quota-free Odds API event discovery", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /prioritySoccerEventKeys/);
  assert.match(source, /ODDS_SOCCER_EVENT_FORWARD_HOURS/);
  assert.match(source, /The Odds API priority soccer event discovery/);
  assert.match(source, /events:reconcile/);

  const discoveryIndex = source.indexOf("The Odds API priority soccer event discovery");
  const includeOddsIndex = source.indexOf("if (includeOdds)");
  assert.ok(discoveryIndex >= 0);
  assert.ok(includeOddsIndex > discoveryIndex);
});

test("priority soccer worker caps paid pricing to H2H on the once-daily path", async () => {
  const source = await readFile("scripts/refresh-priority-soccer.ts", "utf8");

  assert.match(source, /prioritySoccerEventKeys/);
  assert.match(source, /--markets=h2h/);
  assert.match(source, /ODDS_PRIORITY_MAX_SPORT_KEYS/);
  assert.match(source, /"--sport-keys=" \+ prioritySoccerEventKeys\.join/);
  assert.match(source, /"--max-sport-keys=" \+ String\(maxOddsKeys\)/);
  assert.match(source, /--event-max-sport-keys=/);
  assert.match(source, /--limit=1000/);
  assert.match(source, /--limit=500/);
  assert.match(source, /--max-requests=6/);
  assert.match(source, /features:calculate/);
  assert.match(source, /predictions:generate/);
});


test("odds sync separates free event discovery breadth from the paid sport-key cap", async () => {
  const source = await readFile("scripts/sync-odds.ts", "utf8");
  const syncSource = await readFile("lib/data/syncOdds.ts", "utf8");

  assert.match(source, /event-max-sport-keys/);
  assert.match(source, /maxEventSportKeys/);
  assert.match(syncSource, /maxEventSportKeys \?\? options\.maxSportKeys/);
  assert.match(syncSource, /eligibleSportKeys\.slice\(0, options\.maxSportKeys\)/);
});


test("normal refresh replenishes rolling Combo odds with a bounded API-Sports budget", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /Rolling Combo odds refresh/);
  assert.match(source, /analysis:refresh/);
  assert.match(source, /--max-requests=3/);
  assert.match(source, /--hours=48/);

  const rollingIndex = source.indexOf("Rolling Combo odds refresh");
  const featureIndex = source.indexOf("Recalculating transparent feature snapshots");
  assert.ok(rollingIndex >= 0);
  assert.ok(featureIndex > rollingIndex);
});


test("scheduled refresh alternates full data work with Combo-only replenishment", async () => {
  const [source, pkg] = await Promise.all([
    readFile("scripts/refresh-scheduled.ts", "utf8"),
    readFile("package.json", "utf8"),
  ]);

  assert.match(source, /EDGE_FULL_REFRESH_EVERY_HOURS/);
  assert.match(source, /utcHour % fullRefreshEveryHours === 0/);
  assert.match(source, /run\("data:refresh"/);
  assert.match(source, /run\("combo:refresh"\)/);
  assert.match(pkg, /"data:refresh:scheduled": "tsx scripts\/refresh-scheduled\.ts"/);
});
