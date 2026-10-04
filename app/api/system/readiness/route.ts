import { NextResponse } from "next/server";
import { getSystemReadiness } from "@/lib/system/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await getSystemReadiness();

  return NextResponse.json(readiness, {
    status: readiness.overall === "READY" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
