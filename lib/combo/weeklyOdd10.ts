import type { ComboCandidate } from "@/lib/combo/engine";

export const WEEKLY_ODD10_TARGET = 10;
export const WEEKLY_ODD10_MIN_PROBABILITY = 0.75;
export const WEEKLY_ODD10_MIN_DATA_QUALITY = 0.8;
export const WEEKLY_ODD10_MIN_AGREEMENT = 0.82;
export const WEEKLY_ODD10_MIN_ESTIMATED_VALUE = -0.05;
export const WEEKLY_ODD10_PREFERRED_MAX = 12;

export type WeeklyOdd10Status =
  | "TARGET_REACHED"
  | "BEST_AVAILABLE"
  | "NO_QUALIFYING_TICKET";

export type WeeklyOdd10Result = {
  status: WeeklyOdd10Status;
  weekStart: string;
  weekEnd: string;
  timeZone: string;
  targetOdds: number;
  actualOdds: number | null;
  estimatedProbability: number | null;
  averageLegProbability: number | null;
  minimumLegProbability: number | null;
  legs: ComboCandidate[];
  candidateCount: number;
  distinctDays: number;
  distinctSports: number;
  message: string;
  methodology: string;
};

type TicketState = {
  legs: ComboCandidate[];
  odds: number;
  probability: number;
  averageQuality: number;
  averageAgreement: number;
  diversification: number;
};

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function dateKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function qualifies(candidate: ComboCandidate): boolean {
  if (candidate.status === "NO_BET" || candidate.status === "HIGH_RISK") return false;
  if (candidate.risk === "HIGH") return false;
  if (!Number.isFinite(candidate.decimalOdds) || candidate.decimalOdds <= 1) return false;
  if (
    !Number.isFinite(candidate.modelProbability) ||
    candidate.modelProbability < WEEKLY_ODD10_MIN_PROBABILITY ||
    candidate.modelProbability >= 1
  ) return false;
  if ((candidate.dataQuality ?? 0) < WEEKLY_ODD10_MIN_DATA_QUALITY) return false;
  if ((candidate.modelAgreement ?? 0) < WEEKLY_ODD10_MIN_AGREEMENT) return false;
  if ((candidate.estimatedValue ?? -1) < WEEKLY_ODD10_MIN_ESTIMATED_VALUE) return false;
  return true;
}

function reliability(candidate: ComboCandidate): number {
  const riskBonus = candidate.risk === "LOW" ? 0.04 : 0;
  const value = Math.max(-0.05, Math.min(candidate.estimatedValue ?? -0.05, 0.15));
  return (
    candidate.modelProbability * 0.58 +
    (candidate.dataQuality ?? 0) * 0.18 +
    (candidate.modelAgreement ?? 0) * 0.16 +
    riskBonus +
    value * 0.04
  );
}

function compareCandidate(a: ComboCandidate, b: ComboCandidate): number {
  return (
    reliability(b) - reliability(a) ||
    b.modelProbability - a.modelProbability ||
    (b.dataQuality ?? 0) - (a.dataQuality ?? 0) ||
    (b.modelAgreement ?? 0) - (a.modelAgreement ?? 0) ||
    a.startsAt.localeCompare(b.startsAt)
  );
}

function diversification(legs: ComboCandidate[]): number {
  let score = 1;
  for (let i = 0; i < legs.length; i += 1) {
    for (let j = i + 1; j < legs.length; j += 1) {
      if (legs[i].league === legs[j].league) score -= 0.045;
      else if (legs[i].sport === legs[j].sport) score -= 0.018;
    }
  }
  return Math.max(0.5, score);
}

function stateFromLegs(legs: ComboCandidate[]): TicketState {
  return {
    legs,
    odds: legs.reduce((product, leg) => product * leg.decimalOdds, 1),
    probability: legs.reduce((product, leg) => product * leg.modelProbability, 1),
    averageQuality:
      legs.reduce((sum, leg) => sum + (leg.dataQuality ?? 0), 0) / legs.length,
    averageAgreement:
      legs.reduce((sum, leg) => sum + (leg.modelAgreement ?? 0), 0) / legs.length,
    diversification: diversification(legs),
  };
}

function stateKey(state: TicketState): string {
  return state.legs.map((leg) => leg.predictionId).sort().join("|");
}

function beamScore(state: TicketState): number {
  const reached = state.odds >= WEEKLY_ODD10_TARGET;
  const progress = Math.min(state.odds / WEEKLY_ODD10_TARGET, 1);
  const distance = Math.abs(Math.log(state.odds / WEEKLY_ODD10_TARGET));
  const overPreferred = Math.max(0, state.odds - WEEKLY_ODD10_PREFERRED_MAX);
  return (
    (reached ? 2000 : 0) +
    progress * 220 +
    state.probability * 500 +
    state.averageQuality * 45 +
    state.averageAgreement * 35 +
    state.diversification * 20 -
    distance * (reached ? 120 : 24) -
    overPreferred * 30 -
    Math.max(0, state.legs.length - 2) * 1.2
  );
}

function compareReached(a: TicketState, b: TicketState): number {
  const aDistance = Math.abs(Math.log(a.odds / WEEKLY_ODD10_TARGET));
  const bDistance = Math.abs(Math.log(b.odds / WEEKLY_ODD10_TARGET));
  return (
    b.probability - a.probability ||
    b.averageQuality - a.averageQuality ||
    b.averageAgreement - a.averageAgreement ||
    aDistance - bDistance ||
    b.diversification - a.diversification ||
    a.legs.length - b.legs.length
  );
}

export function buildWeeklyOdd10(
  candidates: ComboCandidate[],
  options: { weekStart: string; weekEnd: string; timeZone: string },
): WeeklyOdd10Result {
  const eligible = candidates.filter(qualifies).sort(compareCandidate);
  const uniqueEvents: ComboCandidate[] = [];
  const eventIds = new Set<string>();

  for (const candidate of eligible) {
    if (eventIds.has(candidate.eventId)) continue;
    eventIds.add(candidate.eventId);
    uniqueEvents.push(candidate);
  }

  const searchPool = uniqueEvents.slice(0, 60);

  if (searchPool.length < 2) {
    return {
      status: "NO_QUALIFYING_TICKET",
      weekStart: options.weekStart,
      weekEnd: options.weekEnd,
      timeZone: options.timeZone,
      targetOdds: WEEKLY_ODD10_TARGET,
      actualOdds: null,
      estimatedProbability: null,
      averageLegProbability: null,
      minimumLegProbability: null,
      legs: [],
      candidateCount: uniqueEvents.length,
      distinctDays: 0,
      distinctSports: 0,
      message: "Fewer than two future selections pass the 75%+ probability and strict quality gates.",
      methodology:
        "Each leg requires at least 75% model probability, at least 80% data quality, at least 82% model agreement, acceptable risk, and usable current odds. EDGE does not lower the 75% leg threshold to force a 10.00 ticket.",
    };
  }

  const maxLegs = Math.min(18, searchPool.length);
  let beam: TicketState[] = [];

  for (const candidate of searchPool) {
    const additions: TicketState[] = [stateFromLegs([candidate])];
    for (const state of beam) {
      if (state.legs.length >= maxLegs) continue;
      if (state.legs.some((leg) => leg.eventId === candidate.eventId)) continue;
      additions.push(stateFromLegs([...state.legs, candidate]));
    }

    const unique = new Map<string, TicketState>();
    for (const state of [...beam, ...additions]) {
      const key = stateKey(state);
      const current = unique.get(key);
      if (!current || beamScore(state) > beamScore(current)) unique.set(key, state);
    }

    beam = [...unique.values()]
      .sort((a, b) => beamScore(b) - beamScore(a))
      .slice(0, 1400);
  }

  const valid = beam.filter((state) => state.legs.length >= 2);
  const preferredReached = valid
    .filter(
      (state) =>
        state.odds >= WEEKLY_ODD10_TARGET &&
        state.odds <= WEEKLY_ODD10_PREFERRED_MAX,
    )
    .sort(compareReached);
  const anyReached = valid
    .filter((state) => state.odds >= WEEKLY_ODD10_TARGET)
    .sort(compareReached);

  const best =
    preferredReached[0] ??
    anyReached[0] ??
    [...valid].sort((a, b) => {
      const aProgress = Math.min(a.odds / WEEKLY_ODD10_TARGET, 1);
      const bProgress = Math.min(b.odds / WEEKLY_ODD10_TARGET, 1);
      return (
        bProgress - aProgress ||
        b.probability - a.probability ||
        b.averageQuality - a.averageQuality ||
        a.legs.length - b.legs.length
      );
    })[0];

  if (!best) {
    return {
      status: "NO_QUALIFYING_TICKET",
      weekStart: options.weekStart,
      weekEnd: options.weekEnd,
      timeZone: options.timeZone,
      targetOdds: WEEKLY_ODD10_TARGET,
      actualOdds: null,
      estimatedProbability: null,
      averageLegProbability: null,
      minimumLegProbability: null,
      legs: [],
      candidateCount: uniqueEvents.length,
      distinctDays: 0,
      distinctSports: 0,
      message: "No structurally valid 75%+ weekly ODD 10 ticket is available.",
      methodology:
        "EDGE requires at least two different events and never manufactures selections to satisfy the target.",
    };
  }

  const legs = [...best.legs].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const actualOdds = legs.reduce((product, leg) => product * leg.decimalOdds, 1);
  const estimatedProbability = legs.reduce(
    (product, leg) => product * leg.modelProbability,
    1,
  );
  const averageLegProbability =
    legs.reduce((sum, leg) => sum + leg.modelProbability, 0) / legs.length;
  const minimumLegProbability = Math.min(...legs.map((leg) => leg.modelProbability));
  const distinctDays = new Set(
    legs.map((leg) => dateKey(leg.startsAt, options.timeZone)),
  ).size;
  const distinctSports = new Set(legs.map((leg) => leg.sport)).size;
  const targetReached = actualOdds >= WEEKLY_ODD10_TARGET;

  return {
    status: targetReached ? "TARGET_REACHED" : "BEST_AVAILABLE",
    weekStart: options.weekStart,
    weekEnd: options.weekEnd,
    timeZone: options.timeZone,
    targetOdds: WEEKLY_ODD10_TARGET,
    actualOdds: round(actualOdds, 4),
    estimatedProbability: round(estimatedProbability),
    averageLegProbability: round(averageLegProbability),
    minimumLegProbability: round(minimumLegProbability),
    legs,
    candidateCount: uniqueEvents.length,
    distinctDays,
    distinctSports,
    message: targetReached
      ? `EDGE built a ${round(actualOdds, 2)}x weekly ticket using only ${legs.length} selections rated 75%+ individually.`
      : `No safe 75%+ combination reaches 10.00x this week. The strongest qualified ticket currently reaches ${round(actualOdds, 2)}x.`,
    methodology:
      "Probability first, target second. Every selected leg must independently clear the 75% model-probability floor plus stricter data-quality and model-agreement gates. The search prioritizes the highest estimated combined hit probability among tickets that reach roughly 10x. Combined probability assumes independence and is not a guarantee; even 75%+ legs can lose and a multi-leg ticket has a lower probability than each individual leg.",
  };
}
