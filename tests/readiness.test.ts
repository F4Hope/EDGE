import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import {
  assessCoreDataFreshness,
  getSystemReadiness,
  READINESS_FRESHNESS_LIMITS,
} from "../lib/system/readiness";

test("system readiness degrades safely when database is not configured", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    const readiness = await getSystemReadiness();
    assert.equal(readiness.overall, "DEGRADED");
    assert.equal(readiness.counts, null);
    assert.equal(readiness.capabilities.automatedWagering, false);
    assert.ok(
      readiness.checks.some(
        (check) =>
          check.key === "database-env" && check.level === "WARNING",
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("installable-app and safe-failure surfaces exist", async () => {
  await Promise.all([
    access("app/manifest.ts"),
    access("app/loading.tsx"),
    access("app/error.tsx"),
    access("app/global-error.tsx"),
    access("app/not-found.tsx"),
    access("app/status/page.tsx"),
    access("public/icon.svg"),
    access("public/icon-maskable.svg"),
  ]);
});

test("more navigation exposes system status", async () => {
  const source = await readFile("app/more/page.tsx", "utf8");
  assert.match(source, /href: "\/status"/);
  assert.match(source, /System status/);
});


test("core analytical readiness treats stale events odds or features as degraded evidence", () => {
  const now = new Date("2026-10-12T12:00:00.000Z");
  const fresh = assessCoreDataFreshness(
    {
      events: "2026-10-12T11:00:00.000Z",
      odds: "2026-10-12T10:00:00.000Z",
      features: "2026-10-12T08:00:00.000Z",
    },
    now,
  );

  assert.notEqual(fresh.events.state, "STALE");
  assert.notEqual(fresh.odds.state, "STALE");
  assert.notEqual(fresh.features.state, "STALE");

  const stale = assessCoreDataFreshness(
    {
      events: "2026-10-10T11:59:00.000Z",
      odds: "2026-10-12T05:59:00.000Z",
      features: "2026-10-11T11:59:00.000Z",
    },
    now,
  );

  assert.equal(stale.events.state, "STALE");
  assert.equal(stale.odds.state, "STALE");
  assert.equal(stale.features.state, "STALE");
  assert.equal(READINESS_FRESHNESS_LIMITS.odds.staleMinutes, 360);
});

test("system readiness is derived from core data freshness instead of row existence alone", async () => {
  const source = await readFile("lib/system/readiness.ts", "utf8");
  assert.match(source, /const coreDataReady =/);
  assert.match(source, /overall: coreDataReady \? "READY" : "DEGRADED"/);
  assert.match(source, /usableFreshness\(coreDataFreshness\.odds\)/);
  assert.doesNotMatch(source, /overall: "READY",\n\s*checks,\n\s*counts,\n\s*freshness,/);
});
