import { getDb } from "@/lib/prisma";

export type UiOddsQuote = {
  bookmakerKey: string | null;
  bookmakerName: string | null;
  selectionKey: string;
  selectionName: string;
  point: number | null;
  decimalOdds: number;
  capturedAt: string;
  providerUpdatedAt: string | null;
};

export type UiOddsMarket = {
  id: string;
  key: string;
  name: string;
  provider: string;
  snapshotCount: number;
  quotes: UiOddsQuote[];
};

export type UiOddsState = {
  markets: UiOddsMarket[];
  available: boolean;
  message: string | null;
};

function quoteIdentity(snapshot: {
  bookmakerKey: string | null;
  selectionKey: string;
  point: unknown;
}): string {
  return [
    snapshot.bookmakerKey ?? "unknown-bookmaker",
    snapshot.selectionKey,
    snapshot.point === null || snapshot.point === undefined
      ? "na"
      : String(snapshot.point),
  ].join("|");
}

function displayGroupKey(quote: UiOddsQuote): string {
  return [
    quote.selectionKey,
    quote.point === null ? "na" : String(quote.point),
  ].join("|");
}

export async function getUiOddsForEvent(eventId: string): Promise<UiOddsState> {
  try {
    const db = getDb();
    const markets = await db.market.findMany({
      where: { eventId },
      orderBy: [{ key: "asc" }, { createdAt: "asc" }],
      include: {
        oddsSnapshots: {
          orderBy: { capturedAt: "desc" },
          take: 500,
        },
        _count: {
          select: { oddsSnapshots: true },
        },
      },
    });

    const result: UiOddsMarket[] = markets.map((market) => {
      const latest = new Map<string, (typeof market.oddsSnapshots)[number]>();

      for (const snapshot of market.oddsSnapshots) {
        const identity = quoteIdentity(snapshot);
        if (!latest.has(identity)) {
          latest.set(identity, snapshot);
        }
      }

      const allQuotes: UiOddsQuote[] = [...latest.values()].map((snapshot) => ({
        bookmakerKey: snapshot.bookmakerKey,
        bookmakerName: snapshot.bookmakerName,
        selectionKey: snapshot.selectionKey,
        selectionName: snapshot.selectionName,
        point: snapshot.point === null ? null : Number(snapshot.point),
        decimalOdds: Number(snapshot.decimalOdds),
        capturedAt: snapshot.capturedAt.toISOString(),
        providerUpdatedAt: snapshot.providerUpdatedAt?.toISOString() ?? null,
      }));

      const grouped = new Map<string, UiOddsQuote[]>();
      for (const quote of allQuotes) {
        const key = displayGroupKey(quote);
        const group = grouped.get(key) ?? [];
        group.push(quote);
        grouped.set(key, group);
      }

      const quotes = [...grouped.values()]
        .flatMap((group) =>
          group
            .sort((a, b) => b.decimalOdds - a.decimalOdds)
            .slice(0, 3),
        )
        .sort((a, b) => {
          const selectionOrder = a.selectionName.localeCompare(b.selectionName);
          if (selectionOrder !== 0) return selectionOrder;
          if (a.point !== b.point) return (a.point ?? 0) - (b.point ?? 0);
          return b.decimalOdds - a.decimalOdds;
        });

      return {
        id: market.id,
        key: market.key,
        name: market.name,
        provider: market.provider,
        snapshotCount: market._count.oddsSnapshots,
        quotes,
      };
    });

    return {
      markets: result,
      available: true,
      message:
        result.length === 0
          ? "No odds snapshots are stored for this event yet."
          : null,
    };
  } catch (error) {
    return {
      markets: [],
      available: false,
      message:
        error instanceof Error && error.message.includes("DATABASE_URL")
          ? "Database connection is not configured in this environment."
          : "The odds database is currently unavailable.",
    };
  }
}
