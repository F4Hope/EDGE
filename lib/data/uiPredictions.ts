import { getDb } from "@/lib/prisma";

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
  createdAt: string;
};

export type UiPredictionState = {
  predictions: UiPrediction[];
  available: boolean;
  message: string | null;
};

function explanationSelectionName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const name = (value as Record<string, unknown>).selectionName;
  return typeof name === "string" ? name : null;
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
      .map((row) => ({
        id: row.id,
        marketKey: row.market.key,
        selectionKey: row.selectionKey,
        selectionName:
          explanationSelectionName(row.explanation) ?? row.selectionKey,
        modelVersion: row.modelRun.modelVersion,
        modelProbability: Number(row.modelProbability),
        impliedProbability:
          row.impliedProbability === null ? null : Number(row.impliedProbability),
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
        createdAt: row.createdAt.toISOString(),
      }))
      .sort(
        (a, b) =>
          b.modelProbability - a.modelProbability ||
          a.selectionName.localeCompare(b.selectionName),
      );

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
  available: boolean;
}> {
  try {
    const db = getDb();
    const [count, latest] = await Promise.all([
      db.prediction.count(),
      db.prediction.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);
    return {
      count,
      latestAt: latest?.createdAt.toISOString() ?? null,
      available: true,
    };
  } catch {
    return { count: 0, latestAt: null, available: false };
  }
}
