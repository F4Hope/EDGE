import { providerParticipantNamesEquivalent } from "@/lib/data/eventIdentity";
import { getDb } from "@/lib/prisma";
import {
  supportedSports,
  type SupportedSport,
} from "@/lib/providers/types";

export type UiEventOddsQuote = {
  selectionKey: string;
  selectionName: string;
  decimalOdds: number;
  bookmakerName: string | null;
  capturedAt: string;
};

export type UiEvent = {
  id: string;
  provider: string;
  sport: SupportedSport;
  league: string;
  country: string | null;
  startsAt: string;
  status: string;
  home: string | null;
  away: string | null;
  h2hOdds: UiEventOddsQuote[];
};

export type UiEventCollection = {
  events: UiEvent[];
  available: boolean;
  message: string | null;
};

type OddsSnapshotShape = {
  provider: string;
  bookmakerKey: string | null;
  bookmakerName: string | null;
  selectionKey: string;
  selectionName: string;
  decimalOdds: unknown;
  capturedAt: Date;
};

type EventWithRelations = {
  id: string;
  provider: string;
  startTime: Date;
  status: string;
  sport: { key: string };
  league: { name: string; country: string | null };
  homeTeam: { name: string } | null;
  awayTeam: { name: string } | null;
  homePlayer: { fullName: string } | null;
  awayPlayer: { fullName: string } | null;
  markets: Array<{
    oddsSnapshots: OddsSnapshotShape[];
  }>;
};

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function selectionBucket(
  selectionName: string,
  home: string | null,
  away: string | null,
): "home" | "draw" | "away" | string {
  const normalized = normalizeLabel(selectionName);

  if (
    home &&
    providerParticipantNamesEquivalent(selectionName, home)
  ) {
    return "home";
  }

  if (normalized === "draw" || normalized === "tie") {
    return "draw";
  }

  if (
    away &&
    providerParticipantNamesEquivalent(selectionName, away)
  ) {
    return "away";
  }

  return `other:${normalized}`;
}

function bestH2hOdds(
  event: EventWithRelations,
  home: string | null,
  away: string | null,
): UiEventOddsQuote[] {
  if (event.markets.length === 0) return [];

  const latestPerBookmakerSelection = new Map<
    string,
    { snapshot: OddsSnapshotShape; bucket: string }
  >();

  for (const market of event.markets) {
    for (const snapshot of market.oddsSnapshots) {
      if (snapshot.capturedAt >= event.startTime) continue;

      const bucket = selectionBucket(snapshot.selectionName, home, away);
      const identity = [
        snapshot.provider,
        snapshot.bookmakerKey ?? "unknown-bookmaker",
        bucket,
      ].join("|");

      if (!latestPerBookmakerSelection.has(identity)) {
        latestPerBookmakerSelection.set(identity, { snapshot, bucket });
      }
    }
  }

  const bestPerSelection = new Map<
    string,
    { snapshot: OddsSnapshotShape; bucket: string }
  >();

  for (const candidate of latestPerBookmakerSelection.values()) {
    const current = bestPerSelection.get(candidate.bucket);
    if (
      !current ||
      Number(candidate.snapshot.decimalOdds) >
        Number(current.snapshot.decimalOdds)
    ) {
      bestPerSelection.set(candidate.bucket, candidate);
    }
  }

  function rank(bucket: string): number {
    if (bucket === "home") return 0;
    if (bucket === "draw") return 1;
    if (bucket === "away") return 2;
    return 3;
  }

  return [...bestPerSelection.values()]
    .map(({ snapshot, bucket }) => ({
      selectionKey: bucket,
      selectionName:
        bucket === "home"
          ? (home ?? snapshot.selectionName)
          : bucket === "away"
            ? (away ?? snapshot.selectionName)
            : bucket === "draw"
              ? "Draw"
              : snapshot.selectionName,
      decimalOdds: Number(snapshot.decimalOdds),
      bookmakerName: snapshot.bookmakerName,
      capturedAt: snapshot.capturedAt.toISOString(),
    }))
    .filter(
      (quote) =>
        Number.isFinite(quote.decimalOdds) && quote.decimalOdds > 1,
    )
    .sort(
      (a, b) =>
        rank(a.selectionKey) - rank(b.selectionKey) ||
        a.selectionName.localeCompare(b.selectionName),
    )
    .slice(0, 3);
}

function toUiEvent(event: EventWithRelations): UiEvent | null {
  if (!supportedSports.includes(event.sport.key as SupportedSport)) {
    return null;
  }

  const home = event.homeTeam?.name ?? event.homePlayer?.fullName ?? null;
  const away = event.awayTeam?.name ?? event.awayPlayer?.fullName ?? null;

  return {
    id: event.id,
    provider: event.provider,
    sport: event.sport.key as SupportedSport,
    league: event.league.name,
    country: event.league.country,
    startsAt: event.startTime.toISOString(),
    status: event.status,
    home,
    away,
    h2hOdds: bestH2hOdds(event, home, away),
  };
}

const relationInclude = {
  sport: { select: { key: true } },
  league: { select: { name: true, country: true } },
  homeTeam: { select: { name: true } },
  awayTeam: { select: { name: true } },
  homePlayer: { select: { fullName: true } },
  awayPlayer: { select: { fullName: true } },
  markets: {
    where: { key: "h2h" as const, status: "OPEN" as const },
    orderBy: { updatedAt: "desc" as const },
    include: {
      oddsSnapshots: {
        orderBy: { capturedAt: "desc" as const },
        take: 300,
        select: {
          provider: true,
          bookmakerKey: true,
          bookmakerName: true,
          selectionKey: true,
          selectionName: true,
          decimalOdds: true,
          capturedAt: true,
        },
      },
    },
  },
} as const;

export async function getUiEvents(options?: {
  sport?: SupportedSport;
  hours?: number;
  limit?: number;
  league?: string;
  country?: string;
  market?: "h2h" | "spreads" | "totals";
  minOdds?: number;
  maxOdds?: number;
  requireOdds?: boolean;
}): Promise<UiEventCollection> {
  const now = new Date();
  const hours = Math.min(24 * 14, Math.max(1, options?.hours ?? 168));
  const limit = Math.min(200, Math.max(1, options?.limit ?? 60));
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000);

  const hasLeagueFilter = Boolean(options?.league || options?.country);
  const effectiveMarket =
    options?.market ?? (options?.requireOdds ? "h2h" : undefined);
  const hasOddsFilter =
    Boolean(effectiveMarket) ||
    options?.requireOdds === true ||
    options?.minOdds !== undefined ||
    options?.maxOdds !== undefined;

  try {
    const db = getDb();
    const rows = await db.event.findMany({
      where: {
        startTime: { gte: now, lte: to },
        status: { notIn: ["COMPLETED", "CANCELLED", "POSTPONED"] },
        ...(options?.sport ? { sport: { key: options.sport } } : {}),
        ...(hasLeagueFilter
          ? {
              league: {
                ...(options?.league
                  ? {
                      name: {
                        contains: options.league,
                        mode: "insensitive" as const,
                      },
                    }
                  : {}),
                ...(options?.country
                  ? {
                      country: {
                        contains: options.country,
                        mode: "insensitive" as const,
                      },
                    }
                  : {}),
              },
            }
          : {}),
        ...(hasOddsFilter
          ? {
              markets: {
                some: {
                  status: "OPEN" as const,
                  ...(effectiveMarket ? { key: effectiveMarket } : {}),
                  ...(options?.requireOdds === true ||
                  options?.minOdds !== undefined ||
                  options?.maxOdds !== undefined
                    ? {
                        oddsSnapshots: {
                          some: {
                            ...(options?.minOdds !== undefined ||
                            options?.maxOdds !== undefined
                              ? {
                                  decimalOdds: {
                                    ...(options?.minOdds !== undefined
                                      ? { gte: options.minOdds }
                                      : {}),
                                    ...(options?.maxOdds !== undefined
                                      ? { lte: options.maxOdds }
                                      : {}),
                                  },
                                }
                              : {}),
                          },
                        },
                      }
                    : {}),
                },
              },
            }
          : {}),
      },
      orderBy: { startTime: "asc" },
      take: limit,
      include: relationInclude,
    });

    const events = rows
      .map((row) => toUiEvent(row))
      .filter((event): event is UiEvent => event !== null)
      .filter((event) => !options?.requireOdds || event.h2hOdds.length >= 2);

    return {
      events,
      available: true,
      message:
        events.length === 0
          ? options?.requireOdds
            ? "No upcoming events with stored H2H odds match this filter window."
            : "No normalized upcoming events match this filter window."
          : null,
    };
  } catch (error) {
    return {
      events: [],
      available: false,
      message:
        error instanceof Error && error.message.includes("DATABASE_URL")
          ? "Database connection is not configured in this environment."
          : "The event database is currently unavailable.",
    };
  }
}

export async function getUiEventById(eventId: string): Promise<{
  event: UiEvent | null;
  available: boolean;
  message: string | null;
}> {
  try {
    const db = getDb();
    const row = await db.event.findUnique({
      where: { id: eventId },
      include: relationInclude,
    });

    if (!row) {
      return {
        event: null,
        available: true,
        message: "This event is not present in the EDGE database.",
      };
    }

    const event = toUiEvent(row);
    if (!event) {
      return {
        event: null,
        available: true,
        message:
          "This event uses a sport that is not enabled in the current interface.",
      };
    }

    return { event, available: true, message: null };
  } catch (error) {
    return {
      event: null,
      available: false,
      message:
        error instanceof Error && error.message.includes("DATABASE_URL")
          ? "Database connection is not configured in this environment."
          : "The event database is currently unavailable.",
    };
  }
}
