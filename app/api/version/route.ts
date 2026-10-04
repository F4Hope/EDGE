import { NextResponse } from "next/server";
import { getBuildInfo } from "@/lib/system/buildInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBuildInfo(), {
    headers: { "Cache-Control": "no-store" },
  });
}
