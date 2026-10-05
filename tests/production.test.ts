import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { parsePageRequest } from "../lib/production/pagination";

test("pagination bounds payload size", () => {
  const params = new URLSearchParams("limit=9999&cursor=abc");
  const page = parsePageRequest(params, {
    defaultLimit: 50,
    maxLimit: 250,
  });

  assert.equal(page.limit, 250);
  assert.equal(page.cursor, "abc");
});

test("pagination uses safe defaults for invalid input", () => {
  const params = new URLSearchParams("limit=not-a-number");
  const page = parsePageRequest(params);

  assert.equal(page.limit, 50);
  assert.equal(page.cursor, null);
});

test("production database client is process-wide instead of per request", async () => {
  const source = await readFile("lib/prisma.ts", "utf8");

  assert.match(source, /if \(globalForPrisma\.edgePrisma\)/);
  assert.match(source, /globalForPrisma\.edgePrisma = prisma/);
  assert.doesNotMatch(source, /NODE_ENV\s*!==\s*["']production["']/);
});

test("production security policy includes CSP, HSTS, and cross-origin isolation", async () => {
  const source = await readFile("next.config.ts", "utf8");

  assert.match(source, /Content-Security-Policy/);
  assert.match(source, /default-src 'self'/);
  assert.match(source, /connect-src 'self'/);
  assert.match(source, /frame-ancestors 'none'/);
  assert.match(source, /object-src 'none'/);
  assert.match(source, /Strict-Transport-Security/);
  assert.match(source, /Cross-Origin-Opener-Policy/);
  assert.match(source, /Cross-Origin-Resource-Policy/);
  assert.doesNotMatch(source, /connect-src[^\n]*api-sports/);
  assert.doesNotMatch(source, /connect-src[^\n]*the-odds-api/);
});
