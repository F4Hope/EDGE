import { NextRequest } from "next/server";
import { getDb } from "@/lib/prisma";
import { calculateModelPerformance } from "@/lib/evaluation/performance";
import { apiFailure, apiJson, getRequestId } from "@/lib/production/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    const report = await calculateModelPerformance(getDb());
    return apiJson(requestId, {
      data: report,
      meta: {
        sufficientData: report.sampleCount > 0,
        note:
          report.sampleCount > 0
            ? "Statistical model evaluation from settled records."
            : "INSUFFICIENT DATA",
        requestId,
      },
    });
  } catch (error) {
    return apiFailure(
      "/api/model-performance",
      requestId,
      error,
      "Model performance is currently unavailable.",
      503,
    );
  }
}
