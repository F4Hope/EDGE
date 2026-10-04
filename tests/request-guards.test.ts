import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  clearRateLimitStateForTests,
  enforcePublicReadRateLimit,
  requireOpaqueId,
} from "../lib/production/requestGuards";

function request(ip = "203.0.113.10") {
  return {
    headers: new Headers({ "x-forwarded-for": ip }),
  };
}

test("opaque IDs are bounded and restricted to safe characters", () => {
  assert.equal(requireOpaqueId("abc_123-XYZ", "eventId"), "abc_123-XYZ");
  assert.throws(() => requireOpaqueId("", "eventId"), /eventId is required/);
  assert.throws(() => requireOpaqueId("bad id", "eventId"), /Invalid eventId/);
  assert.throws(
    () => requireOpaqueId("a".repeat(129), "eventId"),
    /Invalid eventId/,
  );
});

test("per-process read guard returns 429 after the configured burst limit", async () => {
  clearRateLimitStateForTests();

  assert.equal(
    enforcePublicReadRateLimit(
      request() as never,
      "request-1",
      "/api/example",
      { limit: 2, windowMs: 60_000 },
    ),
    null,
  );
  assert.equal(
    enforcePublicReadRateLimit(
      request() as never,
      "request-2",
      "/api/example",
      { limit: 2, windowMs: 60_000 },
    ),
    null,
  );

  const response = enforcePublicReadRateLimit(
    request() as never,
    "request-3",
    "/api/example",
    { limit: 2, windowMs: 60_000 },
  );

  assert.ok(response);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(response.headers.get("RateLimit-Limit"), "2");
  assert.deepEqual(await response.json(), {
    error: "Too many requests. Try again later.",
    requestId: "request-3",
  });
});

test("rate limits are isolated by route and client key", () => {
  clearRateLimitStateForTests();

  assert.equal(
    enforcePublicReadRateLimit(
      request("203.0.113.11") as never,
      "a",
      "/api/a",
      { limit: 1 },
    ),
    null,
  );

  assert.equal(
    enforcePublicReadRateLimit(
      request("203.0.113.12") as never,
      "b",
      "/api/a",
      { limit: 1 },
    ),
    null,
  );

  assert.equal(
    enforcePublicReadRateLimit(
      request("203.0.113.11") as never,
      "c",
      "/api/b",
      { limit: 1 },
    ),
    null,
  );
});

test("database-backed API routes are guarded while health probes remain exempt", async () => {
  const guardedRoutes = [
    "app/api/events/route.ts",
    "app/api/features/route.ts",
    "app/api/history/route.ts",
    "app/api/intelligence/route.ts",
    "app/api/model-performance/route.ts",
    "app/api/movement/route.ts",
    "app/api/odds/route.ts",
    "app/api/results/route.ts",
    "app/api/system/readiness/route.ts",
  ];

  for (const path of guardedRoutes) {
    const source = await readFile(path, "utf8");
    assert.match(
      source,
      /enforcePublicReadRateLimit/,
      path + " must enforce the public read guard",
    );
  }

  for (const path of [
    "app/api/health/route.ts",
    "app/api/health/live/route.ts",
    "app/api/health/ready/route.ts",
    "app/api/version/route.ts",
  ]) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(
      source,
      /enforcePublicReadRateLimit/,
      path + " must remain available to deployment probes",
    );
  }
});

test("events API bounds date windows and validates opaque cursors", async () => {
  const source = await readFile("app/api/events/route.ts", "utf8");

  assert.match(source, /31 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(source, /requireOpaqueId\(page\.cursor, "cursor"\)/);
});
