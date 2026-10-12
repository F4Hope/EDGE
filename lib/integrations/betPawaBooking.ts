import type { ComboCandidate } from "@/lib/combo/engine";

export type BetPawaTicketKind = "daily-low" | "daily-balanced" | "weekly";

export type BetPawaBookingLeg = Pick<
  ComboCandidate,
  | "eventId"
  | "sport"
  | "league"
  | "startsAt"
  | "matchup"
  | "marketKey"
  | "point"
  | "selectionKey"
  | "selectionName"
  | "decimalOdds"
>;

export type BetPawaBookingStatus =
  | "READY"
  | "NOT_CONFIGURED"
  | "UNAVAILABLE";

export type BetPawaBookingResult = {
  status: BetPawaBookingStatus;
  bookingCode: string | null;
  loadUrl: string | null;
  matchedLegCount: number;
  unmatchedLegs: string[];
  message: string;
};

type ProviderPayload = Record<string, unknown>;

function record(value: unknown): ProviderPayload | null {
  return value && typeof value === "object"
    ? (value as ProviderPayload)
    : null;
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function codeValue(value: unknown): string | null {
  const code = textValue(value);
  if (!code || !/^[a-z0-9]{5,32}$/i.test(code)) return null;
  return code.toUpperCase();
}

function httpsUrl(value: unknown): string | null {
  const text = textValue(value);
  if (!text) return null;

  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const row = record(item);
      return (
        textValue(row?.matchup) ??
        textValue(row?.selectionName) ??
        textValue(row?.eventId)
      );
    })
    .filter((item): item is string => Boolean(item));
}

function loadUrlForSite(siteUrl: string | null): string | null {
  if (!siteUrl) return null;

  try {
    return new URL("/search", siteUrl).toString();
  } catch {
    return null;
  }
}

export function parseBetPawaBookingResponse(
  value: unknown,
  expectedLegCount: number,
  configuredSiteUrl: string | null,
): BetPawaBookingResult {
  const payload = record(value);
  const data = record(payload?.data);
  const code =
    codeValue(payload?.bookingCode) ??
    codeValue(payload?.booking_code) ??
    codeValue(payload?.code) ??
    codeValue(data?.bookingCode) ??
    codeValue(data?.booking_code) ??
    codeValue(data?.code);

  const unmatchedLegs = stringList(
    payload?.unmatchedLegs ?? payload?.unmatched_legs ?? data?.unmatchedLegs,
  );
  const matchedRaw =
    payload?.matchedLegCount ??
    payload?.matched_leg_count ??
    data?.matchedLegCount ??
    data?.matched_leg_count;
  const matchedLegCount =
    typeof matchedRaw === "number" && Number.isInteger(matchedRaw)
      ? matchedRaw
      : code && unmatchedLegs.length === 0
        ? expectedLegCount
        : Math.max(0, expectedLegCount - unmatchedLegs.length);

  const providerLoadUrl =
    httpsUrl(payload?.loadUrl) ??
    httpsUrl(payload?.load_url) ??
    httpsUrl(data?.loadUrl) ??
    httpsUrl(data?.load_url);
  const loadUrl = providerLoadUrl ?? loadUrlForSite(configuredSiteUrl);

  if (!code) {
    return {
      status: "UNAVAILABLE",
      bookingCode: null,
      loadUrl,
      matchedLegCount,
      unmatchedLegs,
      message:
        textValue(payload?.message) ??
        textValue(data?.message) ??
        "BetPawa did not return a valid booking code.",
    };
  }

  if (
    unmatchedLegs.length > 0 ||
    matchedLegCount !== expectedLegCount
  ) {
    return {
      status: "UNAVAILABLE",
      bookingCode: null,
      loadUrl,
      matchedLegCount,
      unmatchedLegs,
      message:
        "BetPawa did not match every EDGE leg, so EDGE refused to expose a partial booking code.",
    };
  }

  return {
    status: "READY",
    bookingCode: code,
    loadUrl,
    matchedLegCount,
    unmatchedLegs: [],
    message: "BetPawa matched every EDGE leg and returned a booking code.",
  };
}

export async function createBetPawaBookingCode(options: {
  ticketKind: BetPawaTicketKind;
  legs: BetPawaBookingLeg[];
}): Promise<BetPawaBookingResult> {
  const apiUrl = httpsUrl(process.env.BETPAWA_BOOKING_API_URL);
  const siteUrl = httpsUrl(process.env.BETPAWA_SITE_URL);

  if (!apiUrl) {
    return {
      status: "NOT_CONFIGURED",
      bookingCode: null,
      loadUrl: loadUrlForSite(siteUrl),
      matchedLegCount: 0,
      unmatchedLegs: [],
      message:
        "The BetPawa booking-code connector is not configured on this deployment.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const token = process.env.BETPAWA_BOOKING_API_TOKEN?.trim();
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        "X-EDGE-Integration": "betpawa-booking-v1",
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        ticketKind: options.ticketKind,
        legs: options.legs,
      }),
    });

    if (!response.ok) {
      return {
        status: "UNAVAILABLE",
        bookingCode: null,
        loadUrl: loadUrlForSite(siteUrl),
        matchedLegCount: 0,
        unmatchedLegs: [],
        message:
          "BetPawa booking-code service returned HTTP " +
          response.status +
          ".",
      };
    }

    const payload = (await response.json()) as unknown;
    return parseBetPawaBookingResponse(
      payload,
      options.legs.length,
      siteUrl,
    );
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      bookingCode: null,
      loadUrl: loadUrlForSite(siteUrl),
      matchedLegCount: 0,
      unmatchedLegs: [],
      message:
        error instanceof Error && error.name === "AbortError"
          ? "BetPawa booking-code request timed out."
          : "BetPawa booking-code service is currently unavailable.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
