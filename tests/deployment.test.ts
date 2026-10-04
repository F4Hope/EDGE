import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("baseline generator uses Prisma 7 schema diff and refuses to overwrite history", async () => {
  const source = await readFile("scripts/create-baseline-migration.ts", "utf8");

  assert.match(source, /migrate/);
  assert.match(source, /diff/);
  assert.match(source, /--from-empty/);
  assert.match(source, /--to-schema/);
  assert.match(source, /prisma\/schema\.prisma/);
  assert.match(source, /Refusing to create a baseline/);
  assert.doesNotMatch(source, /migrate reset/);
});

test("production preflight rejects local database deployment targets", async () => {
  const source = await readFile("scripts/production-preflight.ts", "utf8");

  assert.match(source, /localhost/);
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /external PostgreSQL/);
  assert.match(source, /migration\.sql/);
  assert.doesNotMatch(source, /db push/);
});

test("production deployment command is non-destructive Prisma migrate deploy", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.equal(pkg.scripts["db:deploy"], "prisma migrate deploy");
  assert.doesNotMatch(pkg.scripts["db:deploy"], /reset|push|dev/);
});


test("committed baseline migration exists and targets PostgreSQL", async () => {
  const migration = await readFile(
    "prisma/migrations/0_init/migration.sql",
    "utf8",
  );
  const lock = await readFile("prisma/migrations/migration_lock.toml", "utf8");

  assert.match(migration, /CREATE TABLE "Event"/);
  assert.match(migration, /CREATE TABLE "Result"/);
  assert.match(migration, /CREATE TABLE "SyncCheckpoint"/);
  assert.match(migration, /IntelligenceSignal_fingerprint_key/);
  assert.match(lock, /provider = "postgresql"/);
});

test("migration drift check compares live datasource to the Prisma schema", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.match(pkg.scripts["db:drift:check"], /--from-config-datasource/);
  assert.match(pkg.scripts["db:drift:check"], /--to-schema prisma\/schema\.prisma/);
  assert.match(pkg.scripts["db:drift:check"], /--exit-code/);
});
