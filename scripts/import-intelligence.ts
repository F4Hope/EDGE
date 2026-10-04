import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDb } from "../lib/prisma";
import { validateIntelligenceRecord } from "../lib/intelligence/validate";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const input = getArg("file");
  if (!input) {
    throw new Error("Provide --file=<intelligence.json>.");
  }

  const path = resolve(process.cwd(), input);
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("Intelligence JSON must contain an array of records.");
  }

  const records = raw.map(validateIntelligenceRecord);
  const db = getDb();
  let inserted = 0;

  try {
    for (const record of records) {
      const event = await db.event.findUnique({
        where: { id: record.eventId },
        select: { id: true },
      });
      if (!event) {
        throw new Error(`Unknown eventId: ${record.eventId}`);
      }

      await db.intelligenceSignal.create({
        data: {
          eventId: record.eventId,
          type: record.type,
          severity: record.severity,
          source: record.source,
          headline: record.headline,
          summary: record.summary ?? null,
          affectsHome: record.affectsHome ?? null,
          affectsAway: record.affectsAway ?? null,
          participant: record.participant ?? null,
          occurredAt: new Date(record.occurredAt),
          expiresAt: record.expiresAt
            ? new Date(record.expiresAt)
            : null,
          metadata: record.metadata
            ? JSON.parse(JSON.stringify(record.metadata))
            : undefined,
        },
      });
      inserted += 1;
    }

    console.log("Sports intelligence import complete.", { inserted });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE intelligence import failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
