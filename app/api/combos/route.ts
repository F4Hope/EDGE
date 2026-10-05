import { NextRequest } from "next/server";
import {
  buildCombo,
  COMBO_RISK_MODES,
  COMBO_TARGETS,
  type ComboRiskMode,
} from "@/lib/combo/engine";
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
    };

    const targetOdds = parseTarget(body.targetOdds);
    const riskMode = parseRisk(body.riskMode);
    const pool = await getComboCandidatePool();
    const combo = buildCombo(pool.candidates, targetOdds, riskMode);

    return apiJson(
      requestId,
      {
        data: combo,
        meta: {
          source: "edge-phase8-combo-engine",
          candidateCount: pool.candidates.length,
          candidateDiagnostics: pool.diagnostics,
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
