import { NextResponse } from "next/server";
import { getDb } from "@/lib/prisma";
import { calculateModelPerformance } from "@/lib/evaluation/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await calculateModelPerformance(getDb());
    return NextResponse.json({
      data: report,
      meta: {
        sufficientData: report.sampleCount > 0,
        note:
          report.sampleCount > 0
            ? "Statistical model evaluation from settled records."
            : "INSUFFICIENT DATA",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Performance query failed.";
    return NextResponse.json(
      { error: message },
      { status: message.includes("DATABASE_URL") ? 503 : 500 },
    );
  }
}
