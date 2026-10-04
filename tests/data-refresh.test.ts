import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("data refresh keeps quota-sensitive odds synchronization opt-in", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /include-odds/);
  assert.match(source, /paid\/quota-sensitive odds calls require explicit/);
  assert.match(source, /results:sync/);
  assert.match(source, /intelligence:sync/);
  assert.match(source, /features:calculate/);
  assert.doesNotMatch(source, /run\("odds:sync"\);/);
});

test("data refresh directs Codespaces to local database bootstrap when needed", async () => {
  const source = await readFile("scripts/refresh-data.ts", "utf8");

  assert.match(source, /npm run db:local first/);
});
