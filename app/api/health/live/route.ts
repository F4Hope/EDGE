import { NextRequest } from "next/server";
import { getBuildInfo } from "@/lib/system/buildInfo";
import { apiJson, getRequestId } from "@/lib/production/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);

  return apiJson(
    requestId,
    {
      status: "ok",
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      build: getBuildInfo(),
      requestId,
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
