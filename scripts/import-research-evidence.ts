import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDb } from "../lib/prisma";
import {
  validateSourceBackedResearchEvidence,
  type SourceBackedResearchEvidence,
} from "../lib/intelligence/researchEvidence";
import {
  buildResearchSignalDraft,
  researchSelectionMatches,
} from "../lib/intelligence/researchImport";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function predictionSelectionName(
  selectionKey: string,
  explanation: unknown,
): string {
  const name = record(explanation)?.selectionName;
  return typeof name === "string" && name.trim()
    ? name.trim()
    : selectionKey;
}

function assertPreEvent(
  evidence: SourceBackedResearchEvidence,
  eventStart: Date,
): void {
  if (new Date(evidence.publishedAt) >= eventStart) {
    throw new Error(
      `Research evidence for ${evidence.eventId} was published at or after event start.`,
    );
  }

  if (new Date(evidence.observedAt) >= eventStart) {
    throw new Error(
      `Research evidence for ${evidence.eventId} was observed at or after event start.`,
    );
  }
}

async function main() {
  const input = getArg("file");
  if (!input) {
    throw new Error("Provide --file=<research-evidence.json>.");
  }

  const path = resolve(process.cwd(), input);
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("Research evidence JSON must contain an array of records.");
  }

  const evidence = raw.map(validateSourceBackedResearchEvidence);
  const db = getDb();

  let upserted = 0;

  try {
    for (const item of evidence) {
      const prediction = await db.prediction.findUnique({
        where: { id: item.predictionId },
        select: {
          eventId: true,
          selectionKey: true,
          explanation: true,
          event: {
            select: {
              startTime: true,
            },
          },
        },
      });

      if (!prediction) {
        throw new Error(`Unknown predictionId: ${item.predictionId}`);
      }

      if (prediction.eventId !== item.eventId) {
        throw new Error(
          `Research evidence eventId does not match prediction ${item.predictionId}.`,
        );
      }

      const expectedSelection = predictionSelectionName(
        prediction.selectionKey,
        prediction.explanation,
      );

      if (!researchSelectionMatches(item.selectionName, expectedSelection)) {
        throw new Error(
          `Research evidence selectionName does not match prediction ${item.predictionId}.`,
        );
      }

      assertPreEvent(item, prediction.event.startTime);

      const signal = buildResearchSignalDraft(item);

      await db.intelligenceSignal.upsert({
        where: { fingerprint: signal.fingerprint },
        update: {
          eventId: item.eventId,
          type: signal.type,
          severity: signal.severity,
          source: signal.source,
          headline: signal.headline,
          summary: signal.summary,
          affectsHome: null,
          affectsAway: null,
          participant: null,
          occurredAt: new Date(signal.occurredAt),
          expiresAt: prediction.event.startTime,
          metadata: JSON.parse(JSON.stringify(signal.metadata)),
        },
        create: {
          eventId: item.eventId,
          fingerprint: signal.fingerprint,
          type: signal.type,
          severity: signal.severity,
          source: signal.source,
          headline: signal.headline,
          summary: signal.summary,
          affectsHome: null,
          affectsAway: null,
          participant: null,
          occurredAt: new Date(signal.occurredAt),
          expiresAt: prediction.event.startTime,
          metadata: JSON.parse(JSON.stringify(signal.metadata)),
        },
      });

      upserted += 1;
    }

    console.log("Source-backed research evidence import complete.", {
      records: evidence.length,
      upserted,
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE source-backed research evidence import failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
