export type ProviderCredentialCheck = {
  provider: "api-sports" | "odds-api";
  configured: boolean;
  ok: boolean;
  detail: string;
  quotaRemaining: number | null;
};

type FetchLike = typeof fetch;

function integerHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function hasApiSportsErrors(errors: unknown): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(errors);
}

export async function checkApiSportsCredential(
  apiKey: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderCredentialCheck> {
  const key = apiKey?.trim();
  if (!key) {
    return {
      provider: "api-sports",
      configured: false,
      ok: false,
      detail: "API_SPORTS_KEY is not configured.",
      quotaRemaining: null,
    };
  }

  try {
    const response = await fetchImpl(
      "https://v3.football.api-sports.io/status",
      {
        method: "GET",
        headers: {
          "x-apisports-key": key,
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );

    const quotaRemaining = integerHeader(
      response.headers,
      "x-ratelimit-requests-remaining",
    );

    if (!response.ok) {
      return {
        provider: "api-sports",
        configured: true,
        ok: false,
        detail: "API-Sports rejected the credential or status request.",
        quotaRemaining,
      };
    }

    const body = (await response.json()) as {
      errors?: unknown;
      response?: {
        subscription?: {
          active?: boolean;
        };
      };
    };

    if (
      hasApiSportsErrors(body.errors) ||
      body.response?.subscription?.active !== true
    ) {
      return {
        provider: "api-sports",
        configured: true,
        ok: false,
        detail: "API-Sports credential is not active.",
        quotaRemaining,
      };
    }

    return {
      provider: "api-sports",
      configured: true,
      ok: true,
      detail: "API-Sports credential is active and the status endpoint is reachable.",
      quotaRemaining,
    };
  } catch {
    return {
      provider: "api-sports",
      configured: true,
      ok: false,
      detail: "API-Sports status endpoint could not be reached.",
      quotaRemaining: null,
    };
  }
}

export async function checkOddsApiCredential(
  apiKey: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<ProviderCredentialCheck & { activeSports: number | null }> {
  const key = apiKey?.trim();
  if (!key) {
    return {
      provider: "odds-api",
      configured: false,
      ok: false,
      detail: "ODDS_API_KEY is not configured.",
      quotaRemaining: null,
      activeSports: null,
    };
  }

  try {
    const url = new URL("https://api.the-odds-api.com/v4/sports/");
    url.searchParams.set("apiKey", key);

    const response = await fetchImpl(url, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    const quotaRemaining = integerHeader(
      response.headers,
      "x-requests-remaining",
    );

    if (!response.ok) {
      return {
        provider: "odds-api",
        configured: true,
        ok: false,
        detail: "The Odds API rejected the credential or sports request.",
        quotaRemaining,
        activeSports: null,
      };
    }

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) {
      return {
        provider: "odds-api",
        configured: true,
        ok: false,
        detail: "The Odds API returned an unexpected sports response.",
        quotaRemaining,
        activeSports: null,
      };
    }

    return {
      provider: "odds-api",
      configured: true,
      ok: true,
      detail: "The Odds API credential is active and the sports endpoint is reachable.",
      quotaRemaining,
      activeSports: body.length,
    };
  } catch {
    return {
      provider: "odds-api",
      configured: true,
      ok: false,
      detail: "The Odds API sports endpoint could not be reached.",
      quotaRemaining: null,
      activeSports: null,
    };
  }
}
