import { NextRequest, NextResponse } from "next/server";
import { getUiOddsForEvent } from "@/lib/data/uiOdds";

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

  const state = await getUiOddsForEvent(eventId);

  if (!state.available) {
    return NextResponse.json(
      { error: state.message ?? "Odds are unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    data: state.markets,
    meta: {
      eventId,
      marketCount: state.markets.length,
      source: "edge-database",
    },
  });
}
