import { getDb } from "@/lib/prisma";
import { resolveSelectionOutcome } from "@/lib/results/selectionOutcomes";

type EdgeDb = ReturnType<typeof getDb>;

export type ComboPerformanceReport = {
  recordedOutputs: number;
  uniqueRecommendations: number;
  settledRecommendations: number;
  wins: number;
  losses: number;
  pendingRecommendations: number;
  hitRate: number | null;
  averageOdds: number | null;
};

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

export async function calculateComboPerformance(
  db: EdgeDb = getDb(),
): Promise<ComboPerformanceReport> {
  const combos = await db.combo.findMany({
    where: {
      status: { in: ["READY", "SETTLED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: {
      selections: {
        orderBy: { position: "asc" },
        include: {
          selection: {
            include: {
              prediction: {
                include: {
                  market: { select: { key: true } },
                  event: {
                    include: {
                      result: true,
                      homeTeam: { select: { name: true } },
                      awayTeam: { select: { name: true } },
                      homePlayer: { select: { fullName: true } },
                      awayPlayer: { select: { fullName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const seen = new Set<string>();
  let uniqueRecommendations = 0;
  let wins = 0;
  let losses = 0;
  let settledOddsTotal = 0;

  for (const combo of combos) {
    if (combo.selections.length < 2 || combo.actualOdds === null) continue;

    const signature = [
      combo.riskMode,
      combo.targetOdds === null ? "na" : Number(combo.targetOdds).toFixed(4),
      Number(combo.actualOdds).toFixed(4),
      ...combo.selections.map(({ selection }) =>
        [
          selection.predictionId,
          selection.oddsAtSelection === null
            ? "na"
            : Number(selection.oddsAtSelection).toFixed(4),
        ].join("@"),
      ),
    ].join("|");

    if (seen.has(signature)) continue;
    seen.add(signature);
    uniqueRecommendations += 1;

    let unresolved = false;
    let lost = false;

    for (const { selection } of combo.selections) {
      const prediction = selection.prediction;
      const event = prediction.event;
      const result = event.result;

      if (!result || result.status !== "FINAL") {
        unresolved = true;
        continue;
      }

      const participants = {
        home:
          event.homeTeam?.name ??
          event.homePlayer?.fullName ??
          null,
        away:
          event.awayTeam?.name ??
          event.awayPlayer?.fullName ??
          null,
      };

      const outcome = resolveSelectionOutcome(
        result.payload,
        {
          selectionKey: prediction.selectionKey,
          explanation: prediction.explanation,
          market: { key: prediction.market.key },
        },
        participants,
      );

      if (outcome === 0) {
        lost = true;
        break;
      }
      if (outcome !== 1) unresolved = true;
    }

    if (lost) {
      losses += 1;
      settledOddsTotal += Number(combo.actualOdds);
      continue;
    }

    if (!unresolved) {
      wins += 1;
      settledOddsTotal += Number(combo.actualOdds);
    }
  }

  const settledRecommendations = wins + losses;
  const pendingRecommendations =
    uniqueRecommendations - settledRecommendations;

  return {
    recordedOutputs: combos.length,
    uniqueRecommendations,
    settledRecommendations,
    wins,
    losses,
    pendingRecommendations,
    hitRate:
      settledRecommendations > 0
        ? round(wins / settledRecommendations, 6)
        : null,
    averageOdds:
      settledRecommendations > 0
        ? round(settledOddsTotal / settledRecommendations, 4)
        : null,
  };
}
