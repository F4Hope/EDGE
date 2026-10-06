import { NextRequest } from "next/server";
import { getComboCandidatePool } from "@/lib/data/uiCombos";
import { discoverPublicNews } from "@/lib/intelligence/googleNewsDiscovery";
import { buildComboResearchTask } from "@/lib/intelligence/researchEvidence";
import {
  ApiRequestError,
  apiFailure,
  apiJson,
  getRequestId,
} from "@/lib/production/api";
import {
  enforcePublicReadRateLimit,
  requireOpaqueId,
} from "@/lib/production/requestGuards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const limited = enforcePublicReadRateLimit(
    request,
    requestId,
    "/api/combos/research",
    { limit: 12 },
  );
  if (limited) return limited;

  try {
    const body = (await request.json()) as { predictionId?: string };
    const predictionId = requireOpaqueId(body.predictionId, "predictionId");
    const pool = await getComboCandidatePool();
    const candidate = pool.evidenceResearchQueue.find(
      (item) => item.predictionId === predictionId,
    );

    if (!candidate) {
      throw new ApiRequestError(
        "This selection is no longer in the Combo evidence research queue.",
        404,
      );
    }

    const task = buildComboResearchTask({
      eventId: candidate.eventId,
      predictionId: candidate.predictionId,
      sport: candidate.sport,
      league: candidate.league,
      startsAt: candidate.startsAt,
      matchup: candidate.matchup,
      selectionName: candidate.selectionName,
      decimalOdds: candidate.decimalOdds,
      bookmakerName: candidate.bookmakerName,
      oddsProvider: candidate.oddsProvider,
    });

    const queryResults = [];
    for (const query of task.searchQueries.slice(0, 2)) {
      const result = await discoverPublicNews(query, {
        startsAt: task.startsAt,
        limit: 4,
        timeoutMs: 8_000,
      });
      queryResults.push({ query, result });
    }

    const seen = new Set<string>();
    const articles = queryResults
      .flatMap(({ query, result }) =>
        result.items.map((item) => ({
          ...item,
          provider: result.provider,
          query,
        })),
      )
      .filter((item) => {
        if (seen.has(item.discoveryUrl)) return false;
        seen.add(item.discoveryUrl);
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() -
          new Date(a.publishedAt).getTime(),
      )
      .slice(0, 8);

    return apiJson(
      requestId,
      {
        data: {
          predictionId: candidate.predictionId,
          eventId: candidate.eventId,
          matchup: candidate.matchup,
          selectionName: candidate.selectionName,
          generatedAt: new Date().toISOString(),
          articles,
          searches: queryResults.map(({ query, result }) => ({
            query,
            provider: result.provider,
            error: result.error,
            itemCount: result.items.length,
          })),
          rules: {
            discoveryOnly: true,
            mustReviewBeforeImport: true,
            noAutomaticQualification: true,
            noPredictionMutation: true,
            noOddsDerivedFromSearch: true,
          },
        },
        requestId,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiFailure(
      "/api/combos/research",
      requestId,
      error,
      "Combo research discovery is currently unavailable.",
      503,
    );
  }
}
