import type {
  ParticipantScheduleFeatures,
  SportSpecificFeatureSet,
} from "./types";
import type { SupportedSport } from "@/lib/providers/types";

type SportFeatureInput = {
  home: ParticipantScheduleFeatures;
  away: ParticipantScheduleFeatures;
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

  const missing = [
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

  const missing = [
    "offensiveRating",
    "defensiveRating",
    "pace",
    "recentForm",
    "playerAvailability",
    "keyPlayerImpact",
    "matchup",
    "oddsMovement",
  ];

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

  const missing = [
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
