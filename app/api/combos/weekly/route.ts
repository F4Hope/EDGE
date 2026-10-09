import { NextRequest } from "next/server";
import { buildWeeklyCombo } from "@/lib/combo/weekly";
import { getComboCandidatePool } from "@/lib/data/uiCombos";
import {
  ApiRequestError,
  apiFailure,
  apiJson,
  getRequestId,
} from "@/lib/production/api";
import { enforcePublicReadRateLimit } from "@/lib/production/requestGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 80) {
    throw new ApiRequestError("Weekly Combo requires a valid time zone.", 400);
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return value;
  } catch {
    throw new ApiRequestError("Weekly Combo time zone is invalid.", 400);
  }
}

function parseWeekWindow(
  startValue: unknown,
  endValue: unknown,
): { from: Date; to: Date } {
  if (typeof startValue !== "string" || typeof endValue !== "string") {
    throw new ApiRequestError(
      "Weekly Combo requires valid ISO week start and end timestamps.",
      400,
    );
  }

  const from = new Date(startValue);
  const to = new Date(endValue);
  const durationMs = to.getTime() - from.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    durationMs < 6.5 * dayMs ||
    durationMs > 7.5 * dayMs
  ) {
    throw new ApiRequestError(
      "Weekly Combo window must span one Monday-Sunday calendar week.",
      400,
    );
  }

  const now = Date.now();
  if (from.getTime() > now || to.getTime() <= now) {
    throw new ApiRequestError(
      "Weekly Combo window must contain the current local date.",
      400,
    );
  }

  if (from.getTime() < now - 7.5 * dayMs || to.getTime() > now + 7.5 * dayMs) {
    throw new ApiRequestError(
      "Weekly Combo window is outside the current week.",
      400,
    );
  }

  return { from, to };
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const limited = enforcePublicReadRateLimit(
    request,
    requestId,
    "/api/combos/weekly",
    { limit: 20 },
  );
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      weekStart?: unknown;
      weekEnd?: unknown;
      timeZone?: unknown;
    };

    const window = parseWeekWindow(body.weekStart, body.weekEnd);
    const timeZone = validTimeZone(body.timeZone);
    const pool = await getComboCandidatePool(168, window);
    const weekly = buildWeeklyCombo(pool.candidates, {
      weekStart: window.from.toISOString(),
      weekEnd: window.to.toISOString(),
      timeZone,
    });

    return apiJson(
      requestId,
      {
        data: weekly,
        meta: {
          candidateDiagnostics: pool.diagnostics,
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiFailure(
      "/api/combos/weekly",
      requestId,
      error,
      "Weekly Combo is currently unavailable.",
      503,
    );
  }
}
