import type {
  FeatureQualityBreakdown,
  MarketFeatureSet,
  ParticipantScheduleFeatures,
  SportSpecificFeatureSet,
} from "./types";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scheduleSideScore(side: ParticipantScheduleFeatures): number {
  if (side.priorEvents60d === 0) return 0;
  if (side.restDays === null) return 0.35;
  return side.priorEvents60d >= 3 ? 1 : 0.65;
}

export function calculateFeatureQuality(input: {
  identityComplete: boolean;
  homeSchedule: ParticipantScheduleFeatures;
  awaySchedule: ParticipantScheduleFeatures;
  market: MarketFeatureSet;
  sportSpecific: SportSpecificFeatureSet;
}): FeatureQualityBreakdown {
  const identity = input.identityComplete ? 1 : 0;
  const scheduleContext =
    (scheduleSideScore(input.homeSchedule) +
      scheduleSideScore(input.awaySchedule)) /
    2;
  const marketCoverage = input.market.marketCount > 0 ? 1 : 0;
  const bookmakerBreadth = clamp01(input.market.bookmakerCount / 3);
  const totalSportFeatures =
    input.sportSpecific.available.length + input.sportSpecific.missing.length;
  const sportSpecificCoverage =
    totalSportFeatures === 0
      ? 0
      : input.sportSpecific.available.length / totalSportFeatures;

  const overall =
    identity * 0.2 +
    scheduleContext * 0.2 +
    marketCoverage * 0.25 +
    bookmakerBreadth * 0.15 +
    sportSpecificCoverage * 0.2;

  return {
    identity: Number(identity.toFixed(5)),
    scheduleContext: Number(scheduleContext.toFixed(5)),
    marketCoverage: Number(marketCoverage.toFixed(5)),
    bookmakerBreadth: Number(bookmakerBreadth.toFixed(5)),
    sportSpecificCoverage: Number(sportSpecificCoverage.toFixed(5)),
    overall: Number(clamp01(overall).toFixed(5)),
  };
}
