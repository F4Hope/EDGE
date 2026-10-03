import type {
  DataProvider,
  EventQuery,
  ProviderEvent,
  SupportedSport,
} from "./types";

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
  return key === "tennis" || key.startsWith("tennis_") || group.includes("tennis") || title === "tennis";
}

export function normalizeOddsEvent(item: OddsApiEvent, sport: SupportedSport): ProviderEvent {
  const homeName = item.home_team.trim();
  const awayName = item.away_team.trim();
  if (!item.id || !item.sport_key || !item.sport_title || !item.commence_time || !homeName || !awayName) {
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

export class OddsApiProvider implements DataProvider {
  readonly name = "odds-api";
  private catalogPromise?: Promise<OddsApiSport[]>;

  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("ODDS_API_KEY is not configured.");
    }
  }

  supports(_sport: SupportedSport): boolean {
    return true;
  }

  async getEvents(query: EventQuery): Promise<ProviderEvent[]> {
    if (Number.isNaN(query.from.getTime()) || Number.isNaN(query.to.getTime()) || query.from > query.to) {
      throw new Error("Invalid event date range.");
    }

    const catalog = await this.getCatalog();
    const sportKeys = catalog.filter((item) => item.active !== false && matchesSport(item, query.sport));

    if (sportKeys.length === 0) {
      throw new Error(`The Odds API catalog returned no active keys for ${query.sport}.`);
    }

    const normalized: ProviderEvent[] = [];
    for (const sportEntry of sportKeys) {
      const events = await this.request<OddsApiEvent[]>(
        `/sports/${encodeURIComponent(sportEntry.key)}/events`,
        {
          dateFormat: "iso",
          commenceTimeFrom: query.from.toISOString(),
          commenceTimeTo: query.to.toISOString(),
        },
      );
      normalized.push(...events.map((event) => normalizeOddsEvent(event, query.sport)));
    }

    return normalized;
  }

  private getCatalog(): Promise<OddsApiSport[]> {
    if (!this.catalogPromise) {
      this.catalogPromise = this.request<OddsApiSport[]>("/sports", { all: "true" });
    }
    return this.catalogPromise;
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
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
      throw new Error(`The Odds API request failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as T;
  }
}
