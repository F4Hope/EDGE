import { getDb } from "@/lib/prisma";

export type UiPredictionEvidence = {
  marketAnchor: number | null;
  formAdjustment: number | null;
  headToHeadAdjustment: number | null;
  restAdjustment: number | null;
  totalAdjustment: number | null;
};

export type UiPrediction = {
  id: string;
  marketKey: string;
  selectionKey: string;
  selectionName: string;
  modelVersion: string;
  modelProbability: number;
  impliedProbability: number | null;
  estimatedEdge: number | null;
  estimatedValue: number | null;
  edgeScore: number | null;
  risk: "LOW" | "MEDIUM" | "HIGH";
  status: "BETTABLE" | "WATCH" | "HIGH_RISK" | "NO_BET";
  dataQuality: number | null;
  modelAgreement: number | null;
  bestDecimalOdds: number | null;
  marketProbability: number | null;
  bookmakerCount: number | null;
  validationState: string | null;
  bettableEnabled: boolean | null;
  evidence: UiPredictionEvidence;
  createdAt: string;
};

export type UiPredictionState = {
  predictions: UiPrediction[];
  available: boolean;
  message: string | null;
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
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function explanationSelectionName(value: unknown): string | null {
  return stringValue(record(value)?.selectionName);
}

function explanationDetails(value: unknown): {
  bestDecimalOdds: number | null;
  marketProbability: number | null;
  bookmakerCount: number | null;
  validationState: string | null;
  bettableEnabled: boolean | null;
  evidence: UiPredictionEvidence;
} {
  const explanation = record(value);
  const evidence = record(explanation?.evidence);

  return {
    bestDecimalOdds: numberValue(explanation?.bestDecimalOdds),
    marketProbability: numberValue(explanation?.marketProbability),
    bookmakerCount: numberValue(explanation?.bookmakerCount),
    validationState: stringValue(explanation?.validationState),
    bettableEnabled: booleanValue(explanation?.bettableEnabled),
    evidence: {
      marketAnchor: numberValue(evidence?.marketAnchor),
      formAdjustment: numberValue(evidence?.formAdjustment),
      headToHeadAdjustment: numberValue(evidence?.headToHeadAdjustment),
      restAdjustment: numberValue(evidence?.restAdjustment),
      totalAdjustment: numberValue(evidence?.totalAdjustment),
    },
  };
}

function statusRank(status: UiPrediction["status"]): number {
  if (status === "BETTABLE") return 4;
  if (status === "WATCH") return 3;
  if (status === "HIGH_RISK") return 2;
  return 1;
}

function riskRank(risk: UiPrediction["risk"]): number {
  if (risk === "LOW") return 3;
  if (risk === "MEDIUM") return 2;
  return 1;
}

function sortableMetric(value: number | null): number {
  return value === null ? Number.NEGATIVE_INFINITY : value;
}

export function comparePredictionPriority(
  a: UiPrediction,
  b: UiPrediction,
): number {
  return (
    statusRank(b.status) - statusRank(a.status) ||
    riskRank(b.risk) - riskRank(a.risk) ||
    sortableMetric(b.estimatedValue) - sortableMetric(a.estimatedValue) ||
    sortableMetric(b.modelAgreement) - sortableMetric(a.modelAgreement) ||
    sortableMetric(b.dataQuality) - sortableMetric(a.dataQuality) ||
    b.modelProbability - a.modelProbability ||
    a.selectionName.localeCompare(b.selectionName)
  );
}

export function pickPrimaryPrediction(
  predictions: UiPrediction[],
): UiPrediction | null {
  return predictions.length === 0
    ? null
    : [...predictions].sort(comparePredictionPriority)[0];
}

export async function getUiPredictionsForEvent(
  eventId: string,
): Promise<UiPredictionState> {
  try {
    const db = getDb();
    const rows = await db.prediction.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        market: { select: { id: true, key: true } },
        modelRun: { select: { modelVersion: true } },
      },
    });

    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = [row.market.id, row.selectionKey].join("|");
      if (!latest.has(key)) latest.set(key, row);
    }

    const predictions = [...latest.values()]
      .map((row) => {
        const details = explanationDetails(row.explanation);

        return {
          id: row.id,
          marketKey: row.market.key,
          selectionKey: row.selectionKey,
          selectionName:
            explanationSelectionName(row.explanation) ?? row.selectionKey,
          modelVersion: row.modelRun.modelVersion,
          modelProbability: Number(row.modelProbability),
          impliedProbability:
            row.impliedProbability === null
              ? null
              : Number(row.impliedProbability),
          estimatedEdge:
            row.estimatedEdge === null ? null : Number(row.estimatedEdge),
          estimatedValue:
            row.estimatedValue === null ? null : Number(row.estimatedValue),
          edgeScore: row.edgeScore,
          risk: row.risk,
          status: row.status,
          dataQuality:
            row.dataQuality === null ? null : Number(row.dataQuality),
          modelAgreement:
            row.modelAgreement === null ? null : Number(row.modelAgreement),
          bestDecimalOdds: details.bestDecimalOdds,
          marketProbability: details.marketProbability,
          bookmakerCount: details.bookmakerCount,
          validationState: details.validationState,
          bettableEnabled: details.bettableEnabled,
          evidence: details.evidence,
          createdAt: row.createdAt.toISOString(),
        };
      })
      .sort(comparePredictionPriority);

    return {
      predictions,
      available: true,
      message:
        predictions.length === 0
          ? "No Phase 7 prediction has been generated for this event yet."
          : null,
    };
  } catch (error) {
    return {
      predictions: [],
      available: false,
      message:
        error instanceof Error && error.message.includes("DATABASE_URL")
          ? "Database connection is not configured in this environment."
          : "Prediction data is currently unavailable.",
    };
  }
}

export async function getUiPredictionSummary(): Promise<{
  count: number;
  latestAt: string | null;
  futureEventCount: number;
  pricedEventCount: number;
  available: boolean;
}> {
  try {
    const db = getDb();
    const now = new Date();
    const to = new Date(now.getTime() + 168 * 60 * 60 * 1000);

    const [count, latest, futureEventCount, pricedEventCount] = await Promise.all([
      db.prediction.count(),
      db.prediction.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      db.event.count({
        where: {
          startTime: { gt: now, lte: to },
          status: { notIn: ["LIVE", "COMPLETED", "CANCELLED", "POSTPONED"] },
        },
      }),
      db.event.count({
        where: {
          startTime: { gt: now, lte: to },
          status: { notIn: ["LIVE", "COMPLETED", "CANCELLED", "POSTPONED"] },
          markets: {
            some: {
              status: "OPEN",
              oddsSnapshots: { some: {} },
            },
          },
        },
      }),
    ]);
    return {
      count,
      latestAt: latest?.createdAt.toISOString() ?? null,
      futureEventCount,
      pricedEventCount,
      available: true,
    };
  } catch {
    return {
      count: 0,
      latestAt: null,
      futureEventCount: 0,
      pricedEventCount: 0,
      available: false,
    };
  }
}
