import { resolveSelectionOutcome } from "@/lib/results/selectionOutcomes";

export type DisplayedComboOutcome = "WIN" | "LOSS" | "PENDING" | "VOID";

export type DisplayedComboPerformanceRow = {
  id: string;
  targetOdds: number | null;
  actualOdds: number | null;
  riskMode: string;
  createdAt: Date;
  selections: Array<{
    position: number;
    selection: {
      prediction: {
        selectionKey: string;
        explanation: unknown;
        market: { key: string };
        event: {
          homeTeam: { name: string } | null;
          awayTeam: { name: string } | null;
          homePlayer: { fullName: string } | null;
          awayPlayer: { fullName: string } | null;
          result: {
            status: "PENDING" | "FINAL" | "VOID";
            payload: unknown;
          } | null;
        };
      };
    };
  }>;
};

export type DisplayedComboPerformanceItem = {
  id: string;
  targetOdds: number | null;
  actualOdds: number | null;
  riskMode: string;
  createdAt: string;
  legCount: number;
  outcome: DisplayedComboOutcome;
};

export type DisplayedComboPerformance = {
  displayed: number;
  settled: number;
  wins: number;
  losses: number;
  pending: number;
  voided: number;
  hitRate: number | null;
  recent: DisplayedComboPerformanceItem[];
};

function comboOutcome(row: DisplayedComboPerformanceRow): DisplayedComboOutcome {
  if (row.selections.length < 2) return "PENDING";

  let hasPending = false;
  let hasVoid = false;

  for (const comboSelection of row.selections) {
    const prediction = comboSelection.selection.prediction;
    const event = prediction.event;
    const result = event.result;

    if (!result || result.status === "PENDING") {
      hasPending = true;
      continue;
    }

    if (result.status === "VOID") {
      hasVoid = true;
      continue;
    }

    const outcome = resolveSelectionOutcome(
      result.payload,
      {
        selectionKey: prediction.selectionKey,
        explanation: prediction.explanation,
        market: { key: prediction.market.key },
      },
      {
        home: event.homeTeam?.name ?? event.homePlayer?.fullName ?? null,
        away: event.awayTeam?.name ?? event.awayPlayer?.fullName ?? null,
      },
    );

    if (outcome === 0) return "LOSS";
    if (outcome === null) hasPending = true;
  }

  if (hasPending) return "PENDING";
  if (hasVoid) return "VOID";
  return "WIN";
}

export function calculateDisplayedComboPerformance(
  rows: DisplayedComboPerformanceRow[],
  recentLimit = 10,
): DisplayedComboPerformance {
  const evaluated = rows.map((row) => ({
    id: row.id,
    targetOdds: row.targetOdds,
    actualOdds: row.actualOdds,
    riskMode: row.riskMode,
    createdAt: row.createdAt.toISOString(),
    legCount: row.selections.length,
    outcome: comboOutcome(row),
  }));

  const wins = evaluated.filter((row) => row.outcome === "WIN").length;
  const losses = evaluated.filter((row) => row.outcome === "LOSS").length;
  const pending = evaluated.filter((row) => row.outcome === "PENDING").length;
  const voided = evaluated.filter((row) => row.outcome === "VOID").length;
  const settled = wins + losses;

  return {
    displayed: evaluated.length,
    settled,
    wins,
    losses,
    pending,
    voided,
    hitRate: settled > 0 ? wins / settled : null,
    recent: evaluated.slice(0, Math.max(0, recentLimit)),
  };
}
