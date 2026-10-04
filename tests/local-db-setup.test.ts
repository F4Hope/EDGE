import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("local Postgres binds only to loopback", async () => {
  const compose = await readFile("docker-compose.local.yml", "utf8");

  assert.match(compose, /127\.0\.0\.1:54329:5432/);
  assert.match(compose, /postgres:16-alpine/);
  assert.doesNotMatch(compose, /0\.0\.0\.0:54329/);
});

test("local bootstrap writes the ignored env file and does not require secrets", async () => {
  const source = await readFile("scripts/setup-local-db.ts", "utf8");
  const gitignore = await readFile(".gitignore", "utf8");

  assert.match(source, /\.env\.local/);
  assert.match(source, /db:push/);
  assert.match(source, /db:seed/);
  assert.match(source, /db:smoke/);
  assert.match(gitignore, /\.env\.\*/);
});
