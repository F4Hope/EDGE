import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("scheduled evidence refresh is opt-in and never schedules paid odds calls", async () => {
  const source = await readFile(
    ".github/workflows/evidence-refresh.yml",
    "utf8",
  );

  assert.match(source, /EDGE_SCHEDULED_REFRESH_ENABLED/);
  assert.match(source, /schedule:/);
  assert.match(source, /npm run data:refresh\n/);
  assert.match(source, /workflow_dispatch/);
  assert.match(source, /include_odds/);
  assert.match(source, /npm run data:refresh -- --include-odds/);

  const scheduledStep = source.match(
    /- name: Refresh standard evidence[\s\S]*?run: npm run data:refresh\n/,
  );
  assert.ok(scheduledStep);
  assert.doesNotMatch(scheduledStep[0], /include-odds/);
});

test("refresh workflow requires server-side database and API-Sports secrets", async () => {
  const source = await readFile(
    ".github/workflows/evidence-refresh.yml",
    "utf8",
  );

  assert.match(source, /secrets\.EDGE_DATABASE_URL/);
  assert.match(source, /secrets\.API_SPORTS_KEY/);
  assert.match(source, /secrets\.ODDS_API_KEY/);
  assert.match(source, /Validate refresh configuration/);
});
