import dotenv from "dotenv";
import { getDb } from "../lib/prisma";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

type SizeRow = { bytes: bigint | number | string };

const n = (value: bigint | number | string | undefined) =>
  typeof value === "bigint" ? Number(value) : Number(value ?? 0);

async function scalarSize(db: ReturnType<typeof getDb>, sql: string) {
  const rows = await db.$queryRawUnsafe<SizeRow[]>(sql);
  return n(rows[0]?.bytes);
}

async function main() {
  const db = getDb();
  try {
    const beforeDatabaseBytes = await scalarSize(
      db,
      "SELECT pg_database_size(current_database()) AS bytes",
    );
    const beforeFeatureBytes = await scalarSize(
      db,
      `SELECT pg_total_relation_size('"Feature"'::regclass) AS bytes`,
    );
    const beforeFeatureRows = await db.feature.count();

    console.log("EDGE feature reclaim starting.", {
      beforeDatabaseBytes,
      beforeFeatureBytes,
      beforeFeatureRows,
      preservedCoreData: true,
    });

    // Free a few MB of working room first. These are derived-data lookup indexes
    // and are recreated immediately after Feature is truncated.
    await db.$executeRawUnsafe(
      'DROP INDEX IF EXISTS "Feature_eventId_modelVersion_computedAt_idx"',
    );
    await db.$executeRawUnsafe(
      'DROP INDEX IF EXISTS "Feature_modelVersion_computedAt_idx"',
    );

    // Feature snapshots are fully derived from stored event/odds/result inputs.
    await db.$executeRawUnsafe('TRUNCATE TABLE "Feature"');

    await db.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "Feature_eventId_modelVersion_computedAt_idx" ON "Feature"("eventId", "modelVersion", "computedAt")',
    );
    await db.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "Feature_modelVersion_computedAt_idx" ON "Feature"("modelVersion", "computedAt")',
    );

    const afterDatabaseBytes = await scalarSize(
      db,
      "SELECT pg_database_size(current_database()) AS bytes",
    );
    const afterFeatureBytes = await scalarSize(
      db,
      `SELECT pg_total_relation_size('"Feature"'::regclass) AS bytes`,
    );
    const afterFeatureRows = await db.feature.count();

    console.log("EDGE feature reclaim complete.", {
      afterDatabaseBytes,
      afterFeatureBytes,
      afterFeatureRows,
      reclaimedDatabaseBytes: Math.max(0, beforeDatabaseBytes - afterDatabaseBytes),
      reclaimedFeatureBytes: Math.max(0, beforeFeatureBytes - afterFeatureBytes),
      preserved: [
        "Event",
        "EventSource",
        "Market",
        "OddsSnapshot",
        "Prediction",
        "Result",
        "Selection",
        "Combo",
        "IntelligenceSignal",
      ],
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE feature reclaim failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
