import { getDb } from "@/lib/prisma";
import type { ComboCandidate } from "@/lib/combo/engine";
import {
  independentEvidenceSupport,
  MIN_MODEL_MARKET_LIFT,
} from "@/lib/data/uiOpportunities";

export type ComboEvidenceSignal = {
  type: string;
  severity: string;
  source: string;
  headline: string;
  affectsHome: boolean | null;
  affectsAway: boolean | null;
  participant: string | null;
};

export type ComboEvidenceResearchCandidate = {
  predictionId: string;
  eventId: string;
  sport: string;
  league: string;
  startsAt: string;
  matchup: string;
  marketKey: string;
  point: number | null;
  selectionName: string;
  decimalOdds: number;
  modelProbability: number;
  marketProbability: number;
  estimatedValue: number;
  bookmakerName: string | null;
  oddsProvider: string;
  intelligenceSignals: ComboEvidenceSignal[];
};

export type ComboCandidateDiagnostics = {
  queriedPredictions: number;
  latestPredictions: number;
  duplicatesCollapsed: number;
  missingStoredOdds: number;
  nonPositiveEstimatedValue: number;
  belowEstimatedValueFloor: number;
  missingMarketProbability: number;
  missingIndependentEvidence: number;
  evidenceResearchCandidates: number;
  evidenceResearchWithActiveIntelligence: number;
  insufficientModelMarketLift: number;
  qualifiedCandidates: number;
};

export type ComboCandidatePool = {
  candidates: ComboCandidate[];
  evidenceResearchQueue: ComboEvidenceResearchCandidate[];
  diagnostics: ComboCandidateDiagnostics;
};

const MIN_COMBO_ESTIMATED_VALUE = -0.05;
export const COMBO_MIN_LEAD_MINUTES = 10;

const comboResearchSignalTypes = new Set([
  "INJURY",
  "SUSPENSION",
  "LINEUP",
  "WITHDRAWAL",
  "WEATHER",
  "NEWS",
]);

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

function selectionLabel(
  marketKey: string,
  selectionName: string,
  point: number | null,
  home: string,
  away: string,
): string {
  if (marketKey === "double_chance") {
    const normalized = selectionName.trim().toLowerCase();
    if (normalized === "home/draw" || normalized === "1x") {
      return `${home} or Draw`;
    }
    if (normalized === "home/away" || normalized === "12") {
      return `${home} or ${away}`;
    }
    if (normalized === "draw/away" || normalized === "x2") {
      return `Draw or ${away}`;
    }
  }

  if (point === null || !Number.isFinite(point)) return selectionName;
  if (selectionName.includes(String(point))) return selectionName;
  if (marketKey === "totals") return `${selectionName} ${point}`;
  if (marketKey === "spreads") {
    const signed = point > 0 ? `+${point}` : String(point);
    return `${selectionName} ${signed}`;
  }
  return selectionName;
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
  const playableFrom = new Date(
    now.getTime() + COMBO_MIN_LEAD_MINUTES * 60 * 1000,
  );
  const to = new Date(now.getTime() + Math.min(hours, 24 * 14) * 60 * 60 * 1000);

  const rows = await db.prediction.findMany({
    where: {
      event: {
        startTime: { gt: playableFrom, lte: to },
        status: { notIn: ["CANCELLED", "POSTPONED", "COMPLETED"] },
      },
      market: {
        key: { in: ["h2h", "totals", "spreads", "double_chance"] },
        status: "OPEN",
      },
      status: { in: ["BETTABLE", "WATCH"] },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: {
      event: {
        include: {
          sport: { select: { key: true } },
          league: { select: { name: true } },
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          homePlayer: { select: { fullName: true } },
          awayPlayer: { select: { fullName: true } },
          intelligenceSignals: {
            where: {
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            orderBy: { occurredAt: "desc" },
            take: 20,
            select: {
              type: true,
              severity: true,
              source: true,
              headline: true,
              affectsHome: true,
              affectsAway: true,
              participant: true,
            },
          },
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
    belowEstimatedValueFloor: 0,
    missingMarketProbability: 0,
    missingIndependentEvidence: 0,
    evidenceResearchCandidates: 0,
    evidenceResearchWithActiveIntelligence: 0,
    insufficientModelMarketLift: 0,
    qualifiedCandidates: 0,
  };

  const candidates: ComboCandidate[] = [];
  const evidenceResearchQueue: ComboEvidenceResearchCandidate[] = [];

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
    const point = numberValue(explanation?.point);
    const rawSelectionName =
      explanationSelectionName(row.explanation) ?? row.selectionKey;
    const homeName =
      row.event.homeTeam?.name ?? row.event.homePlayer?.fullName ?? "Home";
    const awayName =
      row.event.awayTeam?.name ?? row.event.awayPlayer?.fullName ?? "Away";
    const selectionName = selectionLabel(
      row.market.key,
      rawSelectionName,
      point,
      homeName,
      awayName,
    );
    const modelProbability = Number(row.modelProbability);
    const estimatedValue =
      row.estimatedValue === null ? null : Number(row.estimatedValue);
    const evidenceSupport = independentEvidenceSupport(row.explanation);

    if (estimatedValue === null) {
      diagnostics.belowEstimatedValueFloor += 1;
      continue;
    }

    if (estimatedValue <= 0) {
      diagnostics.nonPositiveEstimatedValue += 1;
    }

    if (estimatedValue < MIN_COMBO_ESTIMATED_VALUE) {
      diagnostics.belowEstimatedValueFloor += 1;
      continue;
    }

    if (marketProbability === null) {
      diagnostics.missingMarketProbability += 1;
      continue;
    }

    if (evidenceSupport <= 1e-9) {
      diagnostics.missingIndependentEvidence += 1;

      const intelligenceSignals = row.event.intelligenceSignals
        .filter((signal) => comboResearchSignalTypes.has(signal.type))
        .map((signal) => ({
          type: signal.type,
          severity: signal.severity,
          source: signal.source,
          headline: signal.headline,
          affectsHome: signal.affectsHome,
          affectsAway: signal.affectsAway,
          participant: signal.participant,
        }));

      evidenceResearchQueue.push({
        predictionId: row.id,
        eventId: row.eventId,
        sport: row.event.sport.key,
        league: row.event.league.name,
        startsAt: row.event.startTime.toISOString(),
        matchup: participantName(row.event),
        marketKey: row.market.key,
        point,
        selectionName,
        decimalOdds: Number(bestSnapshot.decimalOdds),
        modelProbability,
        marketProbability,
        estimatedValue,
        bookmakerName: bestSnapshot.bookmakerName,
        oddsProvider: bestSnapshot.provider,
        intelligenceSignals,
      });

      diagnostics.evidenceResearchCandidates += 1;
      if (intelligenceSignals.length > 0) {
        diagnostics.evidenceResearchWithActiveIntelligence += 1;
      }
    }

    const modelLift = Math.abs(modelProbability - marketProbability);
    if (modelLift + Number.EPSILON * 16 < MIN_MODEL_MARKET_LIFT) {
      diagnostics.insufficientModelMarketLift += 1;
    }

    candidates.push({
      predictionId: row.id,
      eventId: row.eventId,
      sport: row.event.sport.key,
      league: row.event.league.name,
      startsAt: row.event.startTime.toISOString(),
      matchup: participantName(row.event),
      marketKey: row.market.key,
      point,
      selectionKey: row.selectionKey,
      selectionName,
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

  evidenceResearchQueue.sort(
    (a, b) =>
      b.modelProbability - a.modelProbability ||
      b.intelligenceSignals.length - a.intelligenceSignals.length ||
      b.estimatedValue - a.estimatedValue ||
      a.startsAt.localeCompare(b.startsAt),
  );

  return { candidates, evidenceResearchQueue, diagnostics };
}

export async function getComboCandidates(
  hours = 168,
): Promise<ComboCandidate[]> {
  return (await getComboCandidatePool(hours)).candidates;
}
