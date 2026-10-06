export const COMBO_TARGETS = [2, 5, 10, 20, 50, 100, 1000] as const;
export const COMBO_RISK_MODES = ["LOW", "BALANCED", "AGGRESSIVE"] as const;

export type ComboRiskMode = (typeof COMBO_RISK_MODES)[number];

export type ComboCandidate = {
  predictionId: string;
  eventId: string;
  sport: string;
  league: string;
  startsAt: string;
  matchup: string;
  marketKey: string;
  point: number | null;
  selectionKey: string;
  selectionName: string;
  decimalOdds: number;
  modelProbability: number;
  estimatedValue: number | null;
  dataQuality: number | null;
  modelAgreement: number | null;
  risk: "LOW" | "MEDIUM" | "HIGH";
  status: "BETTABLE" | "WATCH" | "HIGH_RISK" | "NO_BET";
  bookmakerName?: string | null;
  oddsProvider?: string | null;
  marketProbability?: number | null;
  modelLift?: number | null;
  evidenceSupport?: number | null;
};

export type ComboLeg = ComboCandidate;

export type ComboBuildResult = {
  status: "TARGET_REACHED" | "BEST_EFFORT" | "NO_QUALIFYING_COMBO";
  targetOdds: number;
  riskMode: ComboRiskMode;
  actualOdds: number | null;
  estimatedProbability: number | null;
  estimatedValue: number | null;
  diversificationScore: number | null;
  targetReached: boolean;
  legs: ComboLeg[];
  candidateCount: number;
  message: string;
  methodology: string;
};

type RiskProfile = {
  allowedRisks: Array<ComboCandidate["risk"]>;
  minProbability: number;
  minDataQuality: number;
  minAgreement: number;
  minEstimatedValue: number;
  maxLegs: number;
};

const PROFILES: Record<ComboRiskMode, RiskProfile> = {
  LOW: {
    allowedRisks: ["LOW"],
    minProbability: 0.45,
    minDataQuality: 0.8,
    minAgreement: 0.88,
    minEstimatedValue: 0,
    maxLegs: 4,
  },
  BALANCED: {
    allowedRisks: ["LOW", "MEDIUM"],
    minProbability: 0.2,
    minDataQuality: 0.55,
    minAgreement: 0.5,
    minEstimatedValue: -0.05,
    maxLegs: 6,
  },
  AGGRESSIVE: {
    allowedRisks: ["LOW", "MEDIUM"],
    minProbability: 0.05,
    minDataQuality: 0.55,
    minAgreement: 0.35,
    minEstimatedValue: -0.05,
    maxLegs: 10,
  },
};

type ComboState = {
  legs: ComboCandidate[];
  odds: number;
  probability: number;
  avgQuality: number;
  avgAgreement: number;
  diversificationScore: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function candidateStrength(candidate: ComboCandidate): number {
  const quality = candidate.dataQuality ?? 0;
  const agreement = candidate.modelAgreement ?? 0;
  const value = candidate.estimatedValue ?? -0.1;

  return (
    candidate.modelProbability * 0.5 +
    quality * 0.22 +
    agreement * 0.18 +
    clamp(value, -0.1, 0.2) * 0.1
  );
}

function qualifies(
  candidate: ComboCandidate,
  profile: RiskProfile,
): boolean {
  if (candidate.status === "NO_BET" || candidate.status === "HIGH_RISK") {
    return false;
  }
  if (!profile.allowedRisks.includes(candidate.risk)) return false;
  if (!Number.isFinite(candidate.decimalOdds) || candidate.decimalOdds <= 1) {
    return false;
  }
  if (
    !Number.isFinite(candidate.modelProbability) ||
    candidate.modelProbability < profile.minProbability ||
    candidate.modelProbability >= 1
  ) {
    return false;
  }
  if ((candidate.dataQuality ?? 0) < profile.minDataQuality) return false;
  if ((candidate.modelAgreement ?? 0) < profile.minAgreement) return false;
  if ((candidate.estimatedValue ?? -1) < profile.minEstimatedValue) return false;
  return true;
}

const MIN_COMBO_LEGS = 2;

function diversificationScore(legs: ComboCandidate[]): number {
  let score = 1;

  for (let i = 0; i < legs.length; i += 1) {
    for (let j = i + 1; j < legs.length; j += 1) {
      if (legs[i].league === legs[j].league) {
        score -= 0.07;
      } else if (legs[i].sport === legs[j].sport) {
        score -= 0.03;
      }
    }
  }

  return clamp(score, 0.5, 1);
}

function stateFromLegs(legs: ComboCandidate[]): ComboState {
  const odds = legs.reduce((product, leg) => product * leg.decimalOdds, 1);
  const probability = legs.reduce(
    (product, leg) => product * leg.modelProbability,
    1,
  );
  const avgQuality =
    legs.reduce((sum, leg) => sum + (leg.dataQuality ?? 0), 0) / legs.length;
  const avgAgreement =
    legs.reduce((sum, leg) => sum + (leg.modelAgreement ?? 0), 0) / legs.length;

  return {
    legs,
    odds,
    probability,
    avgQuality,
    avgAgreement,
    diversificationScore: diversificationScore(legs),
  };
}

function stateScore(state: ComboState, targetOdds: number): number {
  const reached = state.odds >= targetOdds;
  const progress = Math.min(state.odds / targetOdds, 1);
  const targetDistance = Math.abs(Math.log(state.odds / targetOdds));

  return (
    (reached ? 1000 : 0) +
    progress * 100 +
    state.probability * 60 +
    state.avgQuality * 20 +
    state.avgAgreement * 12 +
    state.diversificationScore * 10 -
    targetDistance * (reached ? 320 : 45) -
    Math.max(0, state.legs.length - 1) * 0.4
  );
}

function compareReachedStates(
  a: ComboState,
  b: ComboState,
  targetOdds: number,
): number {
  const aDistance = Math.abs(Math.log(a.odds / targetOdds));
  const bDistance = Math.abs(Math.log(b.odds / targetOdds));

  return (
    aDistance - bDistance ||
    b.probability - a.probability ||
    b.avgQuality - a.avgQuality ||
    b.avgAgreement - a.avgAgreement ||
    b.diversificationScore - a.diversificationScore ||
    a.legs.length - b.legs.length
  );
}

function stateKey(state: ComboState): string {
  return state.legs
    .map((leg) => leg.predictionId)
    .sort()
    .join("|");
}

export function buildCombo(
  candidates: ComboCandidate[],
  targetOdds: number,
  riskMode: ComboRiskMode,
): ComboBuildResult {
  const profile = PROFILES[riskMode];

  const eligible = candidates
    .filter((candidate) => qualifies(candidate, profile))
    .sort((a, b) => candidateStrength(b) - candidateStrength(a))
    .slice(0, 40);

  if (eligible.length === 0) {
    return {
      status: "NO_QUALIFYING_COMBO",
      targetOdds,
      riskMode,
      actualOdds: null,
      estimatedProbability: null,
      estimatedValue: null,
      diversificationScore: null,
      targetReached: false,
      legs: [],
      candidateCount: 0,
      message:
        "No stored priced selections pass the selected risk and model-quality gates.",
      methodology:
        "Pre-event priced model selections only; NO_BET/HIGH_RISK outputs are excluded.",
    };
  }

  let beam: ComboState[] = [];
  const seen = new Set<string>();

  for (const candidate of eligible) {
    const additions: ComboState[] = [stateFromLegs([candidate])];

    for (const state of beam) {
      if (state.legs.length >= profile.maxLegs) continue;
      if (state.legs.some((leg) => leg.eventId === candidate.eventId)) continue;

      additions.push(stateFromLegs([...state.legs, candidate]));
    }

    for (const state of additions) {
      seen.add(stateKey(state));
    }

    const combined = [...beam, ...additions];
    const unique = new Map<string, ComboState>();
    for (const state of combined) {
      const key = stateKey(state);
      const existing = unique.get(key);
      if (!existing || stateScore(state, targetOdds) > stateScore(existing, targetOdds)) {
        unique.set(key, state);
      }
    }

    beam = [...unique.values()]
      .sort((a, b) => stateScore(b, targetOdds) - stateScore(a, targetOdds))
      .slice(0, 600);
  }

  const validCombos = beam.filter(
    (state) => state.legs.length >= MIN_COMBO_LEGS,
  );

  const reached = validCombos
    .filter((state) => state.odds >= targetOdds)
    .sort((a, b) => compareReachedStates(a, b, targetOdds));

  const best =
    reached[0] ??
    [...validCombos].sort((a, b) => {
      const aProgress = Math.min(a.odds / targetOdds, 1);
      const bProgress = Math.min(b.odds / targetOdds, 1);
      return (
        bProgress - aProgress ||
        b.probability - a.probability ||
        b.diversificationScore - a.diversificationScore
      );
    })[0];

  if (!best) {
    return {
      status: "NO_QUALIFYING_COMBO",
      targetOdds,
      riskMode,
      actualOdds: null,
      estimatedProbability: null,
      estimatedValue: null,
      diversificationScore: null,
      targetReached: false,
      legs: [],
      candidateCount: eligible.length,
      message: "No structurally valid combination could be constructed.",
      methodology:
        "At least two selections from different events are required; pre-event featured-market outputs only.",
    };
  }

  const targetReached = best.odds >= targetOdds;
  const estimatedValue = best.probability * best.odds - 1;

  return {
    status: targetReached ? "TARGET_REACHED" : "BEST_EFFORT",
    targetOdds,
    riskMode,
    actualOdds: round(best.odds, 4),
    estimatedProbability: round(best.probability),
    estimatedValue: round(estimatedValue),
    diversificationScore: round(best.diversificationScore, 5),
    targetReached,
    legs: best.legs,
    candidateCount: eligible.length,
    message: targetReached
      ? `A qualifying ${riskMode.toLowerCase()} combo reached the requested ${targetOdds}x target at ${round(best.odds, 2)}x.`
      : `The available qualified selections cannot safely reach ${targetOdds}x. Showing the strongest best-effort combination instead.`,
    methodology:
      "Decimal leg odds are multiplied for the combined price. Among combinations that reach the request, EDGE prioritizes the closest target fit, then probability, quality, agreement, diversification, and fewer legs. Combined probability assumes leg independence; diversification score is a structural proxy, not measured statistical correlation.",
  };
}
