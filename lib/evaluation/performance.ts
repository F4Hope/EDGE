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

export type ConfidenceInterval = {
  lower: number;
  upper: number;
};

export type EventMarketBenchmark = {
  count: number;
  modelBrierScore: number | null;
  marketBrierScore: number | null;
  brierDelta: number | null;
  brierSkillScore: number | null;
  brierDeltaCi95: ConfidenceInterval | null;
  modelTop1Accuracy: number | null;
  marketTop1Accuracy: number | null;
  accuracyDelta: number | null;
  positiveLiftSupported: boolean | null;
};

export type ModelPerformanceReport = {
  sampleCount: number;
  evaluation: BinaryEvaluation;
  marketBenchmark: MarketBenchmark;
  eventMarketBenchmark: EventMarketBenchmark;
  bySport: ModelPerformanceSegment[];
  byMarket: ModelPerformanceSegment[];
  byModelVersion: ModelPerformanceSegment[];
};

type EventBenchmarkRow = {
  modelBrier: number;
  marketBrier: number;
  modelCorrect: boolean;
  marketCorrect: boolean;
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

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeProbabilities(values: number[]): number[] | null {
  if (
    values.length < 2 ||
    values.some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1,
    )
  ) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return null;

  return values.map((value) => value / total);
}

function multiclassBrier(
  probabilities: number[],
  outcomes: Array<0 | 1>,
): number | null {
  if (
    probabilities.length < 2 ||
    probabilities.length !== outcomes.length
  ) {
    return null;
  }

  return (
    probabilities.reduce(
      (sum, probability, index) =>
        sum + (probability - outcomes[index]) ** 2,
      0,
    ) / probabilities.length
  );
}

function argMax(values: number[]): number {
  let bestIndex = 0;

  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[bestIndex]) {
      bestIndex = index;
    }
  }

  return bestIndex;
}

function confidenceInterval95(values: number[]): ConfidenceInterval | null {
  if (values.length < 2) return null;

  const average = mean(values);
  if (average === null) return null;

  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
  const standardError = Math.sqrt(variance / values.length);
  const margin = 1.96 * standardError;

  return {
    lower: Number((average - margin).toFixed(6)),
    upper: Number((average + margin).toFixed(6)),
  };
}

function evaluateEventBenchmark(
  rows: EventBenchmarkRow[],
): EventMarketBenchmark {
  if (rows.length === 0) {
    return {
      count: 0,
      modelBrierScore: null,
      marketBrierScore: null,
      brierDelta: null,
      brierSkillScore: null,
      brierDeltaCi95: null,
      modelTop1Accuracy: null,
      marketTop1Accuracy: null,
      accuracyDelta: null,
      positiveLiftSupported: null,
    };
  }

  const modelBrierScore = mean(rows.map((row) => row.modelBrier));
  const marketBrierScore = mean(rows.map((row) => row.marketBrier));
  const deltas = rows.map((row) => row.marketBrier - row.modelBrier);
  const brierDelta = mean(deltas);
  const ci = confidenceInterval95(deltas);
  const modelTop1Accuracy =
    rows.filter((row) => row.modelCorrect).length / rows.length;
  const marketTop1Accuracy =
    rows.filter((row) => row.marketCorrect).length / rows.length;

  return {
    count: rows.length,
    modelBrierScore:
      modelBrierScore === null ? null : Number(modelBrierScore.toFixed(6)),
    marketBrierScore:
      marketBrierScore === null ? null : Number(marketBrierScore.toFixed(6)),
    brierDelta:
      brierDelta === null ? null : Number(brierDelta.toFixed(6)),
    brierSkillScore: skillScore(modelBrierScore, marketBrierScore),
    brierDeltaCi95: ci,
    modelTop1Accuracy: Number(modelTop1Accuracy.toFixed(6)),
    marketTop1Accuracy: Number(marketTop1Accuracy.toFixed(6)),
    accuracyDelta: Number(
      (modelTop1Accuracy - marketTop1Accuracy).toFixed(6),
    ),
    positiveLiftSupported: ci === null ? null : ci.lower > 0,
  };
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
  const eventBenchmarkRows: EventBenchmarkRow[] = [];
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

    const groups = new Map<
      string,
      Array<(typeof result.event.predictions)[number]>
    >();

    for (const prediction of latest.values()) {
      if (prediction.market.key !== "h2h") continue;

      const key = [
        prediction.market.id,
        prediction.modelRun.modelVersion,
      ].join("|");
      const group = groups.get(key) ?? [];
      group.push(prediction);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      const outcomes: Array<0 | 1> = [];
      const modelRaw: number[] = [];
      const marketRaw: number[] = [];
      let valid = true;

      for (const prediction of group) {
        const outcome = resolveSelectionOutcome(
          result.payload,
          {
            selectionKey: prediction.selectionKey,
            explanation: prediction.explanation,
          },
          participants,
        );
        const modelProbability = Number(prediction.modelProbability);
        const baselineProbability = marketProbability(prediction.explanation);

        if (
          outcome === null ||
          baselineProbability === null ||
          !Number.isFinite(modelProbability) ||
          modelProbability < 0 ||
          modelProbability > 1
        ) {
          valid = false;
          break;
        }

        outcomes.push(outcome);
        modelRaw.push(modelProbability);
        marketRaw.push(baselineProbability);
      }

      if (!valid || outcomes.length < 2) continue;
      if (outcomes.filter((outcome) => outcome === 1).length !== 1) continue;

      const model = normalizeProbabilities(modelRaw);
      const market = normalizeProbabilities(marketRaw);
      if (!model || !market) continue;

      const modelBrier = multiclassBrier(model, outcomes);
      const marketBrier = multiclassBrier(market, outcomes);
      if (modelBrier === null || marketBrier === null) continue;

      const winnerIndex = outcomes.indexOf(1);

      eventBenchmarkRows.push({
        modelBrier,
        marketBrier,
        modelCorrect: argMax(model) === winnerIndex,
        marketCorrect: argMax(market) === winnerIndex,
      });
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
    eventMarketBenchmark: evaluateEventBenchmark(eventBenchmarkRows),
    bySport: segment(sports),
    byMarket: segment(markets),
    byModelVersion: segment(versions),
  };
}
