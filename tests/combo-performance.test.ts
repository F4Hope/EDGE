import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDisplayedComboPerformance,
  type DisplayedComboPerformanceRow,
} from "../lib/evaluation/comboPerformance";

function leg(
  index: number,
  result: null | {
    status: "PENDING" | "FINAL" | "VOID";
    payload: unknown;
  },
  selectionName = "Home",
): DisplayedComboPerformanceRow["selections"][number] {
  return {
    position: index,
    selection: {
      prediction: {
        selectionKey: "h2h:home:na",
        explanation: { selectionName },
        market: { key: "h2h" },
        event: {
          homeTeam: { name: "Home" },
          awayTeam: { name: "Away" },
          homePlayer: null,
          awayPlayer: null,
          result,
        },
      },
    },
  };
}

function combo(
  id: string,
  selections: DisplayedComboPerformanceRow["selections"],
): DisplayedComboPerformanceRow {
  return {
    id,
    targetOdds: 2,
    actualOdds: 2.4,
    riskMode: "BALANCED",
    createdAt: new Date("2026-10-07T08:00:00.000Z"),
    selections,
  };
}

test("displayed combo performance settles wins and losses", () => {
  const report = calculateDisplayedComboPerformance([
    combo("win", [
      leg(1, { status: "FINAL", payload: { winner: "home" } }),
      leg(2, { status: "FINAL", payload: { winner: "home" } }),
    ]),
    combo("loss", [
      leg(1, { status: "FINAL", payload: { winner: "away" } }),
      leg(2, null),
    ]),
  ]);

  assert.equal(report.displayed, 2);
  assert.equal(report.settled, 2);
  assert.equal(report.wins, 1);
  assert.equal(report.losses, 1);
  assert.equal(report.hitRate, 0.5);
  assert.deepEqual(report.recent.map((row) => row.outcome), ["WIN", "LOSS"]);
});

test("displayed combo performance keeps unresolved recommendations pending", () => {
  const report = calculateDisplayedComboPerformance([
    combo("pending", [
      leg(1, { status: "FINAL", payload: { winner: "home" } }),
      leg(2, null),
    ]),
  ]);

  assert.equal(report.pending, 1);
  assert.equal(report.settled, 0);
  assert.equal(report.hitRate, null);
  assert.equal(report.recent[0]?.outcome, "PENDING");
});

test("voided displayed combos are excluded from hit rate", () => {
  const report = calculateDisplayedComboPerformance([
    combo("void", [
      leg(1, { status: "FINAL", payload: { winner: "home" } }),
      leg(2, { status: "VOID", payload: null }),
    ]),
  ]);

  assert.equal(report.voided, 1);
  assert.equal(report.settled, 0);
  assert.equal(report.hitRate, null);
  assert.equal(report.recent[0]?.outcome, "VOID");
});

test("a settled losing leg makes the displayed combo a loss even with pending legs", () => {
  const report = calculateDisplayedComboPerformance([
    combo("dead", [
      leg(1, { status: "FINAL", payload: { winner: "away" } }),
      leg(2, null),
    ]),
  ]);

  assert.equal(report.losses, 1);
  assert.equal(report.pending, 0);
  assert.equal(report.recent[0]?.outcome, "LOSS");
});
