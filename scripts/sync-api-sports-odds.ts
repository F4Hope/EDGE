import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import {
  makeSelectionKey,
  makeSnapshotFingerprint,
} from "../lib/data/syncOdds";
import { calculateEventFeatures } from "../lib/features/engine";
import { generatePredictionsForEvent } from "../lib/prediction/generate";
import { ApiSportsFootballOddsClient } from "../lib/providers/apiSportsOdds";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const PROVIDER = "api-sports";
const MARKET_NAMES = {
  h2h: "Head to head / Moneyline",
  totals: "Totals / Over Under",
  double_chance: "Double Chance",
} as const;

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

function booleanArg(name: string, fallback = false): boolean {
  const value = getArg(name);
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`--${name} must be true or false.`);
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

async function ensureMarket(
  db: ReturnType<typeof getDb>,
  eventId: string,
  key: keyof typeof MARKET_NAMES,
) {
  let market = await db.market.findFirst({
    where: {
      eventId,
      provider: PROVIDER,
      key,
    },
  });

  if (!market) {
    market = await db.market.create({
      data: {
        eventId,
        provider: PROVIDER,
        key,
        name: MARKET_NAMES[key],
        status: "OPEN",
      },
    });
  } else if (
    market.status !== "OPEN" ||
    market.name !== MARKET_NAMES[key]
  ) {
    market = await db.market.update({
      where: { id: market.id },
      data: {
        status: "OPEN",
        name: MARKET_NAMES[key],
      },
    });
  }

  return market;
}

async function refreshPricedAnalysis(
  db: ReturnType<typeof getDb>,
  input: { now: Date; to: Date },
) {
  const events = await db.event.findMany({
    where: {
      startTime: { gt: input.now, lte: input.to },
      status: { notIn: ["LIVE", "COMPLETED", "CANCELLED", "POSTPONED"] },
      markets: {
        some: {
          key: { in: ["h2h", "totals", "spreads", "double_chance"] },
          status: "OPEN",
          oddsSnapshots: { some: {} },
        },
      },
    },
    orderBy: { startTime: "asc" },
    take: 500,
    select: { id: true },
  });

  let featuresCreated = 0;
  let featuresReused = 0;
  let predictionsCreated = 0;
  let predictionsReused = 0;
  let predictionsSkipped = 0;

  for (const event of events) {
    const feature = await calculateEventFeatures(db, event.id, input.now);
    if (feature.reused) featuresReused += 1;
    else featuresCreated += 1;

    const prediction = await generatePredictionsForEvent(
      db,
      event.id,
      input.now,
    );
    predictionsCreated += prediction.created;
    predictionsReused += prediction.reused;
    if (
      prediction.reason &&
      prediction.created === 0 &&
      prediction.reused === 0
    ) {
      predictionsSkipped += 1;
    }
  }

  console.log("EDGE priced analysis post-processing complete.", {
    events: events.length,
    featuresCreated,
    featuresReused,
    predictionsCreated,
    predictionsReused,
    predictionsSkipped,
  });
}

async function main() {
  const apiKey = process.env.API_SPORTS_KEY;
  const refreshAnalysis = booleanArg("refresh-analysis", false);

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

  if (!apiKey && !refreshAnalysis) {
    throw new Error(
      "API_SPORTS_KEY is not configured. Add it before syncing API-Sports odds.",
    );
  }

  const client = apiKey ? new ApiSportsFootballOddsClient(apiKey) : null;
  const db = getDb();
  const now = new Date();
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000);

  let requestsAttempted = 0;
  let providerEventsReturned = 0;
  let eventsWithOdds = 0;
  let bookmakers = 0;
  let snapshotsInserted = 0;
  let snapshotsReused = 0;
  let h2hSnapshotsInserted = 0;
  let totalsSnapshotsInserted = 0;
  let doubleChanceSnapshotsInserted = 0;
  let noOddsReturned = 0;
  let missingProviderId = 0;

  try {
    if (client) {
      try {
        const candidates = await db.event.findMany({
          where: {
            sport: { key: "football" },
            startTime: { gt: now, lte: to },
            status: { notIn: ["COMPLETED", "CANCELLED", "POSTPONED"] },
            sources: { some: { provider: PROVIDER } },
            OR: [
              {
                NOT: {
                  markets: {
                    some: {
                      provider: PROVIDER,
                      key: "h2h",
                      status: "OPEN",
                      oddsSnapshots: { some: {} },
                    },
                  },
                },
              },
              {
                NOT: {
                  markets: {
                    some: {
                      provider: PROVIDER,
                      key: "totals",
                      status: "OPEN",
                      oddsSnapshots: { some: {} },
                    },
                  },
                },
              },
              {
                NOT: {
                  markets: {
                    some: {
                      provider: PROVIDER,
                      key: "double_chance",
                      status: "OPEN",
                      oddsSnapshots: { some: {} },
                    },
                  },
                },
              },
            ],
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

          const hasH2h = oddsEvent.bookmakers.some(
            (bookmaker) => bookmaker.outcomes.length >= 2,
          );
          const hasTotals = oddsEvent.bookmakers.some(
            (bookmaker) => bookmaker.totalsOutcomes.length >= 2,
          );
          const hasDoubleChance = oddsEvent.bookmakers.some(
            (bookmaker) => bookmaker.doubleChanceOutcomes.length >= 2,
          );

          if (!hasH2h && !hasTotals && !hasDoubleChance) {
            noOddsReturned += 1;
            continue;
          }

          const h2hMarket = hasH2h
            ? await ensureMarket(db, event.id, "h2h")
            : null;
          const totalsMarket = hasTotals
            ? await ensureMarket(db, event.id, "totals")
            : null;
          const doubleChanceMarket = hasDoubleChance
            ? await ensureMarket(db, event.id, "double_chance")
            : null;

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

            if (h2hMarket) {
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
                  marketId: h2hMarket.id,
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
                    marketId: h2hMarket.id,
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
                h2hSnapshotsInserted += 1;
                storedForEvent = true;
              }
            }

            if (totalsMarket) {
              for (const outcome of bookmaker.totalsOutcomes) {
                const selectionName =
                  outcome.side === "over" ? "Over" : "Under";
                const selectionKey = makeSelectionKey("totals", {
                  name: selectionName,
                  price: outcome.price,
                  point: outcome.point,
                });
                const fingerprint = makeSnapshotFingerprint({
                  marketId: totalsMarket.id,
                  provider: PROVIDER,
                  bookmakerKey: bookmaker.key,
                  selectionKey,
                  point: outcome.point,
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
                    marketId: totalsMarket.id,
                    provider: PROVIDER,
                    bookmakerKey: bookmaker.key,
                    bookmakerName: bookmaker.name,
                    selectionKey,
                    selectionName,
                    point: outcome.point,
                    decimalOdds: outcome.price,
                    providerUpdatedAt: safeProviderUpdatedAt,
                    fingerprint,
                  },
                });

                snapshotsInserted += 1;
                totalsSnapshotsInserted += 1;
                storedForEvent = true;
              }
            }

            if (doubleChanceMarket) {
              for (const outcome of bookmaker.doubleChanceOutcomes) {
                const selectionName =
                  outcome.side === "home_draw"
                    ? "Home/Draw"
                    : outcome.side === "home_away"
                      ? "Home/Away"
                      : "Draw/Away";
                const selectionKey = makeSelectionKey("double_chance", {
                  name: selectionName,
                  price: outcome.price,
                });
                const fingerprint = makeSnapshotFingerprint({
                  marketId: doubleChanceMarket.id,
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
                    marketId: doubleChanceMarket.id,
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
                doubleChanceSnapshotsInserted += 1;
                storedForEvent = true;
              }
            }
          }

          if (storedForEvent) {
            eventsWithOdds += 1;
          }
        }

        console.log("API-Sports targeted football featured odds sync complete.", {
          hours,
          maxRequests,
          candidates: candidates.length,
          requestsAttempted,
          providerEventsReturned,
          eventsWithOdds,
          bookmakers,
          snapshotsInserted,
          snapshotsReused,
          h2hSnapshotsInserted,
          totalsSnapshotsInserted,
          doubleChanceSnapshotsInserted,
          noOddsReturned,
          missingProviderId,
          from: now.toISOString(),
          to: to.toISOString(),
        });
      } catch (error) {
        if (!refreshAnalysis) throw error;
        console.warn(
          "API-Sports odds sync failed; continuing analysis refresh from stored odds.",
        );
        console.warn(error instanceof Error ? error.message : error);
      }
    } else {
      console.warn(
        "API_SPORTS_KEY is not configured; continuing analysis refresh from stored odds.",
      );
    }

    if (refreshAnalysis) {
      const analysisAsOf = new Date();
      await refreshPricedAnalysis(db, {
        now: analysisAsOf,
        to: new Date(
          analysisAsOf.getTime() + hours * 60 * 60 * 1000,
        ),
      });
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE API-Sports targeted football odds sync failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
