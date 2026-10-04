import { NextRequest, NextResponse } from "next/server";
import { getUiIntelligenceForEvent } from "@/lib/data/uiIntelligence";

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

  const state = await getUiIntelligenceForEvent(eventId);
  if (!state.available) {
    return NextResponse.json(
      { error: state.message ?? "Intelligence unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    data: state.signals,
    meta: { count: state.signals.length },
  });
}
