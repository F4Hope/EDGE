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

export type MarketBenchmark = {
  count: number;
  model: BinaryEvaluation;
  market: BinaryEvaluation;
  brierDelta: number | null;
  brierSkillScore: number | null;
  calibrationDelta: number | null;
};

export type ModelPerformanceReport = {
  sampleCount: number;
  evaluation: BinaryEvaluation;
  marketBenchmark: MarketBenchmark;
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

function marketProbability(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const probability = (value as Record<string, unknown>).marketProbability;
  return typeof probability === "number" &&
    Number.isFinite(probability) &&
    probability >= 0 &&
    probability <= 1
    ? probability
    : null;
}

function difference(
  marketValue: number | null,
  modelValue: number | null,
): number | null {
  return marketValue === null || modelValue === null
    ? null
    : Number((marketValue - modelValue).toFixed(6));
}

function skillScore(
  modelBrier: number | null,
  marketBrier: number | null,
): number | null {
  if (
    modelBrier === null ||
    marketBrier === null ||
    !Number.isFinite(marketBrier) ||
    marketBrier <= 0
  ) {
    return null;
  }

  return Number((1 - modelBrier / marketBrier).toFixed(6));
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
  const pairedModelRows: BinaryEvaluationRow[] = [];
  const pairedMarketRows: BinaryEvaluationRow[] = [];
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

      const baselineProbability = marketProbability(prediction.explanation);
      if (baselineProbability !== null) {
        pairedModelRows.push(row);
        pairedMarketRows.push({
          probability: baselineProbability,
          outcome,
        });
      }
    }
  }

  const evaluation = evaluateBinaryProbabilities(rows);
  const pairedModel = evaluateBinaryProbabilities(pairedModelRows);
  const pairedMarket = evaluateBinaryProbabilities(pairedMarketRows);

  return {
    sampleCount: rows.length,
    evaluation,
    marketBenchmark: {
      count: pairedModelRows.length,
      model: pairedModel,
      market: pairedMarket,
      brierDelta: difference(
        pairedMarket.brierScore,
        pairedModel.brierScore,
      ),
      brierSkillScore: skillScore(
        pairedModel.brierScore,
        pairedMarket.brierScore,
      ),
      calibrationDelta: difference(
        pairedMarket.calibrationError,
        pairedModel.calibrationError,
      ),
    },
    bySport: segment(sports),
    byMarket: segment(markets),
    byModelVersion: segment(versions),
  };
}
