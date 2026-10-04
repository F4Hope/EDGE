export type BinaryEvaluationRow = {
  probability: number;
  outcome: 0 | 1;
};

export type CalibrationBucket = {
  lower: number;
  upper: number;
  count: number;
  meanProbability: number;
  observedRate: number;
};

export type BinaryEvaluation = {
  count: number;
  accuracyAtHalf: number | null;
  brierScore: number | null;
  calibrationError: number | null;
  buckets: CalibrationBucket[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function evaluateBinaryProbabilities(
  rows: BinaryEvaluationRow[],
  bucketCount = 10,
): BinaryEvaluation {
  const clean = rows.filter(
    (row) =>
      Number.isFinite(row.probability) &&
      row.probability >= 0 &&
      row.probability <= 1 &&
      (row.outcome === 0 || row.outcome === 1),
  );

  if (clean.length === 0) {
    return {
      count: 0,
      accuracyAtHalf: null,
      brierScore: null,
      calibrationError: null,
      buckets: [],
    };
  }

  const accuracyAtHalf =
    clean.filter(
      (row) =>
        (row.probability >= 0.5 && row.outcome === 1) ||
        (row.probability < 0.5 && row.outcome === 0),
    ).length / clean.length;

  const brierScore =
    clean.reduce(
      (sum, row) => sum + (row.probability - row.outcome) ** 2,
      0,
    ) / clean.length;

  const count = Math.max(2, Math.min(20, Math.trunc(bucketCount)));
  const width = 1 / count;
  const buckets: CalibrationBucket[] = [];

  for (let index = 0; index < count; index += 1) {
    const lower = index * width;
    const upper = index === count - 1 ? 1 : (index + 1) * width;
    const members = clean.filter((row) =>
      index === count - 1
        ? row.probability >= lower && row.probability <= upper
        : row.probability >= lower && row.probability < upper,
    );
    if (members.length === 0) continue;

    const meanProbability =
      members.reduce((sum, row) => sum + row.probability, 0) /
      members.length;
    const observedRate =
      members.reduce((sum, row) => sum + row.outcome, 0) /
      members.length;

    buckets.push({
      lower: Number(lower.toFixed(4)),
      upper: Number(upper.toFixed(4)),
      count: members.length,
      meanProbability: Number(meanProbability.toFixed(6)),
      observedRate: Number(observedRate.toFixed(6)),
    });
  }

  const calibrationError = buckets.reduce(
    (sum, bucket) =>
      sum +
      (bucket.count / clean.length) *
        Math.abs(bucket.meanProbability - bucket.observedRate),
    0,
  );

  return {
    count: clean.length,
    accuracyAtHalf: Number(clamp01(accuracyAtHalf).toFixed(6)),
    brierScore: Number(brierScore.toFixed(6)),
    calibrationError: Number(calibrationError.toFixed(6)),
    buckets,
  };
}
