import { NextRequest, NextResponse } from "next/server";
import { getUiMovementForEvent } from "@/lib/data/uiMovement";

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

  const state = await getUiMovementForEvent(eventId);
  if (!state.available) {
    return NextResponse.json(
      { error: state.message ?? "Movement diagnostics unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    data: state.markets,
    meta: {
      eventId,
      flaggedMarkets: state.markets.filter(
        (market) => market.summary.flagged,
      ).length,
    },
  });
}
