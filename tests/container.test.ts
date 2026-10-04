import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("production Docker image uses Node 22 standalone output and a non-root user", async () => {
  const dockerfile = await readFile("Dockerfile", "utf8");

  assert.match(dockerfile, /FROM node:22-bookworm-slim AS deps/);
  assert.match(dockerfile, /\.next\/standalone/);
  assert.match(dockerfile, /USER nextjs/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(dockerfile, /\/api\/health/);
  assert.doesNotMatch(dockerfile, /COPY \.env/);
});

test("Docker context excludes local secrets and build artifacts", async () => {
  const ignore = await readFile(".dockerignore", "utf8");

  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^\.env\.\*$/m);
  assert.match(ignore, /^node_modules$/m);
  assert.match(ignore, /^\.next$/m);
  assert.match(ignore, /^\.git$/m);
});
