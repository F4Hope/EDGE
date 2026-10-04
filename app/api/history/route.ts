import { NextResponse } from "next/server";
import { getUiHistory } from "@/lib/data/uiHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getUiHistory();

  if (!state.available) {
    return NextResponse.json(
      { error: state.message ?? "History unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    data: {
      predictionCount: state.predictionCount,
      settledEvents: state.settledEvents,
      performance: state.performance,
    },
  });
}
