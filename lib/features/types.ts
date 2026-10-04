import type { SupportedSport } from "@/lib/providers/types";

export const FEATURE_SCHEMA_VERSION = "features-v3";

export type ParticipantScheduleFeatures = {
  priorEvents60d: number;
  eventsLast7d: number;
  restDays: number | null;
  backToBack: boolean | null;
};

export type ParticipantFormFeatures = {
  sampleSize: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number | null;
  averageFor: number | null;
  averageAgainst: number | null;
};

export type HeadToHeadFeatures = {
  sampleSize: number;
  participantAWins: number;
  draws: number;
  participantBWins: number;
  participantAWinRate: number | null;
  participantBWinRate: number | null;
  averageParticipantAScore: number | null;
  averageParticipantBScore: number | null;
};

export type MarketSelectionFeatures = {
  selectionName: string;
  point: number | null;
  bookmakerCount: number;
  meanDecimalOdds: number;
  bestDecimalOdds: number;
  meanImpliedProbability: number;
};

export type MarketCoverageFeatures = {
  key: string;
  snapshotCount: number;
  bookmakerCount: number;
  currentQuoteCount: number;
  meanRelativePriceDispersion: number | null;
  selections: MarketSelectionFeatures[];
};

export type MarketFeatureSet = {
  marketCount: number;
  snapshotCount: number;
  bookmakerCount: number;
  latestSnapshotMinutesBeforeStart: number | null;
  markets: MarketCoverageFeatures[];
};

export type SportSpecificFeatureSet = {
  values: Record<string, string | number | boolean | null>;
  available: string[];
  missing: string[];
};

export type FeatureQualityBreakdown = {
  identity: number;
  scheduleContext: number;
  marketCoverage: number;
  bookmakerBreadth: number;
  sportSpecificCoverage: number;
  overall: number;
};

export type FeatureVector = {
  schemaVersion: typeof FEATURE_SCHEMA_VERSION;
  eventId: string;
  sport: SupportedSport;
  identity: {
    league: string;
    country: string | null;
    startsAt: string;
    homeParticipant: string | null;
    awayParticipant: string | null;
    participantKind: "team" | "player";
  };
  temporal: {
    daysUntilStart: number;
    eventHourUtc: number;
    home: ParticipantScheduleFeatures;
    away: ParticipantScheduleFeatures;
  };
  form: {
    home: ParticipantFormFeatures;
    away: ParticipantFormFeatures;
  };
  headToHead: HeadToHeadFeatures;
  market: MarketFeatureSet;
  sportSpecific: SportSpecificFeatureSet;
  quality: FeatureQualityBreakdown;
};
