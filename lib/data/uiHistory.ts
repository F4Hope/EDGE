import { getDb } from "@/lib/prisma";
import { calculateModelPerformance } from "@/lib/evaluation/performance";
import {
  calculateDisplayedComboPerformance,
  type DisplayedComboPerformance,
  type DisplayedComboPerformanceRow,
} from "@/lib/evaluation/comboPerformance";

export type UiSettledResult = {
  eventId: string;
  sport: string;
  league: string;
  home: string;
  away: string;
  status: "FINAL" | "VOID";
  homeScore: number | null;
  awayScore: number | null;
  winner: "home" | "away" | "draw" | null;
  observedAt: string;
};

export type UiHistoryState = {
  predictionCount: number;
  settledEvents: number;
  recentResults: UiSettledResult[];
  performance: Awaited<ReturnType<typeof calculateModelPerformance>>;
  comboPerformance: DisplayedComboPerformance;
  available: boolean;
  message: string | null;
};

function finiteScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseResultPayload(payload: unknown): {
  homeScore: number | null;
  awayScore: number | null;
  winner: "home" | "away" | "draw" | null;
} {
  if (!payload || typeof payload !== "object") {
    return { homeScore: null, awayScore: null, winner: null };
  }

  const record = payload as Record<string, unknown>;
  const score =
    record.score && typeof record.score === "object"
      ? (record.score as Record<string, unknown>)
      : null;

  const homeScore = finiteScore(score?.home);
  const awayScore = finiteScore(score?.away);

  const explicitWinner =
    record.winner === "home" ||
    record.winner === "away" ||
    record.winner === "draw"
      ? record.winner
      : null;

  if (explicitWinner) {
    return { homeScore, awayScore, winner: explicitWinner };
  }

  if (homeScore === null || awayScore === null) {
    return { homeScore, awayScore, winner: null };
  }

  return {
    homeScore,
    awayScore,
    winner:
      homeScore > awayScore
        ? "home"
        : awayScore > homeScore
          ? "away"
          : "draw",
  };
}

export async function getUiHistory(): Promise<UiHistoryState> {
  try {
    const db = getDb();
    const [predictionCount, settledEvents, performance, resultRows, comboRows] =
      await Promise.all([
        db.prediction.count(),
        db.result.count({ where: { status: "FINAL" } }),
        calculateModelPerformance(db),
        db.result.findMany({
          where: { status: { in: ["FINAL", "VOID"] } },
          include: {
            event: {
              include: {
                sport: { select: { name: true } },
                league: { select: { name: true } },
                homeTeam: { select: { name: true } },
                awayTeam: { select: { name: true } },
                homePlayer: { select: { fullName: true } },
                awayPlayer: { select: { fullName: true } },
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 20,
        }),
        db.combo.findMany({
          where: { status: "READY" },
          select: {
            id: true,
            targetOdds: true,
            actualOdds: true,
            riskMode: true,
            createdAt: true,
            selections: {
              orderBy: { position: "asc" },
              select: {
                position: true,
                selection: {
                  select: {
                    prediction: {
                      select: {
                        selectionKey: true,
                        explanation: true,
                        market: { select: { key: true } },
                        event: {
                          select: {
                            homeTeam: { select: { name: true } },
                            awayTeam: { select: { name: true } },
                            homePlayer: { select: { fullName: true } },
                            awayPlayer: { select: { fullName: true } },
                            result: {
                              select: {
                                status: true,
                                payload: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 250,
        }),
      ]);

    const recentResults: UiSettledResult[] = resultRows.map((result) => {
      const parsed = parseResultPayload(result.payload);

      return {
        eventId: result.eventId,
        sport: result.event.sport.name,
        league: result.event.league.name,
        home:
          result.event.homeTeam?.name ??
          result.event.homePlayer?.fullName ??
          "Unknown participant",
        away:
          result.event.awayTeam?.name ??
          result.event.awayPlayer?.fullName ??
          "Unknown participant",
        status: result.status as "FINAL" | "VOID",
        homeScore: parsed.homeScore,
        awayScore: parsed.awayScore,
        winner: parsed.winner,
        observedAt: (result.completedAt ?? result.updatedAt).toISOString(),
      };
    });

    const comboPerformance = calculateDisplayedComboPerformance(
      comboRows.map((row) => ({
        ...row,
        targetOdds: row.targetOdds === null ? null : Number(row.targetOdds),
        actualOdds: row.actualOdds === null ? null : Number(row.actualOdds),
        riskMode: String(row.riskMode),
      })) as DisplayedComboPerformanceRow[],
    );

    return {
      predictionCount,
      settledEvents,
      recentResults,
      performance,
      comboPerformance,
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
      recentResults: [],
      performance: {
        sampleCount: 0,
        evaluation: {
          count: 0,
          accuracyAtHalf: null,
          brierScore: null,
          calibrationError: null,
          buckets: [],
        },
        marketBenchmark: {
          count: 0,
          model: {
            count: 0,
            accuracyAtHalf: null,
            brierScore: null,
            calibrationError: null,
            buckets: [],
          },
          market: {
            count: 0,
            accuracyAtHalf: null,
            brierScore: null,
            calibrationError: null,
            buckets: [],
          },
          brierDelta: null,
          brierSkillScore: null,
          calibrationDelta: null,
        },
        bySport: [],
        byMarket: [],
        byModelVersion: [],
      },
      comboPerformance: {
        displayed: 0,
        settled: 0,
        wins: 0,
        losses: 0,
        pending: 0,
        voided: 0,
        hitRate: null,
        recent: [],
      },
      available: false,
      message:
        error instanceof Error && error.message.includes("DATABASE_URL")
          ? "Database connection is not configured in this environment."
          : "Historical evaluation is currently unavailable.",
    };
  }
}
