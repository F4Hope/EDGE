import { providerParticipantNamesEquivalent } from "../data/eventIdentity";

export type SettledWinner = "home" | "away" | "draw";
export type SettledSelectionOutcome = "win" | "loss";

type PredictionSelection = {
  selectionKey: string;
  explanation?: unknown;
  marketKey?: string | null;
  market?: {
    key?: string | null;
  } | null;
};

type SettledScore = {
  home: number;
  away: number;
};

type SelectionRole =
  | SettledWinner
  | "over"
  | "under"
  | "home_draw"
  | "home_away"
  | "draw_away";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function predictionSelectionName(explanation: unknown): string | null {
  const value = record(explanation)?.selectionName;
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function predictionPoint(explanation: unknown): number | null {
  const value = record(explanation)?.point;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function settledSelectionRole(
  selectionName: string,
  participants: { home: string | null; away: string | null },
): SettledWinner | null {
  const label = normalized(selectionName);

  if (label === "draw" || label === "tie" || label === "x") {
    return "draw";
  }
  if (label === "home" || label === "1") return "home";
  if (label === "away" || label === "2") return "away";

  if (
    participants.home &&
    providerParticipantNamesEquivalent(selectionName, participants.home)
  ) {
    return "home";
  }
  if (
    participants.away &&
    providerParticipantNamesEquivalent(selectionName, participants.away)
  ) {
    return "away";
  }

  return null;
}

function selectionRole(
  selectionName: string,
  participants: { home: string | null; away: string | null },
): SelectionRole | null {
  const direct = settledSelectionRole(selectionName, participants);
  if (direct) return direct;

  const label = normalized(selectionName);

  if (label === "over" || label.startsWith("over ")) return "over";
  if (label === "under" || label.startsWith("under ")) return "under";

  if (
    label === "home draw" ||
    label === "home or draw" ||
    label === "1x"
  ) {
    return "home_draw";
  }
  if (
    label === "home away" ||
    label === "home or away" ||
    label === "12"
  ) {
    return "home_away";
  }
  if (
    label === "draw away" ||
    label === "away draw" ||
    label === "draw or away" ||
    label === "away or draw" ||
    label === "x2"
  ) {
    return "draw_away";
  }

  return null;
}

function winnerFromPayload(payload: unknown): SettledWinner | null {
  const winner = record(payload)?.winner;
  return winner === "home" || winner === "away" || winner === "draw"
    ? winner
    : null;
}

function scoreFromPayload(payload: unknown): SettledScore | null {
  const score = record(record(payload)?.score);
  const home = score?.home;
  const away = score?.away;

  return typeof home === "number" &&
    Number.isFinite(home) &&
    typeof away === "number" &&
    Number.isFinite(away)
    ? { home, away }
    : null;
}

function explicitOutcome(
  payload: unknown,
  selectionKey: string,
): 0 | 1 | null {
  const outcomes = record(record(payload)?.selectionOutcomes);
  if (!outcomes) return null;

  const value = outcomes[selectionKey];
  if (value === true || value === 1 || value === "win") return 1;
  if (value === false || value === 0 || value === "loss") return 0;
  return null;
}

function marketKey(prediction: PredictionSelection): string {
  const direct = prediction.marketKey?.trim() || prediction.market?.key?.trim();
  if (direct) return direct;

  const prefix = prediction.selectionKey.split(":")[0]?.trim();
  return prefix || "h2h";
}

function splitAsianLine(point: number): number[] {
  const sign = point < 0 ? -1 : 1;
  const absolute = Math.abs(point);
  const base = Math.floor(absolute);
  const fraction = Number((absolute - base).toFixed(4));

  if (Math.abs(fraction - 0.25) < 1e-6) {
    return sign > 0
      ? [base, base + 0.5]
      : [-base, -(base + 0.5)];
  }

  if (Math.abs(fraction - 0.75) < 1e-6) {
    return sign > 0
      ? [base + 0.5, base + 1]
      : [-(base + 0.5), -(base + 1)];
  }

  return [point];
}

function combineLineOutcomes(
  outcomes: Array<"win" | "loss" | "push">,
): SettledSelectionOutcome | null {
  if (outcomes.length === 0) return null;
  if (outcomes.every((outcome) => outcome === "win")) return "win";
  if (outcomes.every((outcome) => outcome === "loss")) return "loss";

  // Pushes, half-wins and half-losses are deliberately omitted from the
  // binary accuracy report rather than misclassified as a full win/loss.
  return null;
}

function totalsOutcome(
  role: "over" | "under",
  point: number,
  score: SettledScore,
): SettledSelectionOutcome | null {
  const total = score.home + score.away;
  const lineOutcomes = splitAsianLine(point).map((line) => {
    if (total === line) return "push" as const;
    if (role === "over") return total > line ? "win" as const : "loss" as const;
    return total < line ? "win" as const : "loss" as const;
  });

  return combineLineOutcomes(lineOutcomes);
}

function spreadOutcome(
  role: "home" | "away",
  point: number,
  score: SettledScore,
): SettledSelectionOutcome | null {
  const selectedScore = role === "home" ? score.home : score.away;
  const opponentScore = role === "home" ? score.away : score.home;

  const lineOutcomes = splitAsianLine(point).map((line) => {
    const margin = selectedScore - opponentScore + line;
    if (margin === 0) return "push" as const;
    return margin > 0 ? "win" as const : "loss" as const;
  });

  return combineLineOutcomes(lineOutcomes);
}

function doubleChanceOutcome(
  role: "home_draw" | "home_away" | "draw_away",
  winner: SettledWinner,
): SettledSelectionOutcome {
  if (role === "home_draw") {
    return winner === "home" || winner === "draw" ? "win" : "loss";
  }
  if (role === "home_away") {
    return winner === "home" || winner === "away" ? "win" : "loss";
  }
  return winner === "draw" || winner === "away" ? "win" : "loss";
}

function selectionOutcome(
  prediction: PredictionSelection,
  winner: SettledWinner | null,
  participants: { home: string | null; away: string | null },
  score: SettledScore | null,
): SettledSelectionOutcome | null {
  const selectionName = predictionSelectionName(prediction.explanation);
  if (!selectionName) return null;

  const role = selectionRole(selectionName, participants);
  if (!role) return null;

  const key = marketKey(prediction);
  if (key === "double_chance") {
    if (
      !winner ||
      (role !== "home_draw" && role !== "home_away" && role !== "draw_away")
    ) {
      return null;
    }
    return doubleChanceOutcome(role, winner);
  }

  if (key === "totals") {
    const point = predictionPoint(prediction.explanation);
    if (!score || point === null || (role !== "over" && role !== "under")) {
      return null;
    }
    return totalsOutcome(role, point, score);
  }

  if (key === "spreads") {
    const point = predictionPoint(prediction.explanation);
    if (!score || point === null || (role !== "home" && role !== "away")) {
      return null;
    }
    return spreadOutcome(role, point, score);
  }

  if (!winner || (role !== "home" && role !== "away" && role !== "draw")) {
    return null;
  }

  return role === winner ? "win" : "loss";
}

export function buildSelectionOutcomes(
  predictions: PredictionSelection[],
  winner: SettledWinner | null,
  participants: { home: string | null; away: string | null },
  score: SettledScore | null = null,
): Record<string, SettledSelectionOutcome> {
  const outcomes: Record<string, SettledSelectionOutcome> = {};

  for (const prediction of predictions) {
    const outcome = selectionOutcome(
      prediction,
      winner,
      participants,
      score,
    );
    if (outcome !== null) {
      outcomes[prediction.selectionKey] = outcome;
    }
  }

  return outcomes;
}

export function resolveSelectionOutcome(
  payload: unknown,
  prediction: PredictionSelection,
  participants: { home: string | null; away: string | null },
): 0 | 1 | null {
  const stored = explicitOutcome(payload, prediction.selectionKey);
  if (stored !== null) return stored;

  const outcome = selectionOutcome(
    prediction,
    winnerFromPayload(payload),
    participants,
    scoreFromPayload(payload),
  );

  return outcome === "win" ? 1 : outcome === "loss" ? 0 : null;
}
