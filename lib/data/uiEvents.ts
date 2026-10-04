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
    oddsSnapshots: Array<{
      bookmakerKey: string | null;
      bookmakerName: string | null;
      selectionKey: string;
      selectionName: string;
      decimalOdds: unknown;
      capturedAt: Date;
    }>;
  }>;
};

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bestH2hOdds(
  event: EventWithRelations,
  home: string | null,
  away: string | null,
): UiEventOddsQuote[] {
  const market = event.markets[0];
  if (!market) return [];

  const latestPerBookmakerSelection = new Map<
    string,
    (typeof market.oddsSnapshots)[number]
  >();

  for (const snapshot of market.oddsSnapshots) {
    if (snapshot.capturedAt >= event.startTime) continue;

    const identity = [
      snapshot.bookmakerKey ?? "unknown-bookmaker",
      snapshot.selectionKey,
    ].join("|");

    if (!latestPerBookmakerSelection.has(identity)) {
      latestPerBookmakerSelection.set(identity, snapshot);
    }
  }

  const bestPerSelection = new Map<
    string,
    (typeof market.oddsSnapshots)[number]
  >();

  for (const snapshot of latestPerBookmakerSelection.values()) {
    const current = bestPerSelection.get(snapshot.selectionKey);
    if (
      !current ||
      Number(snapshot.decimalOdds) > Number(current.decimalOdds)
    ) {
      bestPerSelection.set(snapshot.selectionKey, snapshot);
    }
  }

  const homeLabel = normalizeLabel(home);
  const awayLabel = normalizeLabel(away);

  function rank(selectionName: string): number {
    const normalized = normalizeLabel(selectionName);
    if (homeLabel && normalized === homeLabel) return 0;
    if (normalized === "draw" || normalized === "tie") return 1;
    if (awayLabel && normalized === awayLabel) return 2;
    return 3;
  }

  return [...bestPerSelection.values()]
    .map((snapshot) => ({
      selectionKey: snapshot.selectionKey,
      selectionName: snapshot.selectionName,
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
        rank(a.selectionName) - rank(b.selectionName) ||
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
    take: 1,
    include: {
      oddsSnapshots: {
        orderBy: { capturedAt: "desc" as const },
        take: 300,
        select: {
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
}): Promise<UiEventCollection> {
  const now = new Date();
  const hours = Math.min(24 * 14, Math.max(1, options?.hours ?? 168));
  const limit = Math.min(200, Math.max(1, options?.limit ?? 60));
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000);

  const hasLeagueFilter = Boolean(options?.league || options?.country);
  const hasOddsFilter =
    Boolean(options?.market) ||
    options?.minOdds !== undefined ||
    options?.maxOdds !== undefined;

  try {
    const db = getDb();
    const rows = await db.event.findMany({
      where: {
        startTime: { gte: now, lte: to },
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
                  ...(options?.market ? { key: options.market } : {}),
                  ...(options?.minOdds !== undefined ||
                  options?.maxOdds !== undefined
                    ? {
                        oddsSnapshots: {
                          some: {
                            decimalOdds: {
                              ...(options?.minOdds !== undefined
                                ? { gte: options.minOdds }
                                : {}),
                              ...(options?.maxOdds !== undefined
                                ? { lte: options.maxOdds }
                                : {}),
                            },
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
      .filter((event): event is UiEvent => event !== null);

    return {
      events,
      available: true,
      message:
        events.length === 0
          ? "No normalized upcoming events match this filter window."
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
