import { NextRequest } from "next/server";
import { buildCombo, type ComboBuildResult } from "@/lib/combo/engine";
import { recordComboBuild } from "@/lib/data/comboAudit";
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

const MINIMUM_COMBINED_ODDS = 2.3;

function parseComboWindow(
  startValue: unknown,
  endValue: unknown,
): { from: Date; to: Date } {
  if (typeof startValue !== "string" || typeof endValue !== "string") {
    throw new ApiRequestError(
      "Combo Pick requires valid ISO start and end timestamps.",
      400,
    );
  }

  const from = new Date(startValue);
  const to = new Date(endValue);
  const durationMs = to.getTime() - from.getTime();

  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    durationMs <= 0 ||
    durationMs > 36 * 60 * 60 * 1000
  ) {
    throw new ApiRequestError(
      "Combo Pick date window must be a valid local calendar-day range.",
      400,
    );
  }

  const now = Date.now();
  if (
    from.getTime() < now - 36 * 60 * 60 * 1000 ||
    to.getTime() > now + 60 * 60 * 60 * 1000
  ) {
    throw new ApiRequestError(
      "Combo Pick date window must refer to the current or next local calendar day.",
      400,
    );
  }

  return { from, to };
}

function reachedMinimum(
  result: ComboBuildResult,
): ComboBuildResult | null {
  if (
    !result.targetReached ||
    result.status !== "TARGET_REACHED" ||
    result.actualOdds === null ||
    result.actualOdds < MINIMUM_COMBINED_ODDS
  ) {
    return null;
  }

  return result;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);

  try {
    await enforcePublicReadRateLimit(request, "combo-pick");

    const body = (await request.json()) as {
      windowStart?: unknown;
      windowEnd?: unknown;
    };

    const window = parseComboWindow(body.windowStart, body.windowEnd);
    const pool = await getComboCandidatePool(168, window);

    const low = reachedMinimum(
      buildCombo(pool.candidates, MINIMUM_COMBINED_ODDS, "LOW"),
    );

    const lowEventIds = new Set(low?.legs.map((leg) => leg.eventId) ?? []);
    const balancedCandidates = pool.candidates.filter(
      (candidate) => !lowEventIds.has(candidate.eventId),
    );

    const balanced = reachedMinimum(
      buildCombo(
        balancedCandidates,
        MINIMUM_COMBINED_ODDS,
        "BALANCED",
      ),
    );

    await Promise.all([
      low
        ? recordComboBuild(low).catch((error) => {
            console.error(
              "EDGE LOW Combo Pick audit write failed.",
              error instanceof Error ? error.message : String(error),
            );
            return null;
          })
        : Promise.resolve(null),
      balanced
        ? recordComboBuild(balanced).catch((error) => {
            console.error(
              "EDGE BALANCED Combo Pick audit write failed.",
              error instanceof Error ? error.message : String(error),
            );
            return null;
          })
        : Promise.resolve(null),
    ]);

    return apiJson(
      {
        data: {
          minimumCombinedOdds: MINIMUM_COMBINED_ODDS,
          low,
          balanced,
          excludedBalancedEventIds: [...lowEventIds],
          candidateCount: pool.candidates.length,
          candidateDiagnostics: pool.diagnostics,
          windowStart: window.from.toISOString(),
          windowEnd: window.to.toISOString(),
        },
      },
      { requestId },
    );
  } catch (error) {
    return apiFailure(error, { requestId });
  }
}
