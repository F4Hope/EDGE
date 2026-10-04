import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDb } from "../lib/prisma";
import { validateResultImportRecord } from "../lib/results/validate";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const input = getArg("file");
  if (!input) {
    throw new Error("Provide --file=<results.json>.");
  }

  const path = resolve(process.cwd(), input);
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("Result JSON must contain an array of records.");
  }

  const records = raw.map(validateResultImportRecord);
  const db = getDb();
  let upserted = 0;

  try {
    for (const record of records) {
      const event = await db.event.findUnique({
        where: { id: record.eventId },
        select: { id: true },
      });
      if (!event) {
        throw new Error(`Unknown eventId: ${record.eventId}`);
      }

      await db.result.upsert({
        where: { eventId: record.eventId },
        update: {
          status: record.status,
          completedAt: record.completedAt
            ? new Date(record.completedAt)
            : null,
          payload: record.payload
            ? JSON.parse(JSON.stringify(record.payload))
            : undefined,
        },
        create: {
          eventId: record.eventId,
          status: record.status,
          completedAt: record.completedAt
            ? new Date(record.completedAt)
            : null,
          payload: record.payload
            ? JSON.parse(JSON.stringify(record.payload))
            : undefined,
        },
      });
      upserted += 1;
    }

    console.log("Result import complete.", { upserted });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE result import failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
