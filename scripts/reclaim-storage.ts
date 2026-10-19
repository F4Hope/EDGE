import dotenv from "dotenv";
import { getDb } from "../lib/prisma";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

type Row = Record<string, unknown>;

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k,v]) => [k,jsonSafe(v)]));
  }
  return value;
}

async function main() {
  const db = getDb();
  try {
    const database = await db.$queryRawUnsafe<Row[]>(
      "SELECT pg_database_size(current_database()) AS database_bytes",
    );
    const relations = await db.$queryRawUnsafe<Row[]>(`
      SELECT
        c.oid::bigint AS oid,
        c.relname,
        c.relkind::text AS relkind,
        pg_relation_filepath(c.oid) AS filepath,
        pg_relation_size(c.oid) AS relation_bytes,
        pg_total_relation_size(c.oid) AS total_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'pg_catalog')
        AND c.relkind IN ('r','i','t')
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 40
    `);
    let wal: Row[] = [];
    try {
      wal = await db.$queryRawUnsafe<Row[]>(
        "SELECT COALESCE(sum(size),0) AS wal_bytes, count(*) AS wal_files FROM pg_ls_waldir()",
      );
    } catch (error) {
      wal = [{ unavailable: error instanceof Error ? error.message : String(error) }];
    }
    console.log("EDGE storage diagnosis.", JSON.stringify(jsonSafe({
      database: database[0] ?? {},
      wal: wal[0] ?? {},
      relations,
    })));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE storage diagnosis failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
