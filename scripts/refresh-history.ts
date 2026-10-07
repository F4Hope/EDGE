import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import { getDb } from "../lib/prisma";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const DAY_MS = 86_400_000;
const EVIDENCE_SCOPE = "evidence-history-rotation";

function run(script: string, args: string[] = []) {
  const result = spawnSync("npm", ["run", script, "--", ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      "npm run " + script + " failed with exit code " + String(result.status) + ".",
    );
  }
}

function runBestEffort(
  script: string,
  args: string[],
  label: string,
): boolean {
  try {
    run(script, args);
    return true;
  } catch (error) {
    console.warn(
      "WARN " +
        label +
        " failed; continuing with stored event identities so result settlement can still run.",
    );
    console.warn(error instanceof Error ? error.message : error);
    return false;
  }
}

function positiveHours(
  envName: string,
  fallback: number,
  max: number,
): number {
  const parsed = Number(process.env[envName] ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    throw new Error(
      envName + " must be a positive number no greater than " + max + ".",
    );
  }
  return parsed;
}

function positiveDays(
  envName: string,
  fallback: number,
  max: number,
): number {
  const parsed = Number(process.env[envName] ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    throw new Error(
      envName + " must be a positive integer no greater than " + max + ".",
    );
  }
  return parsed;
}

function isoOffset(base: Date, hours: number): string {
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function startOfUtcDay(base: Date): Date {
  return new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
    ),
  );
}

function evidenceWindow(
  now: Date,
  lookbackDays: number,
  chunkDays: number,
  bucket: number,
): { from: Date; to: Date; bucketCount: number } {
  const protectedRecentDays = 3;
  const historyDays = Math.max(1, lookbackDays - protectedRecentDays);
  const bucketCount = Math.max(1, Math.ceil(historyDays / chunkDays));
  const normalizedBucket = ((bucket % bucketCount) + bucketCount) % bucketCount;
  const endDaysAgo = protectedRecentDays + normalizedBucket * chunkDays;
  const startDaysAgo = Math.min(
    lookbackDays,
    endDaysAgo + chunkDays - 1,
  );
  const today = startOfUtcDay(now);
  const from = new Date(today.getTime() - startDaysAgo * DAY_MS);
  const to = new Date(
    today.getTime() - endDaysAgo * DAY_MS + DAY_MS - 1,
  );
  return { from, to, bucketCount };
}

function metadataBucket(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const bucket = (value as Record<string, unknown>).nextBucket;
  return typeof bucket === "number" && Number.isInteger(bucket) && bucket >= 0
    ? bucket
    : 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. In Codespaces, run npm run db:local first.",
    );
  }

  if (!process.env.API_SPORTS_KEY) {
    throw new Error(
      "API_SPORTS_KEY is not configured. Historical refresh requires API-Sports.",
    );
  }

  const lookbackHours = positiveHours(
    "API_SPORTS_HISTORY_LOOKBACK_HOURS",
    48,
    72,
  );
  const evidenceLookbackDays = positiveDays(
    "API_SPORTS_EVIDENCE_LOOKBACK_DAYS",
    60,
    90,
  );
  const evidenceChunkDays = positiveDays(
    "API_SPORTS_EVIDENCE_CHUNK_DAYS",
    5,
    7,
  );

  const now = new Date();
  const from = isoOffset(now, -lookbackHours);
  const to = now.toISOString();

  console.log("EDGE rolling history refresh");
  console.log("----------------------------");
  console.log(
    "Backfilling football/basketball event identities for the previous " +
      lookbackHours +
      " hours...",
  );

  runBestEffort(
    "data:sync",
    [
      "--provider=api-sports",
      "--sports=football,basketball",
      "--from=" + from,
      "--to=" + to,
    ],
    "API-Sports historical event backfill",
  );

  console.log(
    "Settling football/basketball results across the same historical window...",
  );
  const apiSportsResultsOk = runBestEffort(
    "results:sync",
    [
      "--sports=football,basketball",
      "--from=" + from,
      "--to=" + to,
    ],
    "API-Sports result settlement",
  );

  if (!apiSportsResultsOk) {
    if (!process.env.ODDS_API_KEY) {
      throw new Error(
        "API-Sports result settlement failed and ODDS_API_KEY is not configured for fallback.",
      );
    }

    const fallbackDays = Math.min(3, Math.max(1, Math.ceil(lookbackHours / 24)));
    console.warn(
      "WARN API-Sports result settlement failed; falling back to The Odds API for stored football/basketball sport keys.",
    );
    run("results:sync:odds", [
      "--sports=football,basketball",
      "--days=" + fallbackDays,
      "--max-sport-keys=3",
    ]);
  }

  const db = getDb();
  try {
    const checkpoint = await db.syncCheckpoint.findUnique({
      where: {
        provider_scope: {
          provider: "api-sports",
          scope: EVIDENCE_SCOPE,
        },
      },
      select: { metadata: true },
    });
    const bucket = metadataBucket(checkpoint?.metadata);
    const window = evidenceWindow(
      now,
      evidenceLookbackDays,
      evidenceChunkDays,
      bucket,
    );

    console.log("Backfilling deeper model evidence.", {
      bucket: bucket + 1,
      bucketCount: window.bucketCount,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      sports: ["football", "basketball"],
    });

    const eventsOk = runBestEffort(
      "data:sync",
      [
        "--provider=api-sports",
        "--sports=football,basketball",
        "--from=" + window.from.toISOString(),
        "--to=" + window.to.toISOString(),
      ],
      "API-Sports evidence event backfill",
    );

    const resultsOk = runBestEffort(
      "results:sync",
      [
        "--sports=football,basketball",
        "--from=" + window.from.toISOString(),
        "--to=" + window.to.toISOString(),
      ],
      "API-Sports evidence result backfill",
    );

    if (eventsOk && resultsOk) {
      const nextBucket = (bucket + 1) % window.bucketCount;
      await db.syncCheckpoint.upsert({
        where: {
          provider_scope: {
            provider: "api-sports",
            scope: EVIDENCE_SCOPE,
          },
        },
        update: {
          lastStartedAt: now,
          lastCompletedAt: new Date(),
          lastStatus: "COMPLETED",
          metadata: {
            nextBucket,
            bucketCount: window.bucketCount,
            lookbackDays: evidenceLookbackDays,
            chunkDays: evidenceChunkDays,
            lastFrom: window.from.toISOString(),
            lastTo: window.to.toISOString(),
          },
        },
        create: {
          provider: "api-sports",
          scope: EVIDENCE_SCOPE,
          lastStartedAt: now,
          lastCompletedAt: new Date(),
          lastStatus: "COMPLETED",
          metadata: {
            nextBucket,
            bucketCount: window.bucketCount,
            lookbackDays: evidenceLookbackDays,
            chunkDays: evidenceChunkDays,
            lastFrom: window.from.toISOString(),
            lastTo: window.to.toISOString(),
          },
        },
      });
    }
  } finally {
    await db.$disconnect();
  }

  console.log("EDGE rolling history refresh complete.");
}

main().catch((error) => {
  console.error("EDGE rolling history refresh failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
