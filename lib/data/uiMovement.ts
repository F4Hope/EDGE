import { getDb } from "@/lib/prisma";
import {
  analyzeMarketMovement,
  type MarketMovementSummary,
} from "@/lib/odds/movement";

export type UiMovementMarket = {
  marketId: string;
  marketKey: string;
  marketName: string;
  summary: MarketMovementSummary;
};

export async function getUiMovementForEvent(
  eventId: string,
): Promise<{
  markets: UiMovementMarket[];
  available: boolean;
  message: string | null;
}> {
  try {
    const db = getDb();
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: {
        startTime: true,
        markets: {
          select: {
            id: true,
            key: true,
            name: true,
            oddsSnapshots: {
              orderBy: { capturedAt: "asc" },
              take: 2000,
              select: {
                bookmakerKey: true,
                selectionKey: true,
                selectionName: true,
                point: true,
                decimalOdds: true,
                capturedAt: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      return {
        markets: [],
        available: true,
        message: "Event not found.",
      };
    }

    const markets = event.markets.map((market) => ({
      marketId: market.id,
      marketKey: market.key,
      marketName: market.name,
      summary: analyzeMarketMovement(
        market.oddsSnapshots.map((snapshot) => ({
          bookmakerKey: snapshot.bookmakerKey,
          selectionKey: snapshot.selectionKey,
          selectionName: snapshot.selectionName,
          point: snapshot.point === null ? null : Number(snapshot.point),
          decimalOdds: Number(snapshot.decimalOdds),
          capturedAt: snapshot.capturedAt,
        })),
        event.startTime,
      ),
    }));

    return {
      markets,
      available: true,
      message:
        markets.every((market) => market.summary.movements.length === 0)
          ? "Insufficient snapshot history for movement diagnostics."
          : null,
    };
  } catch (error) {
    return {
      markets: [],
      available: false,
      message:
        error instanceof Error && error.message.includes("DATABASE_URL")
          ? "Database connection is not configured in this environment."
          : "Odds movement diagnostics are currently unavailable.",
    };
  }
}
