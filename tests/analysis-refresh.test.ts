import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("targeted odds refresh can post-process stored odds into model output", async () => {
  const source = await readFile("scripts/sync-api-sports-odds.ts", "utf8");

  assert.match(source, /refresh-analysis/);
  assert.match(source, /calculateEventFeatures/);
  assert.match(source, /generatePredictionsForEvent/);
  assert.match(source, /continuing analysis refresh from stored odds/);

  const featureCall = source.indexOf(
    "await calculateEventFeatures(db, event.id, input.now)",
  );
  const predictionCall = source.indexOf(
    "await generatePredictionsForEvent(",
  );

  assert.ok(featureCall >= 0, "feature recalculation call missing");
  assert.ok(predictionCall > featureCall, "predictions must run after features");
});

test("package exposes one repository-owned priced analysis refresh command", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.equal(
    pkg.scripts["analysis:refresh"],
    "tsx scripts/sync-api-sports-odds.ts --refresh-analysis=true",
  );
});


test("targeted API-Sports odds refresh prioritizes completely unpriced fixtures", async () => {
  const source = await readFile("scripts/sync-api-sports-odds.ts", "utf8");

  assert.match(source, /apiSportsCoverageRank/);
  assert.match(source, /const candidatePool = await db\.event\.findMany/);
  assert.match(source, /priced\.size === 0/);
  assert.match(source, /slice\(0, maxRequests\)/);
});
