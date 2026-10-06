import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import { syncOddsSnapshots } from "../lib/data/syncOdds";
import { OddsApiProvider } from "../lib/providers/oddsApi";
import {
  featuredMarketKeys,
  type FeaturedMarketKey,
} from "../lib/providers/oddsTypes";
import {
  supportedSports,
  type SupportedSport,
} from "../lib/providers/types";
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
    return boundary === "from"
      ? now
      : new Date(now.getTime() + 48 * 60 * 60 * 1000);
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
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
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

  return requested as SupportedSport[];
}

function parseMarkets(value: string | undefined): FeaturedMarketKey[] {
  const requested = parseCsv(value ?? process.env.ODDS_API_MARKETS ?? "h2h,totals,spreads");
  const invalid = requested.filter(
    (market) => !featuredMarketKeys.includes(market as FeaturedMarketKey),
  );

  if (invalid.length > 0) {
    throw new Error(
      `Unsupported featured markets: ${invalid.join(", ")}. Use ${featuredMarketKeys.join(", ")}.`,
    );
  }

  return requested as FeaturedMarketKey[];
}

function parseMaxSportKeys(value: string | undefined): number {
  const parsed = Number(value ?? process.env.ODDS_SYNC_MAX_SPORT_KEYS ?? "12");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error("ODDS_SYNC_MAX_SPORT_KEYS must be an integer from 1 to 100.");
  }
  return parsed;
}

async function main() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ODDS_API_KEY is not configured. Add it to .env.local before syncing odds.",
    );
  }

  const from = parseDate(getArg("from"), "from");
  const to = parseDate(getArg("to"), "to");
  if (from > to) throw new Error("--from must be before --to.");

  const sports = parseSports(getArg("sports"));
  const regions = parseCsv(
    getArg("regions") ?? process.env.ODDS_API_REGIONS ?? "eu",
  );
  const markets = parseMarkets(getArg("markets"));
  const allowedSportKeys = parseCsv(
    getArg("sport-keys") ?? process.env.ODDS_API_SPORT_KEYS,
  );
  const maxSportKeys = parseMaxSportKeys(getArg("max-sport-keys"));

  if (regions.length === 0) {
    throw new Error("At least one Odds API region is required.");
  }

  const provider = new OddsApiProvider(apiKey);
  const db = getDb();

  try {
    for (const sport of sports) {
      const result = await withSyncCheckpoint(db, {
        provider: provider.name,
        scope: checkpointScope("odds", sport),
        work: () =>
          syncOddsSnapshots(
            db,
            provider,
            sport,
            from,
            to,
            {
              regions,
              markets,
              maxSportKeys,
              allowedSportKeys:
                allowedSportKeys.length > 0 ? allowedSportKeys : undefined,
            },
          ),
        metadata: (value) => ({
          snapshotsInserted: value.snapshotsInserted,
          snapshotsReused: value.snapshotsReused,
          oddsEvents: value.oddsEvents,
          sportKeys: value.sportKeys,
          quota: value.quota,
        }),
      });

      console.log(
        [
          `Odds sync ${sport}: ${result.snapshotsInserted} new snapshots`,
          `${result.snapshotsReused} reused`,
          `${result.oddsEvents} events with odds`,
          `${result.sportKeys.length} sport keys`,
        ].join(" | "),
      );

      if (result.quota) {
        console.log("Odds API quota:", {
          batchCost: result.quota.batchCost,
          remaining: result.quota.remaining,
          used: result.quota.used,
        });
      }
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE odds sync failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
