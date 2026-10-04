import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("release candidate version is synchronized across package metadata", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
    version: string;
    scripts: Record<string, string>;
  };
  const lock = JSON.parse(await readFile("package-lock.json", "utf8")) as {
    version: string;
    packages?: Record<string, { version?: string }>;
  };

  assert.equal(pkg.version, "0.8.0-rc.1");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages?.[""]?.version, pkg.version);
  assert.equal(
    pkg.scripts["release:check"],
    "npm run audit:runtime && npm run audit:critical && npm run check",
  );
});

test("release notes distinguish code readiness from external live configuration", async () => {
  const notes = await readFile("CHANGELOG.md", "utf8");

  assert.match(notes, /0\.8\.0-rc\.1/);
  assert.match(notes, /release candidate/i);
  assert.match(notes, /external credentials/i);
  assert.match(notes, /production database/i);
  assert.match(notes, /does not place or construct real-money wagers/i);
});
