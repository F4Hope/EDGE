import type { getDb } from "@/lib/prisma";
import {
  evaluateBinaryProbabilities,
  type BinaryEvaluation,
  type BinaryEvaluationRow,
} from "./metrics";

type EdgeDb = ReturnType<typeof getDb>;

export type ModelPerformanceSegment = {
  key: string;
  count: number;
  evaluation: BinaryEvaluation;
};

export type ModelPerformanceReport = {
  sampleCount: number;
  evaluation: BinaryEvaluation;
  bySport: ModelPerformanceSegment[];
  byMarket: ModelPerformanceSegment[];
  byModelVersion: ModelPerformanceSegment[];
};

function selectionOutcome(
  payload: unknown,
  selectionKey: string,
): 0 | 1 | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const outcomes = record.selectionOutcomes;

  if (!outcomes || typeof outcomes !== "object") return null;
  const value = (outcomes as Record<string, unknown>)[selectionKey];

  if (value === true || value === 1 || value === "win") return 1;
  if (value === false || value === 0 || value === "loss") return 0;
  return null;
}

function segment(
  rows: Array<{ key: string; row: BinaryEvaluationRow }>,
): ModelPerformanceSegment[] {
  const groups = new Map<string, BinaryEvaluationRow[]>();

  for (const item of rows) {
    const values = groups.get(item.key) ?? [];
    values.push(item.row);
    groups.set(item.key, values);
  }

  return [...groups.entries()]
    .map(([key, values]) => ({
      key,
      count: values.length,
      evaluation: evaluateBinaryProbabilities(values),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export async function calculateModelPerformance(
  db: EdgeDb,
): Promise<ModelPerformanceReport> {
  const results = await db.result.findMany({
    where: { status: "FINAL" },
    include: {
      event: {
        include: {
          sport: { select: { key: true } },
          predictions: {
            include: {
              market: { select: { key: true } },
              modelRun: { select: { modelVersion: true } },
            },
          },
        },
      },
    },
  });

  const rows: BinaryEvaluationRow[] = [];
  const sports: Array<{ key: string; row: BinaryEvaluationRow }> = [];
  const markets: Array<{ key: string; row: BinaryEvaluationRow }> = [];
  const versions: Array<{ key: string; row: BinaryEvaluationRow }> = [];

  for (const result of results) {
    for (const prediction of result.event.predictions) {
      const outcome = selectionOutcome(
        result.payload,
        prediction.selectionKey,
      );
      if (outcome === null) continue;

      const row = {
        probability: Number(prediction.modelProbability),
        outcome,
      } satisfies BinaryEvaluationRow;

      rows.push(row);
      sports.push({ key: result.event.sport.key, row });
      markets.push({ key: prediction.market.key, row });
      versions.push({ key: prediction.modelRun.modelVersion, row });
    }
  }

  return {
    sampleCount: rows.length,
    evaluation: evaluateBinaryProbabilities(rows),
    bySport: segment(sports),
    byMarket: segment(markets),
    byModelVersion: segment(versions),
  };
}
