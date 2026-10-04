export type MovementSnapshot = {
  bookmakerKey: string | null;
  selectionKey: string;
  selectionName: string;
  point: number | null;
  decimalOdds: number;
  capturedAt: Date;
};

export type SelectionMovement = {
  bookmakerKey: string | null;
  selectionKey: string;
  selectionName: string;
  point: number | null;
  openingOdds: number;
  currentOdds: number;
  closingOdds: number | null;
  openingImpliedProbability: number;
  currentImpliedProbability: number;
  impliedProbabilityChange: number;
  relativeOddsChange: number;
  durationMinutes: number;
  direction: "SHORTENING" | "DRIFTING" | "FLAT";
  rapid: boolean;
};

export type MarketMovementSummary = {
  movements: SelectionMovement[];
  currentPriceDispersion: number | null;
  flagged: boolean;
  flags: string[];
};

function quoteKey(snapshot: MovementSnapshot): string {
  return [
    snapshot.bookmakerKey ?? "unknown",
    snapshot.selectionKey,
    snapshot.point ?? "na",
  ].join("|");
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

export function analyzeMarketMovement(
  snapshots: MovementSnapshot[],
  eventStart: Date,
): MarketMovementSummary {
  const grouped = new Map<string, MovementSnapshot[]>();

  for (const snapshot of snapshots) {
    if (!Number.isFinite(snapshot.decimalOdds) || snapshot.decimalOdds <= 1) {
      continue;
    }
    const key = quoteKey(snapshot);
    const group = grouped.get(key) ?? [];
    group.push(snapshot);
    grouped.set(key, group);
  }

  const movements: SelectionMovement[] = [];

  for (const group of grouped.values()) {
    group.sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    const opening = group[0];
    const current = group[group.length - 1];
    const closingCandidates = group.filter(
      (snapshot) => snapshot.capturedAt <= eventStart,
    );
    const closing =
      eventStart <= new Date()
        ? closingCandidates[closingCandidates.length - 1] ?? null
        : null;

    const openingImplied = 1 / opening.decimalOdds;
    const currentImplied = 1 / current.decimalOdds;
    const relativeOddsChange =
      (current.decimalOdds - opening.decimalOdds) / opening.decimalOdds;
    const impliedProbabilityChange = currentImplied - openingImplied;
    const durationMinutes = Math.max(
      0,
      (current.capturedAt.getTime() - opening.capturedAt.getTime()) / 60_000,
    );

    const direction =
      Math.abs(relativeOddsChange) < 0.005
        ? "FLAT"
        : relativeOddsChange < 0
          ? "SHORTENING"
          : "DRIFTING";
    const rapid =
      durationMinutes > 0 &&
      durationMinutes <= 180 &&
      Math.abs(impliedProbabilityChange) >= 0.05;

    movements.push({
      bookmakerKey: opening.bookmakerKey,
      selectionKey: opening.selectionKey,
      selectionName: opening.selectionName,
      point: opening.point,
      openingOdds: opening.decimalOdds,
      currentOdds: current.decimalOdds,
      closingOdds: closing?.decimalOdds ?? null,
      openingImpliedProbability: round(openingImplied),
      currentImpliedProbability: round(currentImplied),
      impliedProbabilityChange: round(impliedProbabilityChange),
      relativeOddsChange: round(relativeOddsChange),
      durationMinutes: round(durationMinutes, 2),
      direction,
      rapid,
    });
  }

  const latestBySelection = new Map<string, number[]>();
  for (const movement of movements) {
    const key = [
      movement.selectionKey,
      movement.point ?? "na",
    ].join("|");
    const prices = latestBySelection.get(key) ?? [];
    prices.push(movement.currentOdds);
    latestBySelection.set(key, prices);
  }

  const dispersions: number[] = [];
  for (const prices of latestBySelection.values()) {
    if (prices.length < 2) continue;
    const mean = prices.reduce((sum, value) => sum + value, 0) / prices.length;
    if (mean <= 0) continue;
    dispersions.push((Math.max(...prices) - Math.min(...prices)) / mean);
  }

  const currentPriceDispersion =
    dispersions.length === 0
      ? null
      : round(
          dispersions.reduce((sum, value) => sum + value, 0) /
            dispersions.length,
        );

  const flags: string[] = [];
  if (movements.some((movement) => movement.rapid)) {
    flags.push("Rapid price movement detected.");
  }
  if (
    currentPriceDispersion !== null &&
    currentPriceDispersion >= 0.08
  ) {
    flags.push("Current bookmaker price dispersion is elevated.");
  }

  return {
    movements,
    currentPriceDispersion,
    flagged: flags.length > 0,
    flags,
  };
}
