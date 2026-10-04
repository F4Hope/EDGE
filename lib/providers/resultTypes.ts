import type { SupportedSport } from "./types";

export type ProviderResultStatus = "final" | "void";

export type ProviderResult = {
  providerId: string;
  sport: SupportedSport;
  status: ProviderResultStatus;
  completedAt: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winner: "home" | "away" | "draw" | null;
  sourceStatus: string;
};

export type ResultQuery = {
  sport: SupportedSport;
  from: Date;
  to: Date;
  sourceSportKeys?: string[];
  maxSourceSportKeys?: number;
};

export interface ResultProvider {
  readonly name: string;
  supportsResults(sport: SupportedSport): boolean;
  getResults(query: ResultQuery): Promise<ProviderResult[]>;
}
