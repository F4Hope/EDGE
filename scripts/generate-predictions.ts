import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import { generatePredictionsForEvent } from "../lib/prediction/generate";
import { PREDICTION_MODEL_VERSION } from "../lib/prediction/model";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function getArg(name: string): string | undefined {
  const prefix = "--" + name + "=";
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveInt(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(label + " must be a positive integer.");
  }
  return parsed;
}

async function main() {
  const db = getDb();
  const eventId = getArg("event-id");
  const hours = Math.min(24 * 14, positiveInt(getArg("hours"), 168, "--hours"));
  const limit = Math.min(500, positiveInt(getArg("limit"), 250, "--limit"));
  const asOf = new Date();

  try {
    const events = eventId
      ? await db.event.findMany({
          where: { id: eventId },
          select: { id: true },
        })
      : await db.event.findMany({
          where: {
            startTime: {
              gt: asOf,
              lte: new Date(asOf.getTime() + hours * 60 * 60 * 1000),
            },
            status: { notIn: ["CANCELLED", "POSTPONED", "COMPLETED"] },
            features: {
              some: { modelVersion: "features-v3" },
            },
            markets: {
              some: {
                key: { in: ["h2h", "totals", "spreads", "double_chance"] },
                status: "OPEN",
                oddsSnapshots: { some: {} },
              },
            },
          },
          orderBy: { startTime: "asc" },
          take: limit,
          select: { id: true },
        });

    let created = 0;
    let reused = 0;
    let skipped = 0;

    for (const event of events) {
      const result = await generatePredictionsForEvent(db, event.id, asOf);
      created += result.created;
      reused += result.reused;
      if (result.reason && result.created === 0 && result.reused === 0) {
        skipped += 1;
      }

      console.log(
        [
          result.eventId,
          "created=" + result.created,
          "reused=" + result.reused,
          "reason=" + (result.reason ?? "generated"),
        ].join(" | "),
      );
    }

    console.log("EDGE prediction generation complete.", {
      events: events.length,
      created,
      reused,
      skipped,
      modelVersion: PREDICTION_MODEL_VERSION,
      validationState: "UNVALIDATED_BASELINE",
      markets: ["h2h", "totals", "spreads", "double_chance"],
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE prediction generation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
