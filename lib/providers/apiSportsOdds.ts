import type { ProviderQuota } from "./oddsTypes";

const BASE_URL = "https://v3.football.api-sports.io";

type ApiSportsEnvelope<T> = {
  response?: T[];
  errors?: unknown;
  results?: number;
  paging?: {
    current?: number;
    total?: number;
  };
};

type ApiSportsOddsValue = {
  value?: string;
  odd?: string;
};

type ApiSportsOddsBet = {
  id?: number;
  name?: string;
  values?: ApiSportsOddsValue[];
};

type ApiSportsOddsBookmaker = {
  id?: number;
  name?: string;
  bets?: ApiSportsOddsBet[];
};

export type ApiSportsFootballOddsRow = {
  fixture?: {
    id?: number | string;
    date?: string;
  };
  league?: {
    id?: number | string;
    name?: string;
    country?: string;
  };
  update?: string;
  bookmakers?: ApiSportsOddsBookmaker[];
};

export type ApiSportsMatchWinnerOutcome = {
  side: "home" | "draw" | "away";
  price: number;
};

export type ApiSportsMatchWinnerBookmaker = {
  key: string;
  name: string;
  outcomes: ApiSportsMatchWinnerOutcome[];
};

export type ApiSportsMatchWinnerEvent = {
  providerId: string;
  startsAt: string;
  leagueName: string | null;
  providerUpdatedAt: string | null;
  bookmakers: ApiSportsMatchWinnerBookmaker[];
};

export type ApiSportsOddsPage = {
  events: ApiSportsMatchWinnerEvent[];
  currentPage: number;
  totalPages: number;
  quota?: ProviderQuota;
};

function hasApiErrors(errors: unknown): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(errors);
}

function numericOdd(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
}

function normalizeSide(value: unknown): ApiSportsMatchWinnerOutcome["side"] | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "home") return "home";
  if (normalized === "draw" || normalized === "tie") return "draw";
  if (normalized === "away") return "away";
  return null;
}

export function normalizeApiSportsMatchWinnerRow(
  row: ApiSportsFootballOddsRow,
): ApiSportsMatchWinnerEvent | null {
  const providerId = String(row.fixture?.id ?? "").trim();
  const startsAt = String(row.fixture?.date ?? "").trim();

  if (!providerId || !startsAt) return null;

  const bookmakers: ApiSportsMatchWinnerBookmaker[] = [];

  for (const bookmaker of row.bookmakers ?? []) {
    const bookmakerId = String(bookmaker.id ?? "").trim();
    const bookmakerName = String(bookmaker.name ?? "").trim();
    if (!bookmakerId || !bookmakerName) continue;

    const matchWinner = (bookmaker.bets ?? []).find(
      (bet) =>
        bet.id === 1 ||
        String(bet.name ?? "").trim().toLowerCase() === "match winner",
    );
    if (!matchWinner) continue;

    const outcomes: ApiSportsMatchWinnerOutcome[] = [];
    for (const value of matchWinner.values ?? []) {
      const side = normalizeSide(value.value);
      const price = numericOdd(value.odd);
      if (!side || price === null) continue;
      outcomes.push({ side, price });
    }

    if (outcomes.length >= 2) {
      bookmakers.push({
        key: `api-sports:${bookmakerId}`,
        name: bookmakerName,
        outcomes,
      });
    }
  }

  return {
    providerId,
    startsAt,
    leagueName: row.league?.name ? String(row.league.name) : null,
    providerUpdatedAt: row.update ? String(row.update) : null,
    bookmakers,
  };
}

export class ApiSportsFootballOddsClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("API_SPORTS_KEY is not configured.");
    }
  }

  async getDatePage(date: string, page: number): Promise<ApiSportsOddsPage> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("API-Sports odds date must be YYYY-MM-DD.");
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new Error("API-Sports odds page must be a positive integer.");
    }

    const url = new URL("/odds", BASE_URL);
    url.searchParams.set("date", date);
    url.searchParams.set("bet", "1");
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      method: "GET",
      headers: { "x-apisports-key": this.apiKey },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `API-Sports odds request failed with HTTP ${response.status}.`,
      );
    }

    const body = (await response.json()) as ApiSportsEnvelope<ApiSportsFootballOddsRow>;
    if (hasApiErrors(body.errors)) {
      throw new Error(
        `API-Sports odds returned an application error: ${JSON.stringify(body.errors)}`,
      );
    }
    if (!Array.isArray(body.response)) {
      throw new Error("API-Sports odds returned an invalid response envelope.");
    }

    const events = body.response
      .map(normalizeApiSportsMatchWinnerRow)
      .filter((event): event is ApiSportsMatchWinnerEvent => event !== null);

    return {
      events,
      currentPage: body.paging?.current ?? page,
      totalPages: Math.max(1, body.paging?.total ?? page),
    };
  }
}
