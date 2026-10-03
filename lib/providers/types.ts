export type SupportedSport = "football" | "basketball" | "tennis";

export interface ProviderEvent {
  providerId: string;
  sport: SupportedSport;
  startsAt: string;
  competition: string;
  homeName: string;
  awayName: string;
}

export interface DataProvider {
  readonly name: string;
  getEvents(sport: SupportedSport, from: Date, to: Date): Promise<ProviderEvent[]>;
}
