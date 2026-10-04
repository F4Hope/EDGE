import { createHash } from "node:crypto";
import type { getDb } from "@/lib/prisma";
import { attachProviderAliases } from "@/lib/data/eventIdentity";
import { syncProviderEvents } from "@/lib/data/syncEvents";
import type {
  DataProvider,
  ProviderEvent,
  SupportedSport,
} from "@/lib/providers/types";
import type {
  FeaturedMarketKey,
  OddsProvider,
  ProviderOddsEvent,
  ProviderOddsOutcome,
} from "@/lib/providers/oddsTypes";

type EdgeDb = ReturnType<typeof getDb>;
type CombinedOddsProvider = DataProvider & OddsProvider;

const marketNames: Record<FeaturedMarketKey, string> = {
  h2h: "Head to head / Moneyline",
  spreads: "Spread / Handicap",
  totals: "Totals / Over Under",
};

export type OddsSyncOptions = {
  regions: string[];
  markets: FeaturedMarketKey[];
  maxSportKeys: number;
  allowedSportKeys?: string[];
};

export type OddsSyncResult = {
  provider: string;
  sport: SupportedSport;
  discoveredEvents: number;
  matchedAliases: number;
  createdProviderEvents: number;
  sportKeys: string[];
  oddsEvents: number;
  bookmakers: number;
  markets: number;
  snapshotsInserted: number;
  snapshotsReused: number;
  quota?: {
    remaining?: number;
    used?: number;
    lastCost?: number;
    batchCost?: number;
  };
};

function normalizeToken(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pointToken(point: number | null | undefined): string {
  return typeof point === "number" && Number.isFinite(point)
    ? String(point)
    : "na";
}

export function makeSelectionKey(
  marketKey: FeaturedMarketKey,
  outcome: ProviderOddsOutcome,
): string {
  return [
    marketKey,
    normalizeToken(outcome.name),
    pointToken(outcome.point),
  ].join(":");
}

export function makeSnapshotFingerprint(input: {
  marketId: string;
  provider: string;
  bookmakerKey: string;
  selectionKey: string;
  point?: number | null;
  decimalOdds: number;
  providerUpdatedAt?: Date | null;
}): string {
  const payload = [
    input.marketId,
    input.provider,
    input.bookmakerKey,
    input.selectionKey,
    pointToken(input.point),
    String(input.decimalOdds),
    input.providerUpdatedAt?.toISOString() ?? "unknown-update",
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

function parseProviderDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function ensureProviderEvents(
  db: EdgeDb,
  provider: CombinedOddsProvider,
  sport: SupportedSport,
  events: ProviderEvent[],
  from: Date,
  to: Date,
): Promise<{ matchedAliases: number; createdProviderEvents: number }> {
  const aliases = await attachProviderAliases(db, provider.name, events);

  if (aliases.unmatched.length === 0) {
    return {
      matchedAliases: aliases.matched + aliases.direct,
      createdProviderEvents: 0,
    };
  }

  const unmatchedProvider: DataProvider = {
    name: provider.name,
    supports: (candidateSport) => candidateSport === sport,
    getEvents: async () => aliases.unmatched,
  };

  await syncProviderEvents(db, unmatchedProvider, sport, from, to);

  return {
    matchedAliases: aliases.matched + aliases.direct,
    createdProviderEvents: aliases.unmatched.length,
  };
}

async function resolveCanonicalEventId(
  db: EdgeDb,
  provider: string,
  event: ProviderOddsEvent,
): Promise<string> {
  const source = await db.eventSource.findUnique({
    where: {
      provider_externalId: {
        provider,
        externalId: event.providerId,
      },
    },
    select: { eventId: true },
  });

  if (!source) {
    throw new Error(
      `No canonical event alias exists for ${provider} event ${event.providerId}.`,
    );
  }

  return source.eventId;
}

export async function syncOddsSnapshots(
  db: EdgeDb,
  provider: CombinedOddsProvider,
  sport: SupportedSport,
  from: Date,
  to: Date,
  options: OddsSyncOptions,
): Promise<OddsSyncResult> {
  if (!provider.supports(sport)) {
    throw new Error(`${provider.name} does not support ${sport}.`);
  }

  const discovered = await provider.getEvents({
    sport,
    from,
    to,
    sourceSportKeys: options.allowedSportKeys,
    maxSourceSportKeys: options.maxSportKeys,
  });
  const uniqueDiscovered = [
    ...new Map(discovered.map((event) => [event.providerId, event])).values(),
  ];

  const eventResolution = await ensureProviderEvents(
    db,
    provider,
    sport,
    uniqueDiscovered,
    from,
    to,
  );

  const discoveredKeys = [
    ...new Set(
      uniqueDiscovered
        .map((event) => event.sourceSportKey)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const allowed = options.allowedSportKeys?.length
    ? new Set(options.allowedSportKeys)
    : null;
  const sportKeys = allowed
    ? discoveredKeys.filter((key) => allowed.has(key))
    : discoveredKeys;

  if (sportKeys.length === 0) {
    return {
      provider: provider.name,
      sport,
      discoveredEvents: uniqueDiscovered.length,
      matchedAliases: eventResolution.matchedAliases,
      createdProviderEvents: eventResolution.createdProviderEvents,
      sportKeys: [],
      oddsEvents: 0,
      bookmakers: 0,
      markets: 0,
      snapshotsInserted: 0,
      snapshotsReused: 0,
    };
  }

  if (sportKeys.length > options.maxSportKeys) {
    throw new Error(
      `Odds sync discovered ${sportKeys.length} active sport keys for ${sport}, above the safety limit of ${options.maxSportKeys}. Narrow --sport-keys, the date window, or raise ODDS_SYNC_MAX_SPORT_KEYS deliberately.`,
    );
  }

  const fetched = await provider.getOdds({
    sport,
    from,
    to,
    regions: options.regions,
    markets: options.markets,
    sportKeys,
  });

  let bookmakerCount = 0;
  let marketCount = 0;
  let snapshotsInserted = 0;
  let snapshotsReused = 0;

  for (const oddsEvent of fetched.events) {
    const eventId = await resolveCanonicalEventId(
      db,
      provider.name,
      oddsEvent,
    );

    for (const bookmaker of oddsEvent.bookmakers) {
      bookmakerCount += 1;

      for (const marketOdds of bookmaker.markets) {
        marketCount += 1;

        let market = await db.market.findFirst({
          where: {
            eventId,
            provider: provider.name,
            key: marketOdds.key,
          },
        });

        if (!market) {
          market = await db.market.create({
            data: {
              eventId,
              provider: provider.name,
              key: marketOdds.key,
              name: marketNames[marketOdds.key],
              status: "OPEN",
            },
          });
        } else if (
          market.name !== marketNames[marketOdds.key] ||
          market.status !== "OPEN"
        ) {
          market = await db.market.update({
            where: { id: market.id },
            data: {
              name: marketNames[marketOdds.key],
              status: "OPEN",
            },
          });
        }

        const providerUpdatedAt =
          parseProviderDate(marketOdds.lastUpdate) ??
          parseProviderDate(bookmaker.lastUpdate);

        for (const outcome of marketOdds.outcomes) {
          const selectionKey = makeSelectionKey(marketOdds.key, outcome);
          const fingerprint = makeSnapshotFingerprint({
            marketId: market.id,
            provider: provider.name,
            bookmakerKey: bookmaker.key,
            selectionKey,
            point: outcome.point,
            decimalOdds: outcome.price,
            providerUpdatedAt,
          });

          const existing = await db.oddsSnapshot.findUnique({
            where: { fingerprint },
            select: { id: true },
          });

          if (existing) {
            snapshotsReused += 1;
            continue;
          }

          await db.oddsSnapshot.create({
            data: {
              marketId: market.id,
              provider: provider.name,
              bookmakerKey: bookmaker.key,
              bookmakerName: bookmaker.name,
              selectionKey,
              selectionName: outcome.name,
              point: outcome.point ?? null,
              decimalOdds: outcome.price,
              providerUpdatedAt,
              fingerprint,
            },
          });

          snapshotsInserted += 1;
        }
      }
    }
  }

  return {
    provider: provider.name,
    sport,
    discoveredEvents: uniqueDiscovered.length,
    matchedAliases: eventResolution.matchedAliases,
    createdProviderEvents: eventResolution.createdProviderEvents,
    sportKeys,
    oddsEvents: fetched.events.length,
    bookmakers: bookmakerCount,
    markets: marketCount,
    snapshotsInserted,
    snapshotsReused,
    quota: fetched.quota,
  };
}
