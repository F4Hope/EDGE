import dotenv from "dotenv";
import { getDb } from "../lib/prisma";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

type SizeRow = { bytes: bigint | number | string };

function asNumber(value: bigint | number | string): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

async function relationSize(db: ReturnType<typeof getDb>, relation: string) {
  const rows = await db.$queryRawUnsafe<SizeRow[]>(
    `SELECT pg_total_relation_size('${relation}'::regclass) AS bytes`,
  );
  return asNumber(rows[0]?.bytes ?? 0);
}

async function databaseSize(db: ReturnType<typeof getDb>) {
  const rows = await db.$queryRawUnsafe<SizeRow[]>(
    "SELECT pg_database_size(current_database()) AS bytes",
  );
  return asNumber(rows[0]?.bytes ?? 0);
}

async function main() {
  const db = getDb();
  try {
    const beforeDatabaseBytes = await databaseSize(db);
    const beforeFeatureBytes = await relationSize(db, '"Feature"');
    const beforeFeatureRows = await db.feature.count();

    console.log("EDGE storage reclaim starting.", {
      beforeDatabaseBytes,
      beforeFeatureBytes,
      beforeFeatureRows,
      action: "TRUNCATE Feature only",
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

    await db.$executeRawUnsafe('TRUNCATE TABLE "Feature"');

    const afterDatabaseBytes = await databaseSize(db);
    const afterFeatureBytes = await relationSize(db, '"Feature"');
    const afterFeatureRows = await db.feature.count();

    console.log("EDGE storage reclaim complete.", {
      afterDatabaseBytes,
      afterFeatureBytes,
      afterFeatureRows,
      reclaimedDatabaseBytes: Math.max(0, beforeDatabaseBytes - afterDatabaseBytes),
      reclaimedFeatureBytes: Math.max(0, beforeFeatureBytes - afterFeatureBytes),
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE storage reclaim failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
