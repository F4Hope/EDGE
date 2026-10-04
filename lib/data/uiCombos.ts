import { getDb } from "@/lib/prisma";
import type { ComboCandidate } from "@/lib/combo/engine";

function explanationSelectionName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const name = (value as Record<string, unknown>).selectionName;
  return typeof name === "string" ? name : null;
}

function participantName(event: {
  homeTeam: { name: string } | null;
  awayTeam: { name: string } | null;
  homePlayer: { fullName: string } | null;
  awayPlayer: { fullName: string } | null;
}): string {
  const home = event.homeTeam?.name ?? event.homePlayer?.fullName ?? "Home";
  const away = event.awayTeam?.name ?? event.awayPlayer?.fullName ?? "Away";
  return `${home} vs ${away}`;
}

export async function getComboCandidates(
  hours = 168,
): Promise<ComboCandidate[]> {
  const db = getDb();
  const now = new Date();
  const to = new Date(now.getTime() + Math.min(hours, 24 * 14) * 60 * 60 * 1000);

  const rows = await db.prediction.findMany({
    where: {
      event: {
        startTime: { gt: now, lte: to },
        status: { notIn: ["CANCELLED", "POSTPONED", "COMPLETED"] },
      },
      market: {
        key: "h2h",
        status: "OPEN",
      },
      status: { in: ["BETTABLE", "WATCH"] },
    },
    orderBy: { createdAt: "desc" },
    take: 250,
    include: {
      event: {
        include: {
          sport: { select: { key: true } },
          league: { select: { name: true } },
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          homePlayer: { select: { fullName: true } },
          awayPlayer: { select: { fullName: true } },
        },
      },
      market: {
        include: {
          oddsSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 80,
            select: {
              bookmakerKey: true,
              selectionKey: true,
              decimalOdds: true,
              capturedAt: true,
            },
          },
        },
      },
    },
  });

  const latestPrediction = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = [row.eventId, row.marketId, row.selectionKey].join("|");
    if (!latestPrediction.has(key)) latestPrediction.set(key, row);
  }

  const candidates: ComboCandidate[] = [];

  for (const row of latestPrediction.values()) {
    const latestByBookmaker = new Map<
      string,
      (typeof row.market.oddsSnapshots)[number]
    >();

    for (const snapshot of row.market.oddsSnapshots) {
      if (snapshot.selectionKey !== row.selectionKey) continue;
      if (snapshot.capturedAt >= row.event.startTime) continue;

      const bookmaker = snapshot.bookmakerKey ?? "unknown";
      if (!latestByBookmaker.has(bookmaker)) {
        latestByBookmaker.set(bookmaker, snapshot);
      }
    }

    const bestOdds = [...latestByBookmaker.values()]
      .map((snapshot) => Number(snapshot.decimalOdds))
      .filter((value) => Number.isFinite(value) && value > 1)
      .sort((a, b) => b - a)[0];

    if (!bestOdds) continue;

    candidates.push({
      predictionId: row.id,
      eventId: row.eventId,
      sport: row.event.sport.key,
      league: row.event.league.name,
      startsAt: row.event.startTime.toISOString(),
      matchup: participantName(row.event),
      selectionKey: row.selectionKey,
      selectionName:
        explanationSelectionName(row.explanation) ?? row.selectionKey,
      decimalOdds: bestOdds,
      modelProbability: Number(row.modelProbability),
      estimatedValue:
        row.estimatedValue === null ? null : Number(row.estimatedValue),
      dataQuality:
        row.dataQuality === null ? null : Number(row.dataQuality),
      modelAgreement:
        row.modelAgreement === null ? null : Number(row.modelAgreement),
      risk: row.risk,
      status: row.status,
    });
  }

  return candidates;
}
