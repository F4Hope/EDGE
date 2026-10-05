import { getDb } from "@/lib/prisma";
import type { ComboCandidate } from "@/lib/combo/engine";
import {
  independentEvidenceSupport,
  MIN_MODEL_MARKET_LIFT,
} from "@/lib/data/uiOpportunities";

export type ComboCandidateDiagnostics = {
  queriedPredictions: number;
  latestPredictions: number;
  duplicatesCollapsed: number;
  missingStoredOdds: number;
  nonPositiveEstimatedValue: number;
  missingMarketProbability: number;
  missingIndependentEvidence: number;
  insufficientModelMarketLift: number;
  qualifiedCandidates: number;
};

export type ComboCandidatePool = {
  candidates: ComboCandidate[];
  diagnostics: ComboCandidateDiagnostics;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function explanationSelectionName(value: unknown): string | null {
  const name = record(value)?.selectionName;
  return typeof name === "string" ? name : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

export async function getComboCandidatePool(
  hours = 168,
): Promise<ComboCandidatePool> {
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
              provider: true,
              bookmakerKey: true,
              bookmakerName: true,
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

  const diagnostics: ComboCandidateDiagnostics = {
    queriedPredictions: rows.length,
    latestPredictions: latestPrediction.size,
    duplicatesCollapsed: rows.length - latestPrediction.size,
    missingStoredOdds: 0,
    nonPositiveEstimatedValue: 0,
    missingMarketProbability: 0,
    missingIndependentEvidence: 0,
    insufficientModelMarketLift: 0,
    qualifiedCandidates: 0,
  };

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

    const bestSnapshot = [...latestByBookmaker.values()]
      .filter((snapshot) => {
        const value = Number(snapshot.decimalOdds);
        return Number.isFinite(value) && value > 1;
      })
      .sort((a, b) => Number(b.decimalOdds) - Number(a.decimalOdds))[0];

    if (!bestSnapshot) {
      diagnostics.missingStoredOdds += 1;
      continue;
    }

    const explanation = record(row.explanation);
    const marketProbability = numberValue(explanation?.marketProbability);
    const modelProbability = Number(row.modelProbability);
    const estimatedValue =
      row.estimatedValue === null ? null : Number(row.estimatedValue);
    const evidenceSupport = independentEvidenceSupport(row.explanation);

    if (estimatedValue === null || estimatedValue <= 0) {
      diagnostics.nonPositiveEstimatedValue += 1;
      continue;
    }

    if (marketProbability === null) {
      diagnostics.missingMarketProbability += 1;
      continue;
    }

    if (evidenceSupport <= 1e-9) {
      diagnostics.missingIndependentEvidence += 1;
      continue;
    }

    const modelLift = Math.abs(modelProbability - marketProbability);
    if (modelLift + Number.EPSILON * 16 < MIN_MODEL_MARKET_LIFT) {
      diagnostics.insufficientModelMarketLift += 1;
      continue;
    }

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
      decimalOdds: Number(bestSnapshot.decimalOdds),
      modelProbability,
      estimatedValue,
      dataQuality:
        row.dataQuality === null ? null : Number(row.dataQuality),
      modelAgreement:
        row.modelAgreement === null ? null : Number(row.modelAgreement),
      risk: row.risk,
      status: row.status,
      bookmakerName: bestSnapshot.bookmakerName,
      oddsProvider: bestSnapshot.provider,
      marketProbability,
      modelLift: modelProbability - marketProbability,
      evidenceSupport,
    });
  }

  diagnostics.qualifiedCandidates = candidates.length;

  return { candidates, diagnostics };
}

export async function getComboCandidates(
  hours = 168,
): Promise<ComboCandidate[]> {
  return (await getComboCandidatePool(hours)).candidates;
}
