import { NextRequest } from "next/server";
import { checkReadiness } from "@/lib/system/health";
import { apiJson, getRequestId } from "@/lib/production/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const result = await checkReadiness();

  return apiJson(
    requestId,
    { ...result.body, requestId },
    {
      status: result.statusCode,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
