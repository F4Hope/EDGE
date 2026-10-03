import type {
  DataProvider,
  EventQuery,
  ProviderEvent,
  SupportedSport,
} from "./types";
import type {
  FeaturedMarketKey,
  OddsFetchResult,
  OddsProvider,
  OddsQuery,
  ProviderOddsEvent,
  ProviderQuota,
} from "./oddsTypes";
import { featuredMarketKeys } from "./oddsTypes";

const ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4/";

type OddsApiSport = {
  key: string;
  group?: string;
  title: string;
  active?: boolean;
};

type OddsApiEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
};

type OddsApiOutcome = {
  name: string;
  price: number;
  point?: number;
};

type OddsApiMarket = {
  key: string;
  last_update?: string;
  outcomes?: OddsApiOutcome[];
};

type OddsApiBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets?: OddsApiMarket[];
};

type OddsApiOddsEvent = OddsApiEvent & {
  bookmakers?: OddsApiBookmaker[];
};

function normalizedNameKey(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function matchesSport(item: OddsApiSport, sport: SupportedSport): boolean {
  const key = item.key.toLowerCase();
  const group = (item.group ?? "").toLowerCase();
  const title = item.title.toLowerCase();

  if (sport === "football") {
    return (
      key.startsWith("soccer_") ||
      group.includes("soccer") ||
      (group.includes("football") && !group.includes("american"))
    );
  }
  if (sport === "basketball") {
    return key.startsWith("basketball_") || group.includes("basketball");
  }
  return (
    key === "tennis" ||
    key.startsWith("tennis_") ||
    group.includes("tennis") ||
    title === "tennis"
  );
}

function isFeaturedMarketKey(value: string): value is FeaturedMarketKey {
  return featuredMarketKeys.includes(value as FeaturedMarketKey);
}

function parseQuotaNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseQuota(response: Response): ProviderQuota | undefined {
  const remaining = parseQuotaNumber(
    response.headers.get("x-requests-remaining"),
  );
  const used = parseQuotaNumber(response.headers.get("x-requests-used"));
  const lastCost = parseQuotaNumber(response.headers.get("x-requests-last"));

  const quota: ProviderQuota = {};
  if (remaining !== undefined) quota.remaining = remaining;
  if (used !== undefined) quota.used = used;
  if (lastCost !== undefined) quota.lastCost = lastCost;

  return Object.keys(quota).length > 0 ? quota : undefined;
}

export function normalizeOddsEvent(
  item: OddsApiEvent,
  sport: SupportedSport,
): ProviderEvent {
  const homeName = item.home_team.trim();
  const awayName = item.away_team.trim();
  if (
    !item.id ||
    !item.sport_key ||
    !item.sport_title ||
    !item.commence_time ||
    !homeName ||
    !awayName
  ) {
    throw new Error("The Odds API returned an incomplete event.");
  }

  const participantKind = sport === "tennis" ? "player" : "team";

  return {
    providerId: item.id,
    sourceSportKey: item.sport_key,
    sport,
    startsAt: item.commence_time,
    status: "unknown",
    competition: {
      id: item.sport_key,
      name: item.sport_title,
      country: null,
    },
    home: {
      id: normalizedNameKey(homeName),
      name: homeName,
      country: null,
      kind: participantKind,
    },
    away: {
      id: normalizedNameKey(awayName),
      name: awayName,
      country: null,
      kind: participantKind,
    },
  };
}

export function normalizeOddsPayload(
  item: OddsApiOddsEvent,
  sport: SupportedSport,
): ProviderOddsEvent {
  const base = normalizeOddsEvent(item, sport);

  return {
    providerId: base.providerId,
    sourceSportKey: item.sport_key,
    sport,
    startsAt: base.startsAt,
    competitionName: item.sport_title,
    homeName: base.home.name,
    awayName: base.away.name,
    bookmakers: (item.bookmakers ?? [])
      .filter((bookmaker) => bookmaker.key && bookmaker.title)
      .map((bookmaker) => ({
        key: bookmaker.key,
        name: bookmaker.title,
        lastUpdate: bookmaker.last_update ?? null,
        markets: (bookmaker.markets ?? [])
          .filter((market) => isFeaturedMarketKey(market.key))
          .map((market) => ({
            key: market.key as FeaturedMarketKey,
            lastUpdate: market.last_update ?? bookmaker.last_update ?? null,
            outcomes: (market.outcomes ?? [])
              .filter(
                (outcome) =>
                  typeof outcome.name === "string" &&
                  outcome.name.trim().length > 0 &&
                  Number.isFinite(outcome.price) &&
                  outcome.price > 0,
              )
              .map((outcome) => ({
                name: outcome.name.trim(),
                price: outcome.price,
                point:
                  typeof outcome.point === "number" && Number.isFinite(outcome.point)
                    ? outcome.point
                    : null,
              })),
          }))
          .filter((market) => market.outcomes.length > 0),
      }))
      .filter((bookmaker) => bookmaker.markets.length > 0),
  };
}

export class OddsApiProvider implements DataProvider, OddsProvider {
  readonly name = "odds-api";
  private catalogPromise?: Promise<OddsApiSport[]>;

  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("ODDS_API_KEY is not configured.");
    }
  }

  supports(sport: SupportedSport): boolean {
    return sport === "football" || sport === "basketball" || sport === "tennis";
  }

  async getEvents(query: EventQuery): Promise<ProviderEvent[]> {
    if (
      Number.isNaN(query.from.getTime()) ||
      Number.isNaN(query.to.getTime()) ||
      query.from > query.to
    ) {
      throw new Error("Invalid event date range.");
    }

    const catalog = await this.getCatalog();
    const sportKeys = catalog.filter(
      (item) => item.active !== false && matchesSport(item, query.sport),
    );

    if (sportKeys.length === 0) {
      throw new Error(
        `The Odds API catalog returned no active keys for ${query.sport}.`,
      );
    }

    const normalized: ProviderEvent[] = [];
    for (const sportEntry of sportKeys) {
      const events = await this.request<OddsApiEvent[]>(
        `sports/${encodeURIComponent(sportEntry.key)}/events`,
        {
          dateFormat: "iso",
          commenceTimeFrom: query.from.toISOString(),
          commenceTimeTo: query.to.toISOString(),
        },
      );
      normalized.push(
        ...events.data.map((event) => normalizeOddsEvent(event, query.sport)),
      );
    }

    return normalized;
  }

  async getOdds(query: OddsQuery): Promise<OddsFetchResult> {
    if (
      Number.isNaN(query.from.getTime()) ||
      Number.isNaN(query.to.getTime()) ||
      query.from > query.to
    ) {
      throw new Error("Invalid odds date range.");
    }
    if (query.regions.length === 0) {
      throw new Error("At least one Odds API region is required.");
    }
    if (query.markets.length === 0) {
      throw new Error("At least one odds market is required.");
    }

    const events: ProviderOddsEvent[] = [];
    let quota: ProviderQuota | undefined;
    let batchCost = 0;

    for (const sportKey of [...new Set(query.sportKeys)]) {
      const response = await this.request<OddsApiOddsEvent[]>(
        `sports/${encodeURIComponent(sportKey)}/odds`,
        {
          regions: query.regions.join(","),
          markets: query.markets.join(","),
          oddsFormat: "decimal",
          dateFormat: "iso",
          commenceTimeFrom: query.from.toISOString(),
          commenceTimeTo: query.to.toISOString(),
        },
      );

      if (typeof response.quota?.lastCost === "number") {
        batchCost += response.quota.lastCost;
      }
      quota = response.quota
        ? { ...response.quota, batchCost }
        : quota;

      events.push(
        ...response.data.map((event) => normalizeOddsPayload(event, query.sport)),
      );
    }

    return { events, quota };
  }

  private getCatalog(): Promise<OddsApiSport[]> {
    if (!this.catalogPromise) {
      this.catalogPromise = this.request<OddsApiSport[]>("sports", {
        all: "true",
      }).then((response) => response.data);
    }
    return this.catalogPromise;
  }

  private async request<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<{ data: T; quota?: ProviderQuota }> {
    const url = new URL(path.replace(/^\//, ""), ODDS_API_BASE_URL);
    url.searchParams.set("apiKey", this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `The Odds API request failed with HTTP ${response.status}.`,
      );
    }

    return {
      data: (await response.json()) as T,
      quota: parseQuota(response),
    };
  }
}
