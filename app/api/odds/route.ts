import { NextRequest } from "next/server";
import { getUiOddsForEvent } from "@/lib/data/uiOdds";
import { apiJson, getRequestId } from "@/lib/production/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const eventId = request.nextUrl.searchParams.get("eventId")?.trim();

  if (!eventId) {
    return apiJson(
      requestId,
      { error: "eventId is required.", requestId },
      { status: 400 },
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
