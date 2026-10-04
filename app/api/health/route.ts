import { NextResponse } from "next/server";
import { getDb } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        status: "degraded",
        checkedAt,
        database: "not-configured",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    await getDb().sport.count();
    return NextResponse.json(
      {
        status: "ok",
        checkedAt,
        database: "reachable",
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        checkedAt,
        database: "unreachable",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
