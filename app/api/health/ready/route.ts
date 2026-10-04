import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/system/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkReadiness();

  return NextResponse.json(result.body, {
    status: result.statusCode,
    headers: { "Cache-Control": "no-store" },
  });
}
