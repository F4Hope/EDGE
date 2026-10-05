import type { getDb } from "@/lib/prisma";
import { resolveSelectionOutcome } from "@/lib/results/selectionOutcomes";
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
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          homePlayer: { select: { fullName: true } },
          awayPlayer: { select: { fullName: true } },
          predictions: {
            include: {
              market: { select: { id: true, key: true } },
              modelRun: {
                select: {
                  modelVersion: true,
                  status: true,
                },
              },
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
    const participants = {
      home:
        result.event.homeTeam?.name ??
        result.event.homePlayer?.fullName ??
        null,
      away:
        result.event.awayTeam?.name ??
        result.event.awayPlayer?.fullName ??
        null,
    };

    const latest = new Map<
      string,
      (typeof result.event.predictions)[number]
    >();

    for (const prediction of result.event.predictions) {
      if (prediction.modelRun.status !== "COMPLETED") continue;
      if (prediction.createdAt >= result.event.startTime) continue;

      const key = [
        prediction.market.id,
        prediction.selectionKey,
        prediction.modelRun.modelVersion,
      ].join("|");
      const existing = latest.get(key);

      if (!existing || prediction.createdAt > existing.createdAt) {
        latest.set(key, prediction);
      }
    }

    for (const prediction of latest.values()) {
      const outcome = resolveSelectionOutcome(
        result.payload,
        {
          selectionKey: prediction.selectionKey,
          explanation: prediction.explanation,
        },
        participants,
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
