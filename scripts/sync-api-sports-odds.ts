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

function positiveInt(
  value: string | undefined,
  fallback: number,
  max: number,
  label: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${label} must be an integer from 1 to ${max}.`);
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

  const maxRequests = positiveInt(
    getArg("max-requests") ?? process.env.API_SPORTS_ODDS_MAX_REQUESTS,
    40,
    60,
    "API_SPORTS_ODDS_MAX_REQUESTS",
  );
  const hours = positiveInt(
    getArg("hours") ?? process.env.API_SPORTS_ODDS_FORWARD_HOURS,
    24,
    72,
    "API_SPORTS_ODDS_FORWARD_HOURS",
  );

  const client = new ApiSportsFootballOddsClient(apiKey);
  const db = getDb();
  const now = new Date();
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000);

  let requestsAttempted = 0;
  let providerEventsReturned = 0;
  let eventsWithOdds = 0;
  let bookmakers = 0;
  let snapshotsInserted = 0;
  let snapshotsReused = 0;
  let noOddsReturned = 0;
  let missingProviderId = 0;

  try {
    const candidates = await db.event.findMany({
      where: {
        sport: { key: "football" },
        startTime: { gt: now, lte: to },
        status: { notIn: ["COMPLETED", "CANCELLED", "POSTPONED"] },
        sources: { some: { provider: PROVIDER } },
        NOT: {
          markets: {
            some: {
              key: "h2h",
              status: "OPEN",
              oddsSnapshots: { some: {} },
            },
          },
        },
      },
      select: {
        id: true,
        startTime: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        homePlayer: { select: { fullName: true } },
        awayPlayer: { select: { fullName: true } },
        sources: {
          where: { provider: PROVIDER },
          select: { externalId: true },
          take: 1,
        },
      },
      orderBy: { startTime: "asc" },
      take: maxRequests,
    });

    for (const event of candidates) {
      const providerId = event.sources[0]?.externalId?.trim();
      if (!providerId) {
        missingProviderId += 1;
        continue;
      }

      requestsAttempted += 1;
      const oddsEvent = await client.getFixture(providerId);

      if (!oddsEvent || oddsEvent.bookmakers.length === 0) {
        noOddsReturned += 1;
        continue;
      }

      providerEventsReturned += 1;

      const names = participantNames(event);
      if (!names.home || !names.away) {
        noOddsReturned += 1;
        continue;
      }

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
        eventsWithOdds += 1;
      }
    }

    console.log("API-Sports targeted football H2H odds sync complete.", {
      hours,
      maxRequests,
      candidates: candidates.length,
      requestsAttempted,
      providerEventsReturned,
      eventsWithOdds,
      bookmakers,
      snapshotsInserted,
      snapshotsReused,
      noOddsReturned,
      missingProviderId,
      from: now.toISOString(),
      to: to.toISOString(),
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE API-Sports targeted football odds sync failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
