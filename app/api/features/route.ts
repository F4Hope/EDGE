import { NextRequest } from "next/server";
import { getUiFeatureForEvent } from "@/lib/data/uiFeatures";
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
    "/api/features",
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
      "/api/features",
      requestId,
      error,
      "Request validation failed.",
      400,
    );
  }

  const state = await getUiFeatureForEvent(eventId);

  if (!state.available) {
    return apiJson(
      requestId,
      { error: state.message ?? "Features are unavailable.", requestId },
      { status: 503 },
    );
  }

  return apiJson(requestId, {
    data: state.feature,
    meta: {
      eventId,
      computedAt: state.computedAt,
      source: "edge-feature-engine",
      requestId,
    },
  });
}
