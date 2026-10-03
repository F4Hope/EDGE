import { getDb } from "@/lib/prisma";
import {
  supportedSports,
  type SupportedSport,
} from "@/lib/providers/types";

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
};

function toUiEvent(event: EventWithRelations): UiEvent | null {
  if (!supportedSports.includes(event.sport.key as SupportedSport)) {
    return null;
  }

  return {
    id: event.id,
    provider: event.provider,
    sport: event.sport.key as SupportedSport,
    league: event.league.name,
    country: event.league.country,
    startsAt: event.startTime.toISOString(),
    status: event.status,
    home: event.homeTeam?.name ?? event.homePlayer?.fullName ?? null,
    away: event.awayTeam?.name ?? event.awayPlayer?.fullName ?? null,
  };
}

const relationInclude = {
  sport: { select: { key: true } },
  league: { select: { name: true, country: true } },
  homeTeam: { select: { name: true } },
  awayTeam: { select: { name: true } },
  homePlayer: { select: { fullName: true } },
  awayPlayer: { select: { fullName: true } },
} as const;

export async function getUiEvents(options?: {
  sport?: SupportedSport;
  hours?: number;
  limit?: number;
}): Promise<UiEventCollection> {
  const now = new Date();
  const hours = Math.min(24 * 14, Math.max(1, options?.hours ?? 168));
  const limit = Math.min(200, Math.max(1, options?.limit ?? 60));
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000);

  try {
    const db = getDb();
    const rows = await db.event.findMany({
      where: {
        startTime: { gte: now, lte: to },
        ...(options?.sport ? { sport: { key: options.sport } } : {}),
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
          ? "No normalized upcoming events are stored for this window yet."
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
        message: "This event uses a sport that is not enabled in the Phase 4 interface.",
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
