import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("production refresh worker runs the existing audited refresh pipeline", async () => {
  const source = await readFile("Dockerfile.worker", "utf8");

  assert.match(source, /npm run data:refresh/);
  assert.match(source, /EDGE_REFRESH_INCLUDE_ODDS/);
  assert.match(source, /--include-odds/);
  assert.doesNotMatch(source, /API_SPORTS_KEY=/);
  assert.doesNotMatch(source, /ODDS_API_KEY=/);
  assert.doesNotMatch(source, /DATABASE_URL=/);
});
