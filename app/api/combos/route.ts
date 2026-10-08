import { NextRequest } from "next/server";
import {
  buildCombo,
  COMBO_RISK_MODES,
  COMBO_TARGETS,
  type ComboRiskMode,
} from "@/lib/combo/engine";
import { getComboCandidatePool } from "@/lib/data/uiCombos";
import { recordComboBuild } from "@/lib/data/comboAudit";
import {
  ApiRequestError,
  apiFailure,
  apiJson,
  getRequestId,
} from "@/lib/production/api";
import { enforcePublicReadRateLimit } from "@/lib/production/requestGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTarget(value: unknown): number {
  const target = Number(value);
  if (!COMBO_TARGETS.includes(target as (typeof COMBO_TARGETS)[number])) {
    throw new ApiRequestError(
      "Unsupported target odds. Choose 2x, 5x, 10x, 20x, 50x, 100x, or 1000x.",
      400,
    );
  }
  return target;
}

function parseComboWindow(
  startValue: unknown,
  endValue: unknown,
): { from: Date; to: Date } | undefined {
  if (startValue === undefined && endValue === undefined) return undefined;

  if (typeof startValue !== "string" || typeof endValue !== "string") {
    throw new ApiRequestError(
      "Combo date window requires valid ISO start and end timestamps.",
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
      "Combo date window must be a valid calendar-day range of at most 36 hours.",
      400,
    );
  }

  const now = Date.now();
  if (
    from.getTime() < now - 36 * 60 * 60 * 1000 ||
    to.getTime() > now + 60 * 60 * 60 * 1000
  ) {
    throw new ApiRequestError(
      "Combo date window must refer to the current or next local calendar day.",
      400,
    );
  }

  return { from, to };
}

function parseRisk(value: unknown): ComboRiskMode {
  if (
    typeof value !== "string" ||
    !COMBO_RISK_MODES.includes(value as ComboRiskMode)
  ) {
    throw new ApiRequestError(
      "Unsupported risk mode. Choose LOW, BALANCED, or AGGRESSIVE.",
      400,
    );
  }
  return value as ComboRiskMode;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const limited = enforcePublicReadRateLimit(
    request,
    requestId,
    "/api/combos",
    { limit: 30 },
  );
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      targetOdds?: unknown;
      riskMode?: unknown;
      windowStart?: unknown;
      windowEnd?: unknown;
    };

    const targetOdds = parseTarget(body.targetOdds);
    const riskMode = parseRisk(body.riskMode);
    const window = parseComboWindow(body.windowStart, body.windowEnd);
    const pool = await getComboCandidatePool(168, window);
    const combo = buildCombo(pool.candidates, targetOdds, riskMode);
    const comboAuditId = await recordComboBuild(combo).catch((error) => {
      console.error("EDGE combo audit write failed.", {
        requestId,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    return apiJson(
      requestId,
      {
        data: combo,
        meta: {
          source: "edge-phase8-combo-engine",
          candidateCount: pool.candidates.length,
          windowStart: window?.from.toISOString() ?? null,
          windowEnd: window?.to.toISOString() ?? null,
          candidateDiagnostics: pool.diagnostics,
          evidenceResearchQueue: pool.evidenceResearchQueue,
          comboAuditId,
          requestId,
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiFailure(
      "/api/combos",
      requestId,
      error,
      "Combo construction is currently unavailable.",
      503,
    );
  }
}
