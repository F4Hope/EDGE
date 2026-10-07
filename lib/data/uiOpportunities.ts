import { getDb } from "@/lib/prisma";
import {
  supportedSports,
  type SupportedSport,
} from "@/lib/providers/types";

export const MIN_MODEL_MARKET_LIFT = 0.0025;
export const OPPORTUNITY_MARKETS = [
  "h2h",
  "totals",
  "spreads",
  "double_chance",
] as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function calculateOpportunityScore(input: {
  dataQuality: number;
  modelAgreement: number;
  modelLift: number;
  estimatedValue: number;
  evidenceSupport: number;
}): number {
  const quality = clamp01(input.dataQuality);
  const agreement = clamp01(input.modelAgreement);
  const lift = clamp01(Math.abs(input.modelLift) / 0.08);
  const value = clamp01(Math.max(0, input.estimatedValue) / 0.15);
  const evidence = clamp01(input.evidenceSupport / 0.15);

  return Math.round(
    quality * 30 +
      agreement * 20 +
      lift * 20 +
      value * 20 +
      evidence * 10,
  );
}

export type UiOpportunity = {
  predictionId: string;
  eventId: string;
  sport: SupportedSport;
  league: string;
  country: string | null;
  home: string | null;
  away: string | null;
  startsAt: string;
  marketKey: string;
  point: number | null;
  selectionName: string;
  modelVersion: string;
  modelProbability: number;
  marketProbability: number;
  modelLift: number;
  evidenceSupport: number;
  edgeScore: number;
  bestDecimalOdds: number;
  estimatedEdge: number | null;
  estimatedValue: number;
  risk: "LOW" | "MEDIUM";
  status: "BETTABLE" | "WATCH";
  dataQuality: number;
  modelAgreement: number;
  bookmakerCount: number | null;
  validationState: string | null;
  bettableEnabled: boolean | null;
  createdAt: string;
};

export type UiOpportunityState = {
  opportunities: UiOpportunity[];
  available: boolean;
  message: string | null;
  qualifiedPredictions: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function absolute(value: number | null): number {
  return value === null ? 0 : Math.abs(value);
}

export function independentEvidenceSupport(explanation: unknown): number {
  const evidence = record(record(explanation)?.evidence);
  if (!evidence) return 0;

  return (
    absolute(numberValue(evidence.formAdjustment)) +
    absolute(numberValue(evidence.headToHeadAdjustment)) +
    absolute(numberValue(evidence.restAdjustment)) +
    absolute(numberValue(evidence.scoringAdjustment))
  );
}

export function passesIndependentEvidenceGate(input: {
  modelProbability: number;
  marketProbability: number | null;
  evidenceSupport: number;
}): boolean {
  if (
    input.marketProbability === null ||
    !Number.isFinite(input.modelProbability) ||
    !Number.isFinite(input.marketProbability)
  ) {
    return false;
  }

  if (input.evidenceSupport <= 1e-9) return false;

  const lift = Math.abs(
    input.modelProbability - input.marketProbability,
  );

  return lift + Number.EPSILON * 16 >= MIN_MODEL_MARKET_LIFT;
}

function statusRank(status: UiOpportunity["status"]): number {
  return status === "BETTABLE" ? 2 : 1;
}

function riskRank(risk: UiOpportunity["risk"]): number {
  return risk === "LOW" ? 2 : 1;
}

export function compareOpportunityPriority(
  a: UiOpportunity,
  b: UiOpportunity,
): number {
  return (
    statusRank(b.status) - statusRank(a.status) ||
    riskRank(b.risk) - riskRank(a.risk) ||
    b.edgeScore - a.edgeScore ||
    Math.abs(b.modelLift) - Math.abs(a.modelLift) ||
    b.estimatedValue - a.estimatedValue ||
    b.modelAgreement - a.modelAgreement ||
    b.dataQuality - a.dataQuality ||
    b.modelProbability - a.modelProbability ||
    a.startsAt.localeCompare(b.startsAt) ||
    a.selectionName.localeCompare(b.selectionName)
  );
}

export function rankOneOpportunityPerEvent(
  candidates: UiOpportunity[],
  limit = 20,
): UiOpportunity[] {
  const ranked = [...candidates].sort(compareOpportunityPriority);
  const eventIds = new Set<string>();
  const result: UiOpportunity[] = [];

  for (const candidate of ranked) {
    if (eventIds.has(candidate.eventId)) continue;
    eventIds.add(candidate.eventId);
    result.push(candidate);
    if (result.length >= limit) break;
  }

  return result;
}

export async function getUiOpportunities(options?: {
  sport?: SupportedSport;
  hours?: number;
  limit?: number;
}): Promise<UiOpportunityState> {
  const now = new Date();
  const hours = Math.min(24 * 14, Math.max(1, options?.hours ?? 168));
  const limit = Math.min(50, Math.max(1, options?.limit ?? 20));
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000);

  try {
    const db = getDb();
    const rows = await db.prediction.findMany({
      where: {
        status: { in: ["BETTABLE", "WATCH"] },
        risk: { in: ["LOW", "MEDIUM"] },
        estimatedValue: { gt: 0 },
        dataQuality: { gte: 0.5 },
        modelAgreement: { gte: 0.6 },
        event: {
          startTime: { gt: now, lte: to },
          status: { notIn: ["LIVE", "COMPLETED", "CANCELLED", "POSTPONED"] },
          ...(options?.sport ? { sport: { key: options.sport } } : {}),
        },
        market: {
          key: { in: [...OPPORTUNITY_MARKETS] },
          status: "OPEN",
        },
        modelRun: {
          status: "COMPLETED",
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: {
        event: {
          select: {
            id: true,
            startTime: true,
            sport: { select: { key: true } },
            league: { select: { name: true, country: true } },
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
            homePlayer: { select: { fullName: true } },
            awayPlayer: { select: { fullName: true } },
          },
        },
        market: { select: { id: true, key: true } },
        modelRun: { select: { modelVersion: true } },
      },
    });

    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = [row.eventId, row.market.id, row.selectionKey].join("|");
      if (!latest.has(key)) latest.set(key, row);
    }

    const candidates: UiOpportunity[] = [];

    for (const row of latest.values()) {
      if (!supportedSports.includes(row.event.sport.key as SupportedSport)) {
        continue;
      }

      const explanation = record(row.explanation);
      const selectionName =
        stringValue(explanation?.selectionName) ?? row.selectionKey;
      const bestDecimalOdds = numberValue(explanation?.bestDecimalOdds);
      const marketProbability = numberValue(explanation?.marketProbability);
      const bookmakerCount = numberValue(explanation?.bookmakerCount);
      const point = numberValue(explanation?.point);
      const modelProbability = Number(row.modelProbability);
      const estimatedValue =
        row.estimatedValue === null ? null : Number(row.estimatedValue);
      const dataQuality =
        row.dataQuality === null ? null : Number(row.dataQuality);
      const modelAgreement =
        row.modelAgreement === null ? null : Number(row.modelAgreement);
      const evidenceSupport = independentEvidenceSupport(row.explanation);

      if (
        bestDecimalOdds === null ||
        bestDecimalOdds <= 1 ||
        estimatedValue === null ||
        estimatedValue <= 0 ||
        dataQuality === null ||
        dataQuality < 0.5 ||
        modelAgreement === null ||
        modelAgreement < 0.6 ||
        !passesIndependentEvidenceGate({
          modelProbability,
          marketProbability,
          evidenceSupport,
        }) ||
        (row.risk !== "LOW" && row.risk !== "MEDIUM") ||
        (row.status !== "WATCH" && row.status !== "BETTABLE")
      ) {
        continue;
      }

      const modelLift = modelProbability - marketProbability!;
      const edgeScore = calculateOpportunityScore({
        dataQuality,
        modelAgreement,
        modelLift,
        estimatedValue,
        evidenceSupport,
      });

      candidates.push({
        predictionId: row.id,
        eventId: row.event.id,
        sport: row.event.sport.key as SupportedSport,
        league: row.event.league.name,
        country: row.event.league.country,
        home:
          row.event.homeTeam?.name ?? row.event.homePlayer?.fullName ?? null,
        away:
          row.event.awayTeam?.name ?? row.event.awayPlayer?.fullName ?? null,
        startsAt: row.event.startTime.toISOString(),
        marketKey: row.market.key,
        point,
        selectionName,
        modelVersion: row.modelRun.modelVersion,
        modelProbability,
        marketProbability: marketProbability!,
        modelLift,
        evidenceSupport,
        edgeScore,
        bestDecimalOdds,
        estimatedEdge:
          row.estimatedEdge === null ? null : Number(row.estimatedEdge),
        estimatedValue,
        risk: row.risk,
        status: row.status,
        dataQuality,
        modelAgreement,
        bookmakerCount,
        validationState: stringValue(explanation?.validationState),
        bettableEnabled: booleanValue(explanation?.bettableEnabled),
        createdAt: row.createdAt.toISOString(),
      });
    }

    const opportunities = rankOneOpportunityPerEvent(candidates, limit);

    return {
      opportunities,
      available: true,
      message:
        opportunities.length === 0
          ? "No future priced model output currently combines independent historical evidence with sufficient model-market separation and the remaining opportunity gates."
          : null,
      qualifiedPredictions: candidates.length,
    };
  } catch (error) {
    return {
      opportunities: [],
      available: false,
      message:
        error instanceof Error && error.message.includes("DATABASE_URL")
          ? "Database connection is not configured in this environment."
          : "Opportunity data is currently unavailable.",
      qualifiedPredictions: 0,
    };
  }
}
