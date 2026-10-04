import { NextRequest } from "next/server";
import { getUiHistory } from "@/lib/data/uiHistory";
import { apiJson, getRequestId } from "@/lib/production/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const state = await getUiHistory();

  if (!state.available) {
    return apiJson(
      requestId,
      { error: state.message ?? "History unavailable.", requestId },
      { status: 503 },
    );
  }

  return apiJson(requestId, {
    data: {
      predictionCount: state.predictionCount,
      settledEvents: state.settledEvents,
      performance: state.performance,
    },
    meta: { requestId },
  });
}
