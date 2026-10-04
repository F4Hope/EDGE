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

function parseSports(value: string | undefined): SupportedSport[] {
  if (!value || value === "all") return [...supportedSports];

  const requested = value
    .split(",")
    .map((sport) => sport.trim().toLowerCase())
    .filter(Boolean);

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
  const db = getDb();

  try {
    for (const sport of sports) {
      const provider = resolveProvider(providerPreference, sport);
      const result = await withSyncCheckpoint(db, {
        provider: provider.name,
        scope: checkpointScope("events", sport),
        work: () => syncProviderEvents(db, provider, sport, from, to),
        metadata: (value) => ({
          fetched: value.fetched,
          persisted: value.persisted,
          from: value.from,
          to: value.to,
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
