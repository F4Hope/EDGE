import type {
  FeatureVector,
  MarketCoverageFeatures,
  MarketSelectionFeatures,
} from "@/lib/features/types";

export const PREDICTION_MODEL_VERSION = "market-evidence-v2";

export type PredictionRisk = "LOW" | "MEDIUM" | "HIGH";
export type PredictionStatus = "WATCH" | "NO_BET";

export type PredictionEvidence = {
  marketAnchor: number;
  formAdjustment: number;
  headToHeadAdjustment: number;
  restAdjustment: number;
  scoringAdjustment: number;
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

type SelectionRole = "home" | "away" | "draw" | "over" | "under" | "unknown";

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
  if (label === "over" || label.startsWith("over ")) return "over";
  if (label === "under" || label.startsWith("under ")) return "under";
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

function scoringEstimate(feature: FeatureVector): {
  total: number | null;
  margin: number | null;
  support: number;
} {
  const home = feature.form.home;
  const away = feature.form.away;
  const samples = Math.min(home.sampleSize, away.sampleSize);
  const sampleSupport = support(samples);

  if (
    home.averageFor === null ||
    home.averageAgainst === null ||
    away.averageFor === null ||
    away.averageAgainst === null
  ) {
    return { total: null, margin: null, support: sampleSupport };
  }

  const expectedHome = (home.averageFor + away.averageAgainst) / 2;
  const expectedAway = (away.averageFor + home.averageAgainst) / 2;

  return {
    total: expectedHome + expectedAway,
    margin: expectedHome - expectedAway,
    support: sampleSupport,
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

function selectionAdjustment(
  feature: FeatureVector,
  marketKey: string,
  selection: MarketSelectionFeatures,
): {
  total: number;
  form: number;
  headToHead: number;
  rest: number;
  scoring: number;
} {
  const role = selectionRole(selection.selectionName, feature);
  const evidence = evidenceAdjustment(feature);
  const scoring = scoringEstimate(feature);
  const quality = clamp(feature.quality.overall, 0, 1);

  if (marketKey === "h2h") {
    const total =
      role === "home" ? evidence.home : role === "away" ? evidence.away : 0;
    return {
      total,
      form: evidence.form,
      headToHead: evidence.headToHead,
      rest: evidence.rest,
      scoring: 0,
    };
  }

  if (
    marketKey === "totals" &&
    selection.point !== null &&
    scoring.total !== null &&
    (role === "over" || role === "under")
  ) {
    const raw =
      clamp((scoring.total - selection.point) / 3, -0.35, 0.35) *
      scoring.support *
      quality;
    const total = role === "over" ? raw : -raw;
    return {
      total,
      form: 0,
      headToHead: 0,
      rest: 0,
      scoring: total,
    };
  }

  if (
    marketKey === "spreads" &&
    selection.point !== null &&
    scoring.margin !== null &&
    (role === "home" || role === "away")
  ) {
    const expectedMargin = role === "home" ? scoring.margin : -scoring.margin;
    const scoringAdjustment =
      clamp((expectedMargin + selection.point) / 4, -0.28, 0.28) *
      scoring.support *
      quality;
    const sideAdjustment =
      (role === "home" ? evidence.home : evidence.away) * 0.45;
    const total = clamp(sideAdjustment + scoringAdjustment, -0.35, 0.35);

    return {
      total,
      form: evidence.form * 0.45,
      headToHead: evidence.headToHead * 0.45,
      rest: evidence.rest * 0.45,
      scoring: scoringAdjustment,
    };
  }

  return {
    total: 0,
    form: 0,
    headToHead: 0,
    rest: 0,
    scoring: 0,
  };
}

function adjustedProbabilities(
  feature: FeatureVector,
  marketKey: string,
  selections: MarketSelectionFeatures[],
  consensus: number[],
): {
  probabilities: number[];
  adjustments: ReturnType<typeof selectionAdjustment>[];
} {
  const adjustments = selections.map((selection) =>
    selectionAdjustment(feature, marketKey, selection),
  );

  const logits = selections.map(
    (_selection, index) =>
      Math.log(Math.max(consensus[index], 1e-9)) + adjustments[index].total,
  );

  const maxLogit = Math.max(...logits);
  const weights = logits.map((value) => Math.exp(value - maxLogit));
  const total = weights.reduce((sum, value) => sum + value, 0);

  return {
    probabilities: weights.map((value) => value / total),
    adjustments,
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

function lineGroups(
  market: MarketCoverageFeatures,
): MarketSelectionFeatures[][] {
  const valid = market.selections.filter(
    (selection) =>
      Number.isFinite(selection.bestDecimalOdds) &&
      selection.bestDecimalOdds > 1 &&
      Number.isFinite(selection.meanImpliedProbability) &&
      selection.meanImpliedProbability > 0,
  );

  if (market.key === "h2h") return valid.length >= 2 ? [valid] : [];

  const groups = new Map<string, MarketSelectionFeatures[]>();
  for (const selection of valid) {
    if (selection.point === null) continue;
    const key =
      market.key === "spreads"
        ? Math.abs(selection.point).toFixed(4)
        : selection.point.toFixed(4);
    const group = groups.get(key) ?? [];
    group.push(selection);
    groups.set(key, group);
  }

  return [...groups.values()].filter((group) => group.length >= 2);
}

export function buildMarketPredictionCandidates(
  feature: FeatureVector,
  market: MarketCoverageFeatures,
): PredictionCandidate[] {
  if (!["h2h", "totals", "spreads"].includes(market.key)) return [];

  const quality = clamp(feature.quality.overall, 0, 1);
  const candidates: PredictionCandidate[] = [];

  for (const selections of lineGroups(market)) {
    const consensus = consensusProbabilities(selections);
    if (!consensus) continue;

    const adjusted = adjustedProbabilities(
      feature,
      market.key,
      selections,
      consensus,
    );

    selections.forEach((selection, index) => {
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
      const evidence = adjusted.adjustments[index];

      candidates.push({
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
          formAdjustment: round(evidence.form),
          headToHeadAdjustment: round(evidence.headToHead),
          restAdjustment: round(evidence.rest),
          scoringAdjustment: round(evidence.scoring),
          totalAdjustment: round(evidence.total),
          dataQuality: round(quality, 5),
        },
      });
    });
  }

  return candidates;
}

export function buildH2hPredictionCandidates(
  feature: FeatureVector,
  market: MarketCoverageFeatures,
): PredictionCandidate[] {
  return market.key === "h2h"
    ? buildMarketPredictionCandidates(feature, market)
    : [];
}
