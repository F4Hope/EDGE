import { getDb } from "@/lib/prisma";
import type { ComboBuildResult } from "@/lib/combo/engine";

type EdgeDb = ReturnType<typeof getDb>;

export async function recordComboBuild(
  combo: ComboBuildResult,
  db: EdgeDb = getDb(),
): Promise<string | null> {
  if (
    combo.legs.length < 2 ||
    combo.actualOdds === null ||
    combo.estimatedProbability === null ||
    combo.estimatedValue === null
  ) {
    return null;
  }

  const created = await db.combo.create({
    data: {
      targetOdds: combo.targetOdds,
      actualOdds: combo.actualOdds,
      estimatedProbability: combo.estimatedProbability,
      estimatedValue: combo.estimatedValue,
      riskMode: combo.riskMode,
      status: "READY",
      selections: {
        create: combo.legs.map((leg, index) => ({
          position: index + 1,
          selection: {
            create: {
              predictionId: leg.predictionId,
              oddsAtSelection: leg.decimalOdds,
              status: "ACTIVE",
            },
          },
        })),
      },
    },
    select: { id: true },
  });

  return created.id;
}
