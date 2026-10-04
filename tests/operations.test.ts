import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { getBuildInfo } from "../lib/system/buildInfo";
import { checkReadiness } from "../lib/system/health";

test("operational probe routes exist", async () => {
  await Promise.all([
    access("app/api/health/route.ts"),
    access("app/api/health/live/route.ts"),
    access("app/api/health/ready/route.ts"),
    access("app/api/version/route.ts"),
  ]);
});

test("build info exposes version and optional non-secret commit identity", () => {
  const previous = process.env.EDGE_BUILD_SHA;
  process.env.EDGE_BUILD_SHA = "abc123";

  try {
    const info = getBuildInfo();
    assert.equal(info.service, "edge-sports-intelligence");
    assert.equal(info.version, "0.7.0");
    assert.equal(info.commit, "abc123");
    assert.ok(info.node.length > 0);
  } finally {
    if (previous === undefined) delete process.env.EDGE_BUILD_SHA;
    else process.env.EDGE_BUILD_SHA = previous;
  }
});

test("readiness degrades safely without database configuration", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const result = await checkReadiness();
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.status, "degraded");
    assert.equal(result.body.database, "not-configured");
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
