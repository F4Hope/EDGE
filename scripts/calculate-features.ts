import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import { calculateEventFeatures } from "../lib/features/engine";
import { FEATURE_SCHEMA_VERSION } from "../lib/features/types";
import {
  supportedSports,
  type SupportedSport,
} from "../lib/providers/types";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseSports(value: string | undefined): SupportedSport[] {
  if (!value || value === "all") return [...supportedSports];

  const requested = [
    ...new Set(
      value
        .split(",")
        .map((sport) => sport.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const invalid = requested.filter(
    (sport) => !supportedSports.includes(sport as SupportedSport),
  );

  if (invalid.length > 0) {
    throw new Error(`Unsupported sports: ${invalid.join(", ")}`);
  }

  return requested as SupportedSport[];
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

async function main() {
  const db = getDb();
  const eventId = getArg("event-id");
  const sports = parseSports(getArg("sports"));
  const hours = parsePositiveInt(getArg("hours"), 168, "--hours");
  const limit = Math.min(
    1000,
    parsePositiveInt(getArg("limit"), 250, "--limit"),
  );
  const asOf = new Date();

  try {
    const events = eventId
      ? await db.event.findMany({
          where: { id: eventId },
          select: { id: true, sport: { select: { key: true } } },
        })
      : await db.event.findMany({
          where: {
            startTime: {
              gte: asOf,
              lte: new Date(asOf.getTime() + hours * 60 * 60 * 1000),
            },
            sport: { key: { in: sports } },
            status: { notIn: ["CANCELLED", "POSTPONED"] },
          },
          orderBy: { startTime: "asc" },
          take: limit,
          select: { id: true, sport: { select: { key: true } } },
        });

    if (events.length === 0) {
      console.log("No eligible events found for feature calculation.");
      return;
    }

    let created = 0;
    let reused = 0;
    let qualityTotal = 0;

    for (const event of events) {
      const result = await calculateEventFeatures(db, event.id, asOf);
      if (result.reused) reused += 1;
      else created += 1;
      qualityTotal += result.vector.quality.overall;

      console.log(
        [
          event.id,
          event.sport.key,
          result.reused ? "REUSED" : "CREATED",
          `quality=${result.vector.quality.overall.toFixed(3)}`,
          `missing=${result.vector.sportSpecific.missing.length}`,
        ].join(" | "),
      );
    }

    console.log("Feature calculation complete.", {
      events: events.length,
      created,
      reused,
      averageDataQuality: Number(
        (qualityTotal / events.length).toFixed(5),
      ),
      schemaVersion: FEATURE_SCHEMA_VERSION,
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE feature calculation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
