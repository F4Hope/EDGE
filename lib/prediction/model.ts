import type {
  FeatureVector,
  MarketCoverageFeatures,
  MarketSelectionFeatures,
} from "@/lib/features/types";

export const PREDICTION_MODEL_VERSION = "market-evidence-v1";

export type PredictionRisk = "LOW" | "MEDIUM" | "HIGH";
export type PredictionStatus = "WATCH" | "NO_BET";

export type PredictionEvidence = {
  marketAnchor: number;
  formAdjustment: number;
  headToHeadAdjustment: number;
  restAdjustment: number;
  totalAdjustment: number;
  dataQuality: number;
};

export type PredictionCandidate = {
  selectionName: string;
  point: number | null;
  bookmakerCount: number;
  bestDecimalOdds: number;
  marketProbability: number;
  modelProbability: number;
  impliedProbability: number;
  estimatedEdge: number;
  estimatedValue: number;
  dataQuality: number;
  modelAgreement: number;
  risk: PredictionRisk;
  status: PredictionStatus;
  evidence: PredictionEvidence;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function support(sampleSize: number, fullSupportAt = 5): number {
  return clamp(sampleSize / fullSupportAt, 0, 1);
}

function normalizedLabel(value: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type SelectionRole = "home" | "away" | "draw" | "unknown";

function selectionRole(
  selectionName: string,
  feature: FeatureVector,
): SelectionRole {
  const label = normalizedLabel(selectionName);
  const home = normalizedLabel(feature.identity.homeParticipant);
  const away = normalizedLabel(feature.identity.awayParticipant);

  if (label === "draw" || label === "tie" || label === "x") return "draw";
  if (label === "home" || label === "1") return "home";
  if (label === "away" || label === "2") return "away";
  if (home && label === home) return "home";
  if (away && label === away) return "away";
  return "unknown";
}

function evidenceAdjustment(feature: FeatureVector): {
  home: number;
  away: number;
  form: number;
  headToHead: number;
  rest: number;
} {
  let form = 0;
  const homeForm = feature.form.home;
  const awayForm = feature.form.away;
  if (
    homeForm.winRate !== null &&
    awayForm.winRate !== null &&
    homeForm.sampleSize > 0 &&
    awayForm.sampleSize > 0
  ) {
    const formSupport = support(
      Math.min(homeForm.sampleSize, awayForm.sampleSize),
    );
    form = (homeForm.winRate - awayForm.winRate) * 0.35 * formSupport;
  }

  let headToHead = 0;
  if (
    feature.headToHead.participantAWinRate !== null &&
    feature.headToHead.participantBWinRate !== null &&
    feature.headToHead.sampleSize > 0
  ) {
    const h2hSupport = support(feature.headToHead.sampleSize);
    headToHead =
      (feature.headToHead.participantAWinRate -
        feature.headToHead.participantBWinRate) *
      0.2 *
      h2hSupport;
  }

  let rest = 0;
  if (
    feature.temporal.home.restDays !== null &&
    feature.temporal.away.restDays !== null
  ) {
    rest =
      clamp(
        (feature.temporal.home.restDays - feature.temporal.away.restDays) / 7,
        -1,
        1,
      ) * 0.06;
  }

  const quality = clamp(feature.quality.overall, 0, 1);
  const home = clamp((form + headToHead + rest) * quality, -0.45, 0.45);

  return {
    home,
    away: -home,
    form: round(form),
    headToHead: round(headToHead),
    rest: round(rest),
  };
}

function consensusProbabilities(
  selections: MarketSelectionFeatures[],
): number[] | null {
  const raw = selections.map((selection) => selection.meanImpliedProbability);
  if (
    raw.length < 2 ||
    raw.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    return null;
  }

  const total = raw.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  return raw.map((value) => value / total);
}

function adjustedProbabilities(
  feature: FeatureVector,
  selections: MarketSelectionFeatures[],
  consensus: number[],
): {
  probabilities: number[];
  evidence: ReturnType<typeof evidenceAdjustment>;
} {
  const evidence = evidenceAdjustment(feature);

  const logits = selections.map((selection, index) => {
    const role = selectionRole(selection.selectionName, feature);
    const adjustment =
      role === "home"
        ? evidence.home
        : role === "away"
          ? evidence.away
          : 0;
    return Math.log(Math.max(consensus[index], 1e-9)) + adjustment;
  });

  const maxLogit = Math.max(...logits);
  const weights = logits.map((value) => Math.exp(value - maxLogit));
  const total = weights.reduce((sum, value) => sum + value, 0);

  return {
    probabilities: weights.map((value) => value / total),
    evidence,
  };
}

function candidateRisk(
  quality: number,
  bookmakerCount: number,
  agreement: number,
): PredictionRisk {
  if (quality < 0.55 || bookmakerCount < 2) return "HIGH";
  if (quality >= 0.8 && bookmakerCount >= 3 && agreement >= 0.9) {
    return "LOW";
  }
  return "MEDIUM";
}

export function buildH2hPredictionCandidates(
  feature: FeatureVector,
  market: MarketCoverageFeatures,
): PredictionCandidate[] {
  if (market.key !== "h2h") return [];

  const selections = market.selections.filter(
    (selection) =>
      Number.isFinite(selection.bestDecimalOdds) &&
      selection.bestDecimalOdds > 1 &&
      Number.isFinite(selection.meanImpliedProbability) &&
      selection.meanImpliedProbability > 0,
  );

  const consensus = consensusProbabilities(selections);
  if (!consensus) return [];

  const adjusted = adjustedProbabilities(feature, selections, consensus);
  const quality = clamp(feature.quality.overall, 0, 1);

  return selections.map((selection, index) => {
    const marketProbability = consensus[index];
    const modelProbability = adjusted.probabilities[index];
    const impliedProbability = 1 / selection.bestDecimalOdds;
    const estimatedEdge = modelProbability - impliedProbability;
    const estimatedValue =
      modelProbability * selection.bestDecimalOdds - 1;
    const modelAgreement = clamp(
      1 - Math.abs(modelProbability - marketProbability) * 3,
      0,
      1,
    );
    const risk = candidateRisk(
      quality,
      selection.bookmakerCount,
      modelAgreement,
    );

    return {
      selectionName: selection.selectionName,
      point: selection.point,
      bookmakerCount: selection.bookmakerCount,
      bestDecimalOdds: round(selection.bestDecimalOdds, 4),
      marketProbability: round(marketProbability),
      modelProbability: round(modelProbability),
      impliedProbability: round(impliedProbability),
      estimatedEdge: round(estimatedEdge),
      estimatedValue: round(estimatedValue),
      dataQuality: round(quality, 5),
      modelAgreement: round(modelAgreement, 5),
      risk,
      status: risk === "HIGH" ? "NO_BET" : "WATCH",
      evidence: {
        marketAnchor: round(marketProbability),
        formAdjustment: adjusted.evidence.form,
        headToHeadAdjustment: adjusted.evidence.headToHead,
        restAdjustment: adjusted.evidence.rest,
        totalAdjustment: round(
          selectionRole(selection.selectionName, feature) === "home"
            ? adjusted.evidence.home
            : selectionRole(selection.selectionName, feature) === "away"
              ? adjusted.evidence.away
              : 0,
        ),
        dataQuality: round(quality, 5),
      },
    };
  });
}
