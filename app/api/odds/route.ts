import { NextRequest } from "next/server";
import { getUiOddsForEvent } from "@/lib/data/uiOdds";
import {
  apiFailure,
  apiJson,
  getRequestId,
} from "@/lib/production/api";
import {
  enforcePublicReadRateLimit,
  requireOpaqueId,
} from "@/lib/production/requestGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const limited = enforcePublicReadRateLimit(
    request,
    requestId,
    "/api/odds",
    { limit: 180 },
  );
  if (limited) return limited;

  let eventId: string;
  try {
    eventId = requireOpaqueId(
      request.nextUrl.searchParams.get("eventId"),
      "eventId",
    );
  } catch (error) {
    return apiFailure(
      "/api/odds",
      requestId,
      error,
      "Request validation failed.",
      400,
    );
  }

  const state = await getUiOddsForEvent(eventId);

  if (!state.available) {
    return apiJson(
      requestId,
      { error: state.message ?? "Odds are unavailable.", requestId },
      { status: 503 },
    );
  }

  return apiJson(requestId, {
    data: state.markets,
    meta: {
      eventId,
      marketCount: state.markets.length,
      source: "edge-database",
      requestId,
    },
  });
}
