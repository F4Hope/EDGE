import { NextRequest } from "next/server";
import { getSystemReadiness } from "@/lib/system/readiness";
import { apiJson, getRequestId } from "@/lib/production/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const readiness = await getSystemReadiness();

  return apiJson(
    requestId,
    { ...readiness, requestId },
    {
      status: readiness.overall === "READY" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
