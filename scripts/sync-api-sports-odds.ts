import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import {
  makeSelectionKey,
  makeSnapshotFingerprint,
} from "../lib/data/syncOdds";
import { ApiSportsFootballOddsClient } from "../lib/providers/apiSportsOdds";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const PROVIDER = "api-sports";
const MARKET_NAME = "Head to head / Moneyline";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseDate(value: string | undefined): string {
  const date = value ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("--date must use YYYY-MM-DD.");
  }
  return date;
}

function parseMaxPages(value: string | undefined): number {
  const parsed = Number(
    value ?? process.env.API_SPORTS_ODDS_MAX_PAGES ?? "45",
  );
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error(
      "API_SPORTS_ODDS_MAX_PAGES must be an integer from 1 to 50.",
    );
  }
  return parsed;
}

function participantNames(event: {
  homeTeam: { name: string } | null;
  awayTeam: { name: string } | null;
  homePlayer: { fullName: string } | null;
  awayPlayer: { fullName: string } | null;
}): { home: string | null; away: string | null } {
  return {
    home: event.homeTeam?.name ?? event.homePlayer?.fullName ?? null,
    away: event.awayTeam?.name ?? event.awayPlayer?.fullName ?? null,
  };
}

async function main() {
  const apiKey = process.env.API_SPORTS_KEY;
  if (!apiKey) {
    throw new Error(
      "API_SPORTS_KEY is not configured. Add it before syncing API-Sports odds.",
    );
  }

  const date = parseDate(getArg("date"));
  const maxPages = parseMaxPages(getArg("max-pages"));
  const client = new ApiSportsFootballOddsClient(apiKey);
  const db = getDb();
  const now = new Date();

  let pagesFetched = 0;
  let totalPages = 1;
  let providerEvents = 0;
  let matchedEvents = 0;
  let eventsWithOdds = 0;
  let bookmakers = 0;
  let snapshotsInserted = 0;
  let snapshotsReused = 0;
  let skippedStarted = 0;
  let skippedUnmatched = 0;
  const eventsWithStoredOdds = new Set<string>();

  try {
    for (let page = 1; page <= Math.min(totalPages, maxPages); page += 1) {
      const result = await client.getDatePage(date, page);
      pagesFetched += 1;
      totalPages = result.totalPages;
      providerEvents += result.events.length;

      for (const oddsEvent of result.events) {
        const source = await db.eventSource.findUnique({
          where: {
            provider_externalId: {
              provider: PROVIDER,
              externalId: oddsEvent.providerId,
            },
          },
          select: { eventId: true },
        });

        if (!source) {
          skippedUnmatched += 1;
          continue;
        }

        const event = await db.event.findUnique({
          where: { id: source.eventId },
          select: {
            id: true,
            startTime: true,
            status: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
            homePlayer: { select: { fullName: true } },
            awayPlayer: { select: { fullName: true } },
          },
        });

        if (!event) {
          skippedUnmatched += 1;
          continue;
        }

        if (
          event.startTime <= now ||
          ["COMPLETED", "CANCELLED", "POSTPONED"].includes(event.status)
        ) {
          skippedStarted += 1;
          continue;
        }

        const names = participantNames(event);
        if (!names.home || !names.away) {
          skippedUnmatched += 1;
          continue;
        }

        matchedEvents += 1;

        let market = await db.market.findFirst({
          where: {
            eventId: event.id,
            provider: PROVIDER,
            key: "h2h",
          },
        });

        if (!market) {
          market = await db.market.create({
            data: {
              eventId: event.id,
              provider: PROVIDER,
              key: "h2h",
              name: MARKET_NAME,
              status: "OPEN",
            },
          });
        } else if (market.status !== "OPEN" || market.name !== MARKET_NAME) {
          market = await db.market.update({
            where: { id: market.id },
            data: {
              status: "OPEN",
              name: MARKET_NAME,
            },
          });
        }

        const providerUpdatedAt = oddsEvent.providerUpdatedAt
          ? new Date(oddsEvent.providerUpdatedAt)
          : null;
        const safeProviderUpdatedAt =
          providerUpdatedAt && !Number.isNaN(providerUpdatedAt.getTime())
            ? providerUpdatedAt
            : null;

        let storedForEvent = false;

        for (const bookmaker of oddsEvent.bookmakers) {
          bookmakers += 1;

          for (const outcome of bookmaker.outcomes) {
            const selectionName =
              outcome.side === "home"
                ? names.home
                : outcome.side === "away"
                  ? names.away
                  : "Draw";

            const selectionKey = makeSelectionKey("h2h", {
              name: selectionName,
              price: outcome.price,
            });
            const fingerprint = makeSnapshotFingerprint({
              marketId: market.id,
              provider: PROVIDER,
              bookmakerKey: bookmaker.key,
              selectionKey,
              decimalOdds: outcome.price,
              providerUpdatedAt: safeProviderUpdatedAt,
            });

            const existing = await db.oddsSnapshot.findUnique({
              where: { fingerprint },
              select: { id: true },
            });

            if (existing) {
              snapshotsReused += 1;
              storedForEvent = true;
              continue;
            }

            await db.oddsSnapshot.create({
              data: {
                marketId: market.id,
                provider: PROVIDER,
                bookmakerKey: bookmaker.key,
                bookmakerName: bookmaker.name,
                selectionKey,
                selectionName,
                decimalOdds: outcome.price,
                providerUpdatedAt: safeProviderUpdatedAt,
                fingerprint,
              },
            });

            snapshotsInserted += 1;
            storedForEvent = true;
          }
        }

        if (storedForEvent) {
          eventsWithStoredOdds.add(event.id);
        }
      }
    }

    eventsWithOdds = eventsWithStoredOdds.size;

    console.log("API-Sports football H2H odds sync complete.", {
      date,
      pagesFetched,
      totalPages,
      pageCap: maxPages,
      pageCapHit: totalPages > maxPages,
      providerEvents,
      matchedEvents,
      eventsWithOdds,
      bookmakers,
      snapshotsInserted,
      snapshotsReused,
      skippedStarted,
      skippedUnmatched,
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE API-Sports football odds sync failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
