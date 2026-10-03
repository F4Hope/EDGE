import type { SupportedSport } from "./types";

export const featuredMarketKeys = ["h2h", "spreads", "totals"] as const;

export type FeaturedMarketKey = (typeof featuredMarketKeys)[number];

export type ProviderOddsOutcome = {
  name: string;
  price: number;
  point?: number | null;
};

export type ProviderOddsMarket = {
  key: FeaturedMarketKey;
  lastUpdate?: string | null;
  outcomes: ProviderOddsOutcome[];
};

export type ProviderBookmakerOdds = {
  key: string;
  name: string;
  lastUpdate?: string | null;
  markets: ProviderOddsMarket[];
};

export type ProviderOddsEvent = {
  providerId: string;
  sourceSportKey: string;
  sport: SupportedSport;
  startsAt: string;
  competitionName: string;
  homeName: string;
  awayName: string;
  bookmakers: ProviderBookmakerOdds[];
};

export type ProviderQuota = {
  remaining?: number;
  used?: number;
  lastCost?: number;
  batchCost?: number;
};

export type OddsQuery = {
  sport: SupportedSport;
  from: Date;
  to: Date;
  regions: string[];
  markets: FeaturedMarketKey[];
  sportKeys: string[];
};

export type OddsFetchResult = {
  events: ProviderOddsEvent[];
  quota?: ProviderQuota;
};

export interface OddsProvider {
  readonly name: string;
  getOdds(query: OddsQuery): Promise<OddsFetchResult>;
}
