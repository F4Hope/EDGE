import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import { syncProviderResults } from "../lib/data/syncResults";
import { OddsApiProvider } from "../lib/providers/oddsApi";
import type { SupportedSport } from "../lib/providers/types";
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

function parseSports(value: string | undefined): SupportedSport[] {
  const allowed: SupportedSport[] = ["football", "basketball", "tennis"];
  if (!value || value === "all") return [...allowed];

  const requested = value
    .split(",")
    .map((sport) => sport.trim().toLowerCase())
    .filter(Boolean);

  const invalid = requested.filter(
    (sport) => !allowed.includes(sport as SupportedSport),
  );
  if (invalid.length > 0) {
    throw new Error(
      "Odds API result sync supports football,basketball,tennis only. Unsupported: " +
        invalid.join(", "),
    );
  }

  return [...new Set(requested)] as SupportedSport[];
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ODDS_API_KEY is not configured. Score synchronization is quota-sensitive and requires explicit configuration.",
    );
  }

  const sports = parseSports(getArg("sports"));
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
    for (const sport of sports) {
      const rows = await db.eventSource.findMany({
        where: {
          provider: provider.name,
          sourceSportKey: { not: null },
          event: {
            sport: { key: sport },
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
          "No recent stored Odds API " +
            sport +
            " sport keys are available for score synchronization.",
        );
        continue;
      }

      console.log("Refreshing recent " + sport + " scores from The Odds API.", {
        days,
        sportKeys: sourceSportKeys.length,
        maxSportKeys,
        quotaNote:
          "Completed-score requests cost provider credits; keep sport-key scope bounded.",
      });

      const summary = await withSyncCheckpoint(db, {
        provider: provider.name,
        scope: checkpointScope("results", sport),
        work: () =>
          syncProviderResults(db, provider, sport, from, to, {
            sourceSportKeys,
            maxSourceSportKeys: maxSportKeys,
          }),
        metadata: (value) => ({
          ...value,
          days,
          sourceSportKeys,
        }),
      });

      console.log("Odds API score sync complete.", summary);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE Odds API score synchronization failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
