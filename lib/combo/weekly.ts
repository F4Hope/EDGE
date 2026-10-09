import type { ComboCandidate } from "@/lib/combo/engine";

export const WEEKLY_MIN_PROBABILITY = 0.6;
export const WEEKLY_MIN_DATA_QUALITY = 0.55;
export const WEEKLY_MIN_AGREEMENT = 0.6;
export const WEEKLY_MIN_ESTIMATED_VALUE = -0.05;

export type WeeklyComboStatus =
  | "READY"
  | "BEST_AVAILABLE"
  | "NO_QUALIFYING_WEEKLY_TICKET";

export type WeeklyComboResult = {
  status: WeeklyComboStatus;
  weekStart: string;
  weekEnd: string;
  timeZone: string;
  actualOdds: number | null;
  estimatedProbability: number | null;
  legs: ComboCandidate[];
  candidateCount: number;
  distinctDays: number;
  distinctSports: number;
  minProbability: number;
  message: string;
  methodology: string;
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
  if (candidate.status === "NO_BET" || candidate.status === "HIGH_RISK") {
    return false;
  }
  if (candidate.risk === "HIGH") return false;
  if (!Number.isFinite(candidate.decimalOdds) || candidate.decimalOdds <= 1) {
    return false;
  }
  if (
    !Number.isFinite(candidate.modelProbability) ||
    candidate.modelProbability < WEEKLY_MIN_PROBABILITY ||
    candidate.modelProbability >= 1
  ) {
    return false;
  }
  if ((candidate.dataQuality ?? 0) < WEEKLY_MIN_DATA_QUALITY) return false;
  if ((candidate.modelAgreement ?? 0) < WEEKLY_MIN_AGREEMENT) return false;
  if ((candidate.estimatedValue ?? -1) < WEEKLY_MIN_ESTIMATED_VALUE) return false;
  return true;
}

function compareWeeklyCandidate(
  a: ComboCandidate,
  b: ComboCandidate,
): number {
  return (
    b.modelProbability - a.modelProbability ||
    (b.risk === "LOW" ? 1 : 0) - (a.risk === "LOW" ? 1 : 0) ||
    (b.dataQuality ?? 0) - (a.dataQuality ?? 0) ||
    (b.modelAgreement ?? 0) - (a.modelAgreement ?? 0) ||
    (b.estimatedValue ?? -1) - (a.estimatedValue ?? -1) ||
    a.startsAt.localeCompare(b.startsAt)
  );
}

export function buildWeeklyCombo(
  candidates: ComboCandidate[],
  options: {
    weekStart: string;
    weekEnd: string;
    timeZone: string;
  },
): WeeklyComboResult {
  const eligible = candidates
    .filter(qualifies)
    .sort(compareWeeklyCandidate);

  const uniqueEvents: ComboCandidate[] = [];
  const eventIds = new Set<string>();

  for (const candidate of eligible) {
    if (eventIds.has(candidate.eventId)) continue;
    eventIds.add(candidate.eventId);
    uniqueEvents.push(candidate);
  }

  const selected = [...uniqueEvents].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );

  if (selected.length < 2) {
    return {
      status: "NO_QUALIFYING_WEEKLY_TICKET",
      weekStart: options.weekStart,
      weekEnd: options.weekEnd,
      timeZone: options.timeZone,
      actualOdds: null,
      estimatedProbability: null,
      legs: [],
      candidateCount: uniqueEvents.length,
      distinctDays: new Set(
        selected.map((leg) => dateKey(leg.startsAt, options.timeZone)),
      ).size,
      distinctSports: new Set(selected.map((leg) => leg.sport)).size,
      minProbability: WEEKLY_MIN_PROBABILITY,
      message:
        "Fewer than two future selections in this week pass the high-probability and quality gates.",
      methodology:
        "Current Monday-Sunday window only. Future pre-live priced selections require at least 60% model probability, usable risk status, model quality and agreement. There is no fixed daily or weekly leg cap; one strongest qualified selection is kept per event.",
    };
  }

  const actualOdds = selected.reduce(
    (product, leg) => product * leg.decimalOdds,
    1,
  );
  const estimatedProbability = selected.reduce(
    (product, leg) => product * leg.modelProbability,
    1,
  );
  const distinctDays = new Set(
    selected.map((leg) => dateKey(leg.startsAt, options.timeZone)),
  ).size;
  const distinctSports = new Set(selected.map((leg) => leg.sport)).size;
  const status: WeeklyComboStatus = "READY";

  return {
    status,
    weekStart: options.weekStart,
    weekEnd: options.weekEnd,
    timeZone: options.timeZone,
    actualOdds: round(actualOdds, 4),
    estimatedProbability: round(estimatedProbability),
    legs: selected,
    candidateCount: uniqueEvents.length,
    distinctDays,
    distinctSports,
    minProbability: WEEKLY_MIN_PROBABILITY,
    message: `EDGE found ${selected.length} qualified future event(s) across ${distinctDays} remaining day(s) of this week and included every one of them.`,
    methodology:
      "Probability first: every future event that passes the weekly probability, risk, data-quality, agreement and value gates is included. There is no fixed daily or weekly leg cap. Only the strongest qualified selection is kept per event. Football, basketball and tennis are all eligible. Combined probability multiplies leg probabilities and assumes independence; it is not a guarantee.",
  };
}
