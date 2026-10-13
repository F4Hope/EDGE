import { NextRequest } from "next/server";
import type { BetPawaBookingLeg, BetPawaTicketKind } from "@/lib/integrations/betPawaBooking";
import { createBetPawaBookingCode } from "@/lib/integrations/betPawaBooking";
import {
  ApiRequestError,
  apiFailure,
  apiJson,
  getRequestId,
} from "@/lib/production/api";
import { enforcePublicReadRateLimit } from "@/lib/production/requestGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ticketKinds = new Set<BetPawaTicketKind>([
  "daily-low",
  "daily-balanced",
  "weekly",
  "weekly-odd10",
]);

function boundedText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new ApiRequestError(label + " is required.", 400);
  }

  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw new ApiRequestError(label + " is invalid.", 400);
  }
  return text;
}

function parseTicketKind(value: unknown): BetPawaTicketKind {
  if (typeof value !== "string" || !ticketKinds.has(value as BetPawaTicketKind)) {
    throw new ApiRequestError("Unsupported BetPawa ticket type.", 400);
  }
  return value as BetPawaTicketKind;
}

function parseLeg(value: unknown, index: number): BetPawaBookingLeg {
  if (!value || typeof value !== "object") {
    throw new ApiRequestError(
      "BetPawa leg " + (index + 1) + " is invalid.",
      400,
    );
  }

  const row = value as Record<string, unknown>;
  const point =
    row.point === null || row.point === undefined
      ? null
      : Number(row.point);
  const decimalOdds = Number(row.decimalOdds);

  if (
    (point !== null && !Number.isFinite(point)) ||
    !Number.isFinite(decimalOdds) ||
    decimalOdds <= 1 ||
    decimalOdds > 10000
  ) {
    throw new ApiRequestError(
      "BetPawa leg " + (index + 1) + " has invalid pricing.",
      400,
    );
  }

  return {
    eventId: boundedText(row.eventId, "eventId", 128),
    sport: boundedText(row.sport, "sport", 32),
    league: boundedText(row.league, "league", 160),
    startsAt: boundedText(row.startsAt, "startsAt", 64),
    matchup: boundedText(row.matchup, "matchup", 240),
    marketKey: boundedText(row.marketKey, "marketKey", 64),
    point,
    selectionKey: boundedText(row.selectionKey, "selectionKey", 160),
    selectionName: boundedText(row.selectionName, "selectionName", 240),
    decimalOdds,
  };
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const limited = enforcePublicReadRateLimit(
    request,
    requestId,
    "/api/betpawa/booking",
    { limit: 20 },
  );
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      ticketKind?: unknown;
      legs?: unknown;
    };
    const ticketKind = parseTicketKind(body.ticketKind);

    if (!Array.isArray(body.legs) || body.legs.length < 2 || body.legs.length > 250) {
      throw new ApiRequestError(
        "BetPawa booking requires between 2 and 250 legs.",
        400,
      );
    }

    const legs = body.legs.map(parseLeg);
    const result = await createBetPawaBookingCode({ ticketKind, legs });

    return apiJson(
      requestId,
      { data: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiFailure(
      "/api/betpawa/booking",
      requestId,
      error,
      "BetPawa booking code is currently unavailable.",
      503,
    );
  }
}
