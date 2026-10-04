import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import { resolveProvider, type ProviderPreference } from "../lib/providers/registry";
import { supportedSports, type SupportedSport } from "../lib/providers/types";
import { syncProviderEvents } from "../lib/data/syncEvents";
import {
  checkpointScope,
  withSyncCheckpoint,
} from "../lib/system/syncCheckpoint";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseDate(value: string | undefined, boundary: "from" | "to"): Date {
  if (!value) {
    const now = new Date();
    return boundary === "from" ? now : new Date(now.getTime() + 48 * 60 * 60 * 1000);
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(
    dateOnly
      ? `${value}T${boundary === "from" ? "00:00:00.000" : "23:59:59.999"}Z`
      : value,
  );

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --${boundary} date: ${value}`);
  }
  return parsed;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function parseMaxSportKeys(value: string | undefined): number {
  const parsed = Number(
    value ?? process.env.ODDS_EVENT_MAX_SPORT_KEYS ?? "4",
  );
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(
      "ODDS_EVENT_MAX_SPORT_KEYS must be an integer from 1 to 100.",
    );
  }
  return parsed;
}

function parseSports(value: string | undefined): SupportedSport[] {
  if (!value || value === "all") return [...supportedSports];

  const requested = parseCsv(value.toLowerCase());

  const invalid = requested.filter(
    (sport) => !supportedSports.includes(sport as SupportedSport),
  );

  if (invalid.length > 0) {
    throw new Error(`Unsupported sports: ${invalid.join(", ")}`);
  }

  return [...new Set(requested)] as SupportedSport[];
}

function parseProvider(value: string | undefined): ProviderPreference {
  const provider = value ?? process.env.SPORTS_DATA_PROVIDER ?? "auto";
  if (provider === "auto" || provider === "api-sports" || provider === "odds-api") {
    return provider;
  }
  throw new Error(`Unsupported provider preference: ${provider}`);
}

async function main() {
  const from = parseDate(getArg("from"), "from");
  const to = parseDate(getArg("to"), "to");
  if (from > to) throw new Error("--from must be before --to.");

  const sports = parseSports(getArg("sports"));
  const providerPreference = parseProvider(getArg("provider"));
  const sourceSportKeys = parseCsv(
    getArg("sport-keys") ?? process.env.ODDS_API_SPORT_KEYS,
  );
  const maxSourceSportKeys = parseMaxSportKeys(getArg("max-sport-keys"));
  const db = getDb();

  try {
    for (const sport of sports) {
      const provider = resolveProvider(providerPreference, sport);
      const result = await withSyncCheckpoint(db, {
        provider: provider.name,
        scope: checkpointScope("events", sport),
        work: () =>
          syncProviderEvents(db, provider, sport, from, to, {
            sourceSportKeys:
              provider.name === "odds-api" && sourceSportKeys.length > 0
                ? sourceSportKeys
                : undefined,
            maxSourceSportKeys:
              provider.name === "odds-api" ? maxSourceSportKeys : undefined,
          }),
        metadata: (value) => ({
          fetched: value.fetched,
          persisted: value.persisted,
          from: value.from,
          to: value.to,
          sourceSportKeys:
            provider.name === "odds-api" && sourceSportKeys.length > 0
              ? sourceSportKeys
              : undefined,
          maxSourceSportKeys:
            provider.name === "odds-api" ? maxSourceSportKeys : undefined,
        }),
      });
      console.log(
        `Synced ${result.persisted}/${result.fetched} ${sport} events from ${result.provider}.`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE event sync failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
