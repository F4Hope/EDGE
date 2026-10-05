import { getDb } from "@/lib/prisma";
import {
  supportedSports,
  type SupportedSport,
} from "@/lib/providers/types";

export type UiOpportunity = {
  predictionId: string;
  eventId: string;
  sport: SupportedSport;
  league: string;
  country: string | null;
  home: string | null;
  away: string | null;
  startsAt: string;
  selectionName: string;
  modelVersion: string;
  modelProbability: number;
  marketProbability: number | null;
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
  const hours = Math.min(24 * 14, Math.max(1, options?.hours ?? 72));
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
          key: "h2h",
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
        market: { select: { id: true } },
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
      const estimatedValue =
        row.estimatedValue === null ? null : Number(row.estimatedValue);
      const dataQuality =
        row.dataQuality === null ? null : Number(row.dataQuality);
      const modelAgreement =
        row.modelAgreement === null ? null : Number(row.modelAgreement);

      if (
        bestDecimalOdds === null ||
        bestDecimalOdds <= 1 ||
        estimatedValue === null ||
        estimatedValue <= 0 ||
        dataQuality === null ||
        dataQuality < 0.5 ||
        modelAgreement === null ||
        modelAgreement < 0.6 ||
        (row.risk !== "LOW" && row.risk !== "MEDIUM") ||
        (row.status !== "WATCH" && row.status !== "BETTABLE")
      ) {
        continue;
      }

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
        selectionName,
        modelVersion: row.modelRun.modelVersion,
        modelProbability: Number(row.modelProbability),
        marketProbability,
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
          ? "No future model outputs currently pass the opportunity gates."
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
