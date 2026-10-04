import { NextRequest } from "next/server";
import { getUiIntelligenceForEvent } from "@/lib/data/uiIntelligence";
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

  const state = await getUiIntelligenceForEvent(eventId);
  if (!state.available) {
    return apiJson(
      requestId,
      { error: state.message ?? "Intelligence unavailable.", requestId },
      { status: 503 },
    );
  }

  return apiJson(requestId, {
    data: state.signals,
    meta: {
      count: state.signals.length,
      requestId,
    },
  });
}
