export const supportedSports = ["football", "basketball", "tennis"] as const;

export type SupportedSport = (typeof supportedSports)[number];
export type ProviderEventStatus = "scheduled" | "live" | "completed" | "postponed" | "cancelled" | "unknown";
export type ParticipantKind = "team" | "player";

export interface ProviderParticipant {
  id: string;
  name: string;
  kind: ParticipantKind;
  country?: string | null;
  shortName?: string | null;
}

export interface ProviderCompetition {
  id: string;
  name: string;
  country?: string | null;
}

export interface ProviderEvent {
  providerId: string;
  sourceSportKey?: string;
  sport: SupportedSport;
  startsAt: string;
  status: ProviderEventStatus;
  competition: ProviderCompetition;
  home: ProviderParticipant;
  away: ProviderParticipant;
}

export interface EventQuery {
  sport: SupportedSport;
  from: Date;
  to: Date;
}

export interface DataProvider {
  readonly name: string;
  supports(sport: SupportedSport): boolean;
  getEvents(query: EventQuery): Promise<ProviderEvent[]>;
}
