import type {
  DataProvider,
  EventQuery,
  ProviderEvent,
  ProviderEventStatus,
  SupportedSport,
} from "./types";
import type {
  ProviderResult,
  ResultProvider,
  ResultQuery,
} from "./resultTypes";

const FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const BASKETBALL_BASE_URL = "https://v1.basketball.api-sports.io";
const MAX_FOOTBALL_SYNC_DAYS = 14;
const MAX_BASKETBALL_SYNC_DAYS = 14;

type ApiSportsEnvelope<T> = {
  response?: T[];
  errors?: unknown;
  results?: number;
};

type ApiSportsEntity = {
  id?: string | number;
  name?: string;
  code?: string;
};

type FootballFixtureRow = {
  fixture?: {
    id?: string | number;
    date?: string;
    status?: { short?: string };
  };
  league?: {
    id?: string | number;
    name?: string;
    country?: string;
  };
  teams?: {
    home?: ApiSportsEntity;
    away?: ApiSportsEntity;
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
};

type BasketballGameRow = {
  id?: string | number;
  date?: string;
  status?: { short?: string };
  league?: {
    id?: string | number;
    name?: string;
  };
  country?: {
    name?: string;
  };
  teams?: {
    home?: ApiSportsEntity;
    away?: ApiSportsEntity;
  };
  scores?: {
    home?: { total?: number | null };
    away?: { total?: number | null };
  };
};

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function assertRange(from: Date, to: Date): void {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid event date range.");
  }
  if (from > to) {
    throw new Error("Event range start must be before range end.");
  }
}

function hasApiErrors(errors: unknown): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(errors);
}

function footballStatus(shortCode: string | undefined): ProviderEventStatus {
  if (!shortCode || shortCode === "TBD") return "unknown";
  if (shortCode === "NS") return "scheduled";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"].includes(shortCode)) return "live";
  if (["FT", "AET", "PEN", "AWD", "WO"].includes(shortCode)) return "completed";
  if (["PST", "SUSP"].includes(shortCode)) return "postponed";
  if (["CANC", "ABD"].includes(shortCode)) return "cancelled";
  return "unknown";
}

function basketballStatus(shortCode: string | undefined): ProviderEventStatus {
  if (!shortCode || shortCode === "TBD") return "unknown";
  if (shortCode === "NS") return "scheduled";
  if (["Q1", "Q2", "Q3", "Q4", "OT", "BT", "HT"].includes(shortCode)) return "live";
  if (["FT", "AOT", "AWD"].includes(shortCode)) return "completed";
  if (["POST", "SUSP"].includes(shortCode)) return "postponed";
  if (["CANC", "ABD"].includes(shortCode)) return "cancelled";
  return "unknown";
}

function requireText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`API-Sports response is missing ${field}.`);
  return text;
}

function numericScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function winnerFromScore(
  homeScore: number | null,
  awayScore: number | null,
): "home" | "away" | "draw" | null {
  if (homeScore === null || awayScore === null) return null;
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

export function normalizeFootballResult(
  item: FootballFixtureRow,
): ProviderResult | null {
  const fixture = item.fixture ?? {};
  const providerId = String(fixture.id ?? "").trim();
  const sourceStatus = String(fixture.status?.short ?? "").trim();

  if (!providerId || !sourceStatus) return null;

  if (["CANC", "ABD"].includes(sourceStatus)) {
    return {
      providerId,
      sport: "football",
      status: "void",
      completedAt: null,
      homeScore: null,
      awayScore: null,
      winner: null,
      sourceStatus,
    };
  }

  if (!["FT", "AET", "PEN", "AWD", "WO"].includes(sourceStatus)) {
    return null;
  }

  const homeScore = numericScore(item.goals?.home);
  const awayScore = numericScore(item.goals?.away);

  return {
    providerId,
    sport: "football",
    status: "final",
    completedAt: null,
    homeScore,
    awayScore,
    winner: winnerFromScore(homeScore, awayScore),
    sourceStatus,
  };
}

export function normalizeBasketballResult(
  item: BasketballGameRow,
): ProviderResult | null {
  const providerId = String(item.id ?? "").trim();
  const sourceStatus = String(item.status?.short ?? "").trim();

  if (!providerId || !sourceStatus) return null;

  if (["CANC", "ABD"].includes(sourceStatus)) {
    return {
      providerId,
      sport: "basketball",
      status: "void",
      completedAt: null,
      homeScore: null,
      awayScore: null,
      winner: null,
      sourceStatus,
    };
  }

  if (!["FT", "AOT", "AWD"].includes(sourceStatus)) {
    return null;
  }

  const homeScore = numericScore(item.scores?.home?.total);
  const awayScore = numericScore(item.scores?.away?.total);

  return {
    providerId,
    sport: "basketball",
    status: "final",
    completedAt: null,
    homeScore,
    awayScore,
    winner: winnerFromScore(homeScore, awayScore),
    sourceStatus,
  };
}

export function normalizeFootballFixture(item: FootballFixtureRow): ProviderEvent {
  const fixture = item.fixture ?? {};
  const league = item.league ?? {};
  const home = item.teams?.home ?? {};
  const away = item.teams?.away ?? {};

  return {
    providerId: requireText(fixture.id, "fixture.id"),
    sport: "football",
    startsAt: requireText(fixture.date, "fixture.date"),
    status: footballStatus(fixture.status?.short),
    competition: {
      id: requireText(league.id, "league.id"),
      name: requireText(league.name, "league.name"),
      country: league.country ? String(league.country) : null,
    },
    home: {
      id: requireText(home.id, "teams.home.id"),
      name: requireText(home.name, "teams.home.name"),
      shortName: home.code ? String(home.code) : null,
      country: null,
      kind: "team",
    },
    away: {
      id: requireText(away.id, "teams.away.id"),
      name: requireText(away.name, "teams.away.name"),
      shortName: away.code ? String(away.code) : null,
      country: null,
      kind: "team",
    },
  };
}

export function normalizeBasketballGame(item: BasketballGameRow): ProviderEvent {
  const league = item.league ?? {};
  const country = item.country ?? {};
  const home = item.teams?.home ?? {};
  const away = item.teams?.away ?? {};

  return {
    providerId: requireText(item.id, "game.id"),
    sport: "basketball",
    startsAt: requireText(item.date, "game.date"),
    status: basketballStatus(item.status?.short),
    competition: {
      id: requireText(league.id, "league.id"),
      name: requireText(league.name, "league.name"),
      country: country.name ? String(country.name) : null,
    },
    home: {
      id: requireText(home.id, "teams.home.id"),
      name: requireText(home.name, "teams.home.name"),
      country: null,
      kind: "team",
    },
    away: {
      id: requireText(away.id, "teams.away.id"),
      name: requireText(away.name, "teams.away.name"),
      country: null,
      kind: "team",
    },
  };
}

export class ApiSportsProvider implements DataProvider, ResultProvider {
  readonly name = "api-sports";

  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("API_SPORTS_KEY is not configured.");
    }
  }

  supports(sport: SupportedSport): boolean {
    return sport === "football" || sport === "basketball";
  }

  supportsResults(sport: SupportedSport): boolean {
    return sport === "football" || sport === "basketball";
  }

  async getEvents(query: EventQuery): Promise<ProviderEvent[]> {
    assertRange(query.from, query.to);

    if (!this.supports(query.sport)) {
      throw new Error(`API-Sports event ingestion is not configured for ${query.sport} in Phase 3.`);
    }

    if (query.sport === "football") {
      const days = enumerateUtcDays(query.from, query.to);
      if (days.length > MAX_FOOTBALL_SYNC_DAYS) {
        throw new Error(
          `Football sync range is capped at ${MAX_FOOTBALL_SYNC_DAYS} UTC days per run to protect provider quota.`,
        );
      }

      const events: ProviderEvent[] = [];
      for (const day of days) {
        const rows = await this.request<FootballFixtureRow>(
          FOOTBALL_BASE_URL,
          "/fixtures",
          {
            date: day,
            timezone: "UTC",
          },
        );
        events.push(...rows.map(normalizeFootballFixture));
      }
      return events;
    }

    const days = enumerateUtcDays(query.from, query.to);
    if (days.length > MAX_BASKETBALL_SYNC_DAYS) {
      throw new Error(
        `Basketball sync range is capped at ${MAX_BASKETBALL_SYNC_DAYS} UTC days per run to protect provider quota.`,
      );
    }

    const events: ProviderEvent[] = [];
    for (const day of days) {
      const rows = await this.request<BasketballGameRow>(BASKETBALL_BASE_URL, "/games", {
        date: day,
        timezone: "UTC",
      });
      events.push(...rows.map(normalizeBasketballGame));
    }
    return events;
  }

  async getResults(query: ResultQuery): Promise<ProviderResult[]> {
    assertRange(query.from, query.to);

    if (!this.supportsResults(query.sport)) {
      throw new Error(
        "API-Sports result ingestion is not configured for " + query.sport + ".",
      );
    }

    if (query.sport === "football") {
      const days = enumerateUtcDays(query.from, query.to);
      if (days.length > MAX_FOOTBALL_SYNC_DAYS) {
        throw new Error(
          "Football result sync range is capped at " +
            MAX_FOOTBALL_SYNC_DAYS +
            " UTC days per run to protect provider quota.",
        );
      }

      const results: ProviderResult[] = [];
      for (const day of days) {
        const rows = await this.request<FootballFixtureRow>(
          FOOTBALL_BASE_URL,
          "/fixtures",
          {
            date: day,
            timezone: "UTC",
          },
        );

        for (const row of rows) {
          const result = normalizeFootballResult(row);
          if (result) results.push(result);
        }
      }
      return results;
    }

    const days = enumerateUtcDays(query.from, query.to);
    if (days.length > MAX_BASKETBALL_SYNC_DAYS) {
      throw new Error(
        "Basketball result sync range is capped at " +
          MAX_BASKETBALL_SYNC_DAYS +
          " UTC days per run to protect provider quota.",
      );
    }

    const results: ProviderResult[] = [];
    for (const day of days) {
      const rows = await this.request<BasketballGameRow>(
        BASKETBALL_BASE_URL,
        "/games",
        {
          date: day,
          timezone: "UTC",
        },
      );

      for (const row of rows) {
        const result = normalizeBasketballResult(row);
        if (result) results.push(result);
      }
    }

    return results;
  }

  private async request<T>(
    baseUrl: string,
    path: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-apisports-key": this.apiKey,
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`API-Sports request failed with HTTP ${response.status}.`);
    }

    const body = (await response.json()) as ApiSportsEnvelope<T>;
    if (hasApiErrors(body.errors)) {
      throw new Error("API-Sports returned an application error.");
    }
    if (!Array.isArray(body.response)) {
      throw new Error("API-Sports returned an invalid response envelope.");
    }

    return body.response;
  }
}

function enumerateUtcDays(from: Date, to: Date): string[] {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  const days: string[] = [];

  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86_400_000)) {
    days.push(formatUtcDate(cursor));
  }
  return days;
}
