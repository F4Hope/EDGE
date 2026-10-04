import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Codespace devcontainer pins Node 22 and Docker support", async () => {
  const raw = await readFile(".devcontainer/devcontainer.json", "utf8");
  const config = JSON.parse(raw) as {
    image?: string;
    features?: Record<string, unknown>;
    forwardPorts?: number[];
  };

  assert.match(config.image ?? "", /node:1-22-bookworm/);
  assert.ok(
    Object.keys(config.features ?? {}).some((key) =>
      key.includes("docker-in-docker"),
    ),
  );
  assert.deepEqual(config.forwardPorts, [3000]);
});

test("Codespace resume restores local database without destructive reset", async () => {
  const source = await readFile("scripts/resume-codespace.ts", "utf8");

  assert.match(source, /db:local/);
  assert.match(source, /db:validate/);
  assert.doesNotMatch(source, /migrate reset/);
  assert.doesNotMatch(source, /docker volume rm/);
});


test("Codespace startup automatically restores local database state without provider calls", async () => {
  const raw = await readFile(".devcontainer/devcontainer.json", "utf8");
  const config = JSON.parse(raw) as {
    postCreateCommand?: string;
    postStartCommand?: string;
  };
  const source = await readFile("scripts/codespace-auto-start.ts", "utf8");

  assert.match(config.postCreateCommand ?? "", /npm ci/);
  assert.equal(config.postStartCommand, "npm run codespace:auto-start");
  assert.match(source, /db:local/);
  assert.match(source, /db:validate/);
  assert.doesNotMatch(source, /data:refresh|odds:sync|results:sync|intelligence:sync/);
  assert.doesNotMatch(source, /migrate reset|docker volume rm/);
});

test("manual Codespace resume uses locked dependencies and does not refresh providers", async () => {
  const source = await readFile("scripts/resume-codespace.ts", "utf8");

  assert.match(source, /"ci"/);
  assert.match(source, /db:local/);
  assert.match(source, /db:validate/);
  assert.match(source, /doctor/);
  assert.doesNotMatch(source, /data:refresh|odds:sync|results:sync|intelligence:sync/);
});
