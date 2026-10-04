import { getDb } from "@/lib/prisma";
import { calculateModelPerformance } from "@/lib/evaluation/performance";

export type UiHistoryState = {
  predictionCount: number;
  settledEvents: number;
  performance: Awaited<ReturnType<typeof calculateModelPerformance>>;
  available: boolean;
  message: string | null;
};

export async function getUiHistory(): Promise<UiHistoryState> {
  try {
    const db = getDb();
    const [predictionCount, settledEvents, performance] = await Promise.all([
      db.prediction.count(),
      db.result.count({ where: { status: "FINAL" } }),
      calculateModelPerformance(db),
    ]);

    return {
      predictionCount,
      settledEvents,
      performance,
      available: true,
      message:
        performance.sampleCount === 0
          ? "No settled prediction outcomes are available for statistical evaluation."
          : null,
    };
  } catch (error) {
    return {
      predictionCount: 0,
      settledEvents: 0,
      performance: {
        sampleCount: 0,
        evaluation: {
          count: 0,
          accuracyAtHalf: null,
          brierScore: null,
          calibrationError: null,
          buckets: [],
        },
        bySport: [],
        byMarket: [],
        byModelVersion: [],
      },
      available: false,
      message:
        error instanceof Error && error.message.includes("DATABASE_URL")
          ? "Database connection is not configured in this environment."
          : "Historical evaluation is currently unavailable.",
    };
  }
}
