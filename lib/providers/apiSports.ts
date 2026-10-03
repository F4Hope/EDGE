import type {
  DataProvider,
  EventQuery,
  ProviderEvent,
  ProviderEventStatus,
  SupportedSport,
} from "./types";

const FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const BASKETBALL_BASE_URL = "https://v1.basketball.api-sports.io";
const MAX_BASKETBALL_SYNC_DAYS = 14;

type ApiSportsEnvelope<T> = {
  response?: T[];
  errors?: unknown;
  results?: number;
};

type UnknownRecord = Record<string, any>;

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
  if (typeof errors === "object") return Object.keys(errors as object).length > 0;
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

export function normalizeFootballFixture(item: UnknownRecord): ProviderEvent {
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

export function normalizeBasketballGame(item: UnknownRecord): ProviderEvent {
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

export class ApiSportsProvider implements DataProvider {
  readonly name = "api-sports";

  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("API_SPORTS_KEY is not configured.");
    }
  }

  supports(sport: SupportedSport): boolean {
    return sport === "football" || sport === "basketball";
  }

  async getEvents(query: EventQuery): Promise<ProviderEvent[]> {
    assertRange(query.from, query.to);

    if (!this.supports(query.sport)) {
      throw new Error(`API-Sports event ingestion is not configured for ${query.sport} in Phase 3.`);
    }

    if (query.sport === "football") {
      const rows = await this.request<UnknownRecord>(FOOTBALL_BASE_URL, "/fixtures", {
        from: formatUtcDate(query.from),
        to: formatUtcDate(query.to),
        timezone: "UTC",
      });
      return rows.map(normalizeFootballFixture);
    }

    const days = enumerateUtcDays(query.from, query.to);
    if (days.length > MAX_BASKETBALL_SYNC_DAYS) {
      throw new Error(
        `Basketball sync range is capped at ${MAX_BASKETBALL_SYNC_DAYS} UTC days per run to protect provider quota.`,
      );
    }

    const events: ProviderEvent[] = [];
    for (const day of days) {
      const rows = await this.request<UnknownRecord>(BASKETBALL_BASE_URL, "/games", {
        date: day,
        timezone: "UTC",
      });
      events.push(...rows.map(normalizeBasketballGame));
    }
    return events;
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
