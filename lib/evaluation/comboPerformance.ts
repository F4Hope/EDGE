import {
  predictionSelectionName,
  resolveSelectionOutcome,
} from "@/lib/results/selectionOutcomes";

export type DisplayedComboOutcome = "WIN" | "LOSS" | "PENDING" | "VOID";
export type DisplayedComboLegOutcome = DisplayedComboOutcome;

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

export type DisplayedComboLegPerformance = {
  position: number;
  marketKey: string;
  selectionName: string;
  matchup: string;
  outcome: DisplayedComboLegOutcome;
};

export type DisplayedComboPerformanceItem = {
  id: string;
  targetOdds: number | null;
  actualOdds: number | null;
  riskMode: string;
  createdAt: string;
  legCount: number;
  outcome: DisplayedComboOutcome;
  legs: DisplayedComboLegPerformance[];
  failedLegs: DisplayedComboLegPerformance[];
};

export type DisplayedComboMarketFailure = {
  marketKey: string;
  losses: number;
};

export type DisplayedComboPerformance = {
  displayed: number;
  settled: number;
  wins: number;
  losses: number;
  pending: number;
  voided: number;
  hitRate: number | null;
  failureByMarket: DisplayedComboMarketFailure[];
  recent: DisplayedComboPerformanceItem[];
};

function participantNames(
  row: DisplayedComboPerformanceRow["selections"][number],
): { home: string | null; away: string | null } {
  const event = row.selection.prediction.event;
  return {
    home: event.homeTeam?.name ?? event.homePlayer?.fullName ?? null,
    away: event.awayTeam?.name ?? event.awayPlayer?.fullName ?? null,
  };
}

function matchupLabel(
  participants: { home: string | null; away: string | null },
): string {
  return `${participants.home ?? "Unknown"} vs ${participants.away ?? "Unknown"}`;
}

function legOutcome(
  comboSelection: DisplayedComboPerformanceRow["selections"][number],
): DisplayedComboLegPerformance {
  const prediction = comboSelection.selection.prediction;
  const event = prediction.event;
  const result = event.result;
  const participants = participantNames(comboSelection);
  const selectionName =
    predictionSelectionName(prediction.explanation) ?? prediction.selectionKey;

  let outcome: DisplayedComboLegOutcome = "PENDING";

  if (result?.status === "VOID") {
    outcome = "VOID";
  } else if (result?.status === "FINAL") {
    const resolved = resolveSelectionOutcome(
      result.payload,
      {
        selectionKey: prediction.selectionKey,
        explanation: prediction.explanation,
        market: { key: prediction.market.key },
      },
      participants,
    );
    outcome = resolved === 1 ? "WIN" : resolved === 0 ? "LOSS" : "PENDING";
  }

  return {
    position: comboSelection.position,
    marketKey: prediction.market.key,
    selectionName,
    matchup: matchupLabel(participants),
    outcome,
  };
}

function comboOutcome(
  legs: DisplayedComboLegPerformance[],
): DisplayedComboOutcome {
  if (legs.length < 2) return "PENDING";
  if (legs.some((leg) => leg.outcome === "LOSS")) return "LOSS";
  if (legs.some((leg) => leg.outcome === "PENDING")) return "PENDING";
  if (legs.some((leg) => leg.outcome === "VOID")) return "VOID";
  return "WIN";
}

export function calculateDisplayedComboPerformance(
  rows: DisplayedComboPerformanceRow[],
  recentLimit = 10,
): DisplayedComboPerformance {
  const evaluated = rows.map((row) => {
    const legs = row.selections.map(legOutcome);
    return {
      id: row.id,
      targetOdds: row.targetOdds,
      actualOdds: row.actualOdds,
      riskMode: row.riskMode,
      createdAt: row.createdAt.toISOString(),
      legCount: row.selections.length,
      outcome: comboOutcome(legs),
      legs,
      failedLegs: legs.filter((leg) => leg.outcome === "LOSS"),
    };
  });

  const wins = evaluated.filter((row) => row.outcome === "WIN").length;
  const losses = evaluated.filter((row) => row.outcome === "LOSS").length;
  const pending = evaluated.filter((row) => row.outcome === "PENDING").length;
  const voided = evaluated.filter((row) => row.outcome === "VOID").length;
  const settled = wins + losses;

  const marketLosses = new Map<string, number>();
  for (const combo of evaluated) {
    for (const leg of combo.failedLegs) {
      marketLosses.set(
        leg.marketKey,
        (marketLosses.get(leg.marketKey) ?? 0) + 1,
      );
    }
  }

  const failureByMarket = [...marketLosses.entries()]
    .map(([marketKey, marketLossCount]) => ({
      marketKey,
      losses: marketLossCount,
    }))
    .sort(
      (a, b) =>
        b.losses - a.losses || a.marketKey.localeCompare(b.marketKey),
    );

  return {
    displayed: evaluated.length,
    settled,
    wins,
    losses,
    pending,
    voided,
    hitRate: settled > 0 ? wins / settled : null,
    failureByMarket,
    recent: evaluated.slice(0, Math.max(0, recentLimit)),
  };
}
