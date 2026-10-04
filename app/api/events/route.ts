import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/prisma";
import { parsePageRequest } from "@/lib/production/pagination";
import { supportedSports, type SupportedSport } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const defaultTo = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const from = parseDate(request.nextUrl.searchParams.get("from"), now);
    const to = parseDate(request.nextUrl.searchParams.get("to"), defaultTo);

    if (from > to) {
      return NextResponse.json({ error: "from must be before to." }, { status: 400 });
    }

    const sportParam = request.nextUrl.searchParams.get("sport")?.toLowerCase();
    if (sportParam && !supportedSports.includes(sportParam as SupportedSport)) {
      return NextResponse.json(
        { error: `Unsupported sport. Use one of: ${supportedSports.join(", ")}.` },
        { status: 400 },
      );
    }

    const page = parsePageRequest(request.nextUrl.searchParams, {
      defaultLimit: 100,
      maxLimit: 250,
    });

    const db = getDb();
    const events = await db.event.findMany({
      where: {
        startTime: { gte: from, lte: to },
        ...(sportParam ? { sport: { key: sportParam } } : {}),
      },
      orderBy: [{ startTime: "asc" }, { id: "asc" }],
      take: page.limit,
      ...(page.cursor
        ? { cursor: { id: page.cursor }, skip: 1 }
        : {}),
      include: {
        sport: { select: { key: true, name: true } },
        league: { select: { name: true, country: true } },
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        homePlayer: { select: { fullName: true } },
        awayPlayer: { select: { fullName: true } },
      },
    });

    return NextResponse.json(
      {
        data: events.map((event) => ({
          id: event.id,
          provider: event.provider,
          sport: event.sport.key,
          league: event.league.name,
          country: event.league.country,
          startsAt: event.startTime.toISOString(),
          status: event.status,
          home: event.homeTeam?.name ?? event.homePlayer?.fullName ?? null,
          away: event.awayTeam?.name ?? event.awayPlayer?.fullName ?? null,
        })),
        meta: {
          count: events.length,
          from: from.toISOString(),
          to: to.toISOString(),
          nextCursor:
            events.length === page.limit
              ? events[events.length - 1]?.id ?? null
              : null,
          source: "edge-database",
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Event query failed.";
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
