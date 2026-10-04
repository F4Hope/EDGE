import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { getSystemReadiness } from "../lib/system/readiness";

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
