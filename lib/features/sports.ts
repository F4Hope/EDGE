import type {
  HeadToHeadFeatures,
  ParticipantFormFeatures,
  ParticipantScheduleFeatures,
  SportSpecificFeatureSet,
} from "./types";
import type { SupportedSport } from "@/lib/providers/types";

type SportFeatureInput = {
  home: ParticipantScheduleFeatures;
  away: ParticipantScheduleFeatures;
  homeForm: ParticipantFormFeatures;
  awayForm: ParticipantFormFeatures;
  headToHead: HeadToHeadFeatures;
  participantKind: "team" | "player";
};

function addIfAvailable(
  values: Record<string, string | number | boolean | null>,
  available: string[],
  key: string,
  value: string | number | boolean | null,
): void {
  values[key] = value;
  if (value !== null) available.push(key);
}

function addRecentForm(
  values: Record<string, string | number | boolean | null>,
  available: string[],
  prefix: string,
  form: ParticipantFormFeatures,
): boolean {
  if (form.sampleSize === 0) return false;

  addIfAvailable(values, available, prefix + "RecentMatches", form.sampleSize);
  addIfAvailable(values, available, prefix + "RecentWins", form.wins);
  addIfAvailable(values, available, prefix + "RecentDraws", form.draws);
  addIfAvailable(values, available, prefix + "RecentLosses", form.losses);
  addIfAvailable(values, available, prefix + "RecentWinRate", form.winRate);
  addIfAvailable(values, available, prefix + "RecentAverageFor", form.averageFor);
  addIfAvailable(
    values,
    available,
    prefix + "RecentAverageAgainst",
    form.averageAgainst,
  );

  return true;
}

function addHeadToHead(
  values: Record<string, string | number | boolean | null>,
  available: string[],
  headToHead: HeadToHeadFeatures,
): boolean {
  if (headToHead.sampleSize === 0) return false;

  addIfAvailable(values, available, "h2hSampleSize", headToHead.sampleSize);
  addIfAvailable(
    values,
    available,
    "h2hParticipantAWinRate",
    headToHead.participantAWinRate,
  );
  addIfAvailable(
    values,
    available,
    "h2hParticipantBWinRate",
    headToHead.participantBWinRate,
  );
  addIfAvailable(values, available, "h2hDraws", headToHead.draws);
  addIfAvailable(
    values,
    available,
    "h2hAverageParticipantAScore",
    headToHead.averageParticipantAScore,
  );
  addIfAvailable(
    values,
    available,
    "h2hAverageParticipantBScore",
    headToHead.averageParticipantBScore,
  );

  return true;
}

function without(
  items: string[],
  removals: string[],
): string[] {
  const removalSet = new Set(removals);
  return items.filter((item) => !removalSet.has(item));
}

function footballFeatures(input: SportFeatureInput): SportSpecificFeatureSet {
  const values: Record<string, string | number | boolean | null> = {};
  const available: string[] = [];

  addIfAvailable(
    values,
    available,
    "homeAdvantageContext",
    input.participantKind === "team",
  );
  addIfAvailable(values, available, "homeRestDays", input.home.restDays);
  addIfAvailable(values, available, "awayRestDays", input.away.restDays);
  addIfAvailable(values, available, "homeEventsLast7d", input.home.eventsLast7d);
  addIfAvailable(values, available, "awayEventsLast7d", input.away.eventsLast7d);

  const homeFormAvailable = addRecentForm(
    values,
    available,
    "home",
    input.homeForm,
  );
  const awayFormAvailable = addRecentForm(
    values,
    available,
    "away",
    input.awayForm,
  );

  const headToHeadAvailable = addHeadToHead(
    values,
    available,
    input.headToHead,
  );

  const baseMissing = [
    "recentForm",
    "goalsScored",
    "goalsConceded",
    "attackStrength",
    "defensiveStrength",
    "awayPerformance",
    "expectedGoals",
    "injuries",
    "suspensions",
    "playerAvailability",
    "headToHead",
    "leagueStrength",
    "tacticalMatchup",
    "oddsMovement",
  ];

  const formAdjusted =
    homeFormAvailable && awayFormAvailable
      ? without(baseMissing, ["recentForm", "goalsScored", "goalsConceded"])
      : baseMissing;
  const missing = headToHeadAvailable
    ? without(formAdjusted, ["headToHead"])
    : formAdjusted;

  return { values, available, missing };
}

function basketballFeatures(input: SportFeatureInput): SportSpecificFeatureSet {
  const values: Record<string, string | number | boolean | null> = {};
  const available: string[] = [];

  addIfAvailable(
    values,
    available,
    "homeAwayContext",
    input.participantKind === "team",
  );
  addIfAvailable(values, available, "homeRestDays", input.home.restDays);
  addIfAvailable(values, available, "awayRestDays", input.away.restDays);
  addIfAvailable(values, available, "homeBackToBack", input.home.backToBack);
  addIfAvailable(values, available, "awayBackToBack", input.away.backToBack);
  addIfAvailable(values, available, "homeEventsLast7d", input.home.eventsLast7d);
  addIfAvailable(values, available, "awayEventsLast7d", input.away.eventsLast7d);

  const homeFormAvailable = addRecentForm(
    values,
    available,
    "home",
    input.homeForm,
  );
  const awayFormAvailable = addRecentForm(
    values,
    available,
    "away",
    input.awayForm,
  );
  const headToHeadAvailable = addHeadToHead(
    values,
    available,
    input.headToHead,
  );

  const baseMissing = [
    "offensiveRating",
    "defensiveRating",
    "pace",
    "recentForm",
    "playerAvailability",
    "keyPlayerImpact",
    "matchup",
    "headToHead",
    "oddsMovement",
  ];

  const formAdjusted =
    homeFormAvailable && awayFormAvailable
      ? without(baseMissing, ["recentForm"])
      : baseMissing;
  const missing = headToHeadAvailable
    ? without(formAdjusted, ["headToHead"])
    : formAdjusted;

  return { values, available, missing };
}

function tennisFeatures(input: SportFeatureInput): SportSpecificFeatureSet {
  const values: Record<string, string | number | boolean | null> = {};
  const available: string[] = [];

  addIfAvailable(values, available, "playerARestDays", input.home.restDays);
  addIfAvailable(values, available, "playerBRestDays", input.away.restDays);
  addIfAvailable(values, available, "playerAMatchesLast7d", input.home.eventsLast7d);
  addIfAvailable(values, available, "playerBMatchesLast7d", input.away.eventsLast7d);
  addIfAvailable(values, available, "playerABackToBack", input.home.backToBack);
  addIfAvailable(values, available, "playerBBackToBack", input.away.backToBack);

  const playerAFormAvailable = addRecentForm(
    values,
    available,
    "playerA",
    input.homeForm,
  );
  const playerBFormAvailable = addRecentForm(
    values,
    available,
    "playerB",
    input.awayForm,
  );
  const headToHeadAvailable = addHeadToHead(
    values,
    available,
    input.headToHead,
  );

  const baseMissing = [
    "ranking",
    "recentForm",
    "playingSurface",
    "serveStatistics",
    "returnStatistics",
    "breakPointPerformance",
    "headToHead",
    "tournamentStage",
    "fitness",
    "oddsMovement",
  ];

  const formAdjusted =
    playerAFormAvailable && playerBFormAvailable
      ? without(baseMissing, ["recentForm"])
      : baseMissing;
  const missing = headToHeadAvailable
    ? without(formAdjusted, ["headToHead"])
    : formAdjusted;

  return { values, available, missing };
}

export function buildSportSpecificFeatures(
  sport: SupportedSport,
  input: SportFeatureInput,
): SportSpecificFeatureSet {
  if (sport === "football") return footballFeatures(input);
  if (sport === "basketball") return basketballFeatures(input);
  return tennisFeatures(input);
}
