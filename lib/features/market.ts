import type {
  MarketCoverageFeatures,
  MarketFeatureSet,
  MarketSelectionFeatures,
} from "./types";

type SnapshotInput = {
  bookmakerKey: string | null;
  selectionKey: string;
  selectionName: string;
  point: unknown;
  decimalOdds: unknown;
  capturedAt: Date;
};

type MarketInput = {
  key: string;
  oddsSnapshots: SnapshotInput[];
};

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function pointNumber(point: unknown): number | null {
  if (point === null || point === undefined) return null;
  const value = Number(point);
  return Number.isFinite(value) ? value : null;
}

function currentQuoteIdentity(snapshot: SnapshotInput): string {
  return [
    snapshot.bookmakerKey ?? "unknown-bookmaker",
    snapshot.selectionKey,
    pointNumber(snapshot.point) ?? "na",
  ].join("|");
}

function selectionIdentity(snapshot: SnapshotInput): string {
  return [
    snapshot.selectionName.trim().toLowerCase(),
    pointNumber(snapshot.point) ?? "na",
  ].join("|");
}

function latestCurrentQuotes(
  snapshots: SnapshotInput[],
): SnapshotInput[] {
  const latest = new Map<string, SnapshotInput>();

  for (const snapshot of snapshots) {
    const key = currentQuoteIdentity(snapshot);
    const existing = latest.get(key);
    if (!existing || snapshot.capturedAt > existing.capturedAt) {
      latest.set(key, snapshot);
    }
  }

  return [...latest.values()];
}

function selectionSummary(
  snapshots: SnapshotInput[],
): MarketSelectionFeatures[] {
  const grouped = new Map<string, SnapshotInput[]>();

  for (const snapshot of snapshots) {
    const key = selectionIdentity(snapshot);
    const group = grouped.get(key) ?? [];
    group.push(snapshot);
    grouped.set(key, group);
  }

  return [...grouped.values()]
    .map((group) => {
      const prices = group
        .map((snapshot) => Number(snapshot.decimalOdds))
        .filter((price) => Number.isFinite(price) && price > 1);

      if (prices.length === 0) return null;

      const meanDecimalOdds =
        prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const meanImpliedProbability =
        prices.reduce((sum, price) => sum + 1 / price, 0) / prices.length;

      return {
        selectionName: group[0].selectionName,
        point: pointNumber(group[0].point),
        bookmakerCount: new Set(
          group.map((snapshot) => snapshot.bookmakerKey ?? "unknown-bookmaker"),
        ).size,
        meanDecimalOdds: round(meanDecimalOdds, 4),
        bestDecimalOdds: round(Math.max(...prices), 4),
        meanImpliedProbability: round(meanImpliedProbability),
      };
    })
    .filter((value): value is MarketSelectionFeatures => value !== null)
    .sort((a, b) => {
      const byName = a.selectionName.localeCompare(b.selectionName);
      if (byName !== 0) return byName;
      return (a.point ?? 0) - (b.point ?? 0);
    });
}

function relativeDispersion(
  current: SnapshotInput[],
): number | null {
  const grouped = new Map<string, number[]>();

  for (const snapshot of current) {
    const price = Number(snapshot.decimalOdds);
    if (!Number.isFinite(price) || price <= 1) continue;

    const key = selectionIdentity(snapshot);
    const prices = grouped.get(key) ?? [];
    prices.push(price);
    grouped.set(key, prices);
  }

  const dispersions: number[] = [];
  for (const prices of grouped.values()) {
    if (prices.length < 2) continue;
    const mean = prices.reduce((sum, value) => sum + value, 0) / prices.length;
    if (mean <= 0) continue;
    dispersions.push((Math.max(...prices) - Math.min(...prices)) / mean);
  }

  if (dispersions.length === 0) return null;

  return round(
    dispersions.reduce((sum, value) => sum + value, 0) / dispersions.length,
  );
}

export function buildMarketFeatures(
  markets: MarketInput[],
  eventStart: Date,
): MarketFeatureSet {
  const summaries: MarketCoverageFeatures[] = [];
  const allSnapshots = markets.flatMap((market) => market.oddsSnapshots);
  const bookmakerKeys = new Set<string>();

  for (const snapshot of allSnapshots) {
    bookmakerKeys.add(snapshot.bookmakerKey ?? "unknown-bookmaker");
  }

  for (const market of markets) {
    const current = latestCurrentQuotes(market.oddsSnapshots);
    const currentBookmakers = new Set(
      current.map((snapshot) => snapshot.bookmakerKey ?? "unknown-bookmaker"),
    );

    summaries.push({
      key: market.key,
      snapshotCount: market.oddsSnapshots.length,
      bookmakerCount: currentBookmakers.size,
      currentQuoteCount: current.length,
      meanRelativePriceDispersion: relativeDispersion(current),
      selections: selectionSummary(current),
    });
  }

  const latestSnapshot = allSnapshots.reduce<Date | null>(
    (latest, snapshot) =>
      !latest || snapshot.capturedAt > latest ? snapshot.capturedAt : latest,
    null,
  );

  return {
    marketCount: summaries.length,
    snapshotCount: allSnapshots.length,
    bookmakerCount: bookmakerKeys.size,
    latestSnapshotMinutesBeforeStart: latestSnapshot
      ? round((eventStart.getTime() - latestSnapshot.getTime()) / 60_000, 2)
      : null,
    markets: summaries.sort((a, b) => a.key.localeCompare(b.key)),
  };
}
