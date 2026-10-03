import { ApiSportsProvider } from "./apiSports";
import { OddsApiProvider } from "./oddsApi";
import type { DataProvider, SupportedSport } from "./types";

export type ProviderName = "api-sports" | "odds-api";
export type ProviderPreference = ProviderName | "auto";

export function resolveProvider(
  preference: ProviderPreference,
  sport: SupportedSport,
): DataProvider {
  if (preference === "api-sports") {
    const key = process.env.API_SPORTS_KEY;
    if (!key) throw new Error("API_SPORTS_KEY is not configured.");
    const provider = new ApiSportsProvider(key);
    if (!provider.supports(sport)) {
      throw new Error(`api-sports does not support ${sport} in the current Phase 3 adapter.`);
    }
    return provider;
  }

  if (preference === "odds-api") {
    const key = process.env.ODDS_API_KEY;
    if (!key) throw new Error("ODDS_API_KEY is not configured.");
    return new OddsApiProvider(key);
  }

  if ((sport === "football" || sport === "basketball") && process.env.API_SPORTS_KEY) {
    return new ApiSportsProvider(process.env.API_SPORTS_KEY);
  }

  if (process.env.ODDS_API_KEY) {
    return new OddsApiProvider(process.env.ODDS_API_KEY);
  }

  throw new Error(
    `No event data provider is configured for ${sport}. Add API_SPORTS_KEY or ODDS_API_KEY to .env.local.`,
  );
}
