import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("EDGE no longer requires a custom devcontainer to create a Codespace", async () => {
  await assert.rejects(
    access(".devcontainer/devcontainer.json"),
    /ENOENT|no such file/i,
  );
});

test("Codespace resume restores local database without destructive reset", async () => {
  const source = await readFile("scripts/resume-codespace.ts", "utf8");

  assert.match(source, /db:local/);
  assert.match(source, /db:validate/);
  assert.match(source, /doctor/);
  assert.doesNotMatch(source, /migrate reset/);
  assert.doesNotMatch(source, /docker volume rm/);
});

test("manual Codespace resume uses locked dependencies and does not refresh providers", async () => {
  const source = await readFile("scripts/resume-codespace.ts", "utf8");

  assert.match(source, /"ci"/);
  assert.match(source, /db:local/);
  assert.match(source, /db:validate/);
  assert.match(source, /doctor/);
  assert.doesNotMatch(
    source,
    /data:refresh|odds:sync|results:sync|intelligence:sync/,
  );
});
