import { NextRequest, NextResponse } from "next/server";
import { getUiFeatureForEvent } from "@/lib/data/uiFeatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("eventId")?.trim();

  if (!eventId) {
    return NextResponse.json(
      { error: "eventId is required." },
      { status: 400 },
    );
  }

  const state = await getUiFeatureForEvent(eventId);

  if (!state.available) {
    return NextResponse.json(
      { error: state.message ?? "Features are unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    data: state.feature,
    meta: {
      eventId,
      computedAt: state.computedAt,
      source: "edge-feature-engine",
    },
  });
}
