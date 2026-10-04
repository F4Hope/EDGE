import { NextRequest } from "next/server";
import { getDb } from "@/lib/prisma";
import { apiFailure, apiJson, getRequestId } from "@/lib/production/api";
import { parsePageRequest } from "@/lib/production/pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);

  try {
    const db = getDb();
    const { limit } = parsePageRequest(request.nextUrl.searchParams);
    const eventId =
      request.nextUrl.searchParams.get("eventId")?.trim() || undefined;

    const results = await db.result.findMany({
      where: eventId ? { eventId } : undefined,
      include: {
        event: {
          include: {
            sport: { select: { key: true, name: true } },
            league: { select: { name: true, country: true } },
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
            homePlayer: { select: { fullName: true } },
            awayPlayer: { select: { fullName: true } },
          },
        },
      },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      take: limit,
    });

    return apiJson(
      requestId,
      { results, meta: { requestId } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiFailure(
      "/api/results",
      requestId,
      error,
      "Results are currently unavailable.",
      503,
    );
  }
}
