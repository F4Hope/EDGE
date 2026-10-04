import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import { syncProviderResults } from "../lib/data/syncResults";
import { OddsApiProvider } from "../lib/providers/oddsApi";
import {
  checkpointScope,
  withSyncCheckpoint,
} from "../lib/system/syncCheckpoint";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function getArg(name: string): string | undefined {
  const prefix = "--" + name + "=";
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function boundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(label + " must be an integer from " + min + " to " + max + ".");
  }
  return parsed;
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ODDS_API_KEY is not configured. Tennis score synchronization is quota-sensitive and requires explicit configuration.",
    );
  }

  const days = boundedInt(getArg("days"), 3, 1, 3, "--days");
  const maxSportKeys = boundedInt(
    getArg("max-sport-keys") ?? process.env.ODDS_RESULT_MAX_SPORT_KEYS,
    4,
    1,
    12,
    "--max-sport-keys",
  );

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const db = getDb();
  const provider = new OddsApiProvider(apiKey);

  try {
    const rows = await db.eventSource.findMany({
      where: {
        provider: provider.name,
        sourceSportKey: { not: null },
        event: {
          sport: { key: "tennis" },
          startTime: { gte: from, lte: to },
        },
      },
      select: {
        sourceSportKey: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 250,
    });

    const sourceSportKeys = [
      ...new Set(
        rows
          .map((row) => row.sourceSportKey?.trim())
          .filter((key): key is string => Boolean(key)),
      ),
    ].slice(0, maxSportKeys);

    if (sourceSportKeys.length === 0) {
      console.log(
        "No recent stored Odds API tennis sport keys are available for score synchronization.",
      );
      return;
    }

    console.log(
      "Refreshing recent tennis scores from The Odds API.",
      {
        days,
        sportKeys: sourceSportKeys.length,
        maxSportKeys,
        quotaNote:
          "Completed-score requests cost provider credits; this command is never run by the default refresh path.",
      },
    );

    const summary = await withSyncCheckpoint(db, {
      provider: provider.name,
      scope: checkpointScope("results", "tennis"),
      work: () =>
        syncProviderResults(db, provider, "tennis", from, to, {
          sourceSportKeys,
          maxSourceSportKeys: maxSportKeys,
        }),
      metadata: (value) => ({
        ...value,
        days,
        sourceSportKeys,
      }),
    });

    console.log("Tennis score sync complete.", summary);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE Odds API tennis score synchronization failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
