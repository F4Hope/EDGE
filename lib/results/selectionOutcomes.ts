import { providerParticipantNamesEquivalent } from "../data/eventIdentity";

export type SettledWinner = "home" | "away" | "draw";
export type SettledSelectionOutcome = "win" | "loss";

type PredictionSelection = {
  selectionKey: string;
  explanation?: unknown;
};

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

function winnerFromPayload(payload: unknown): SettledWinner | null {
  const winner = record(payload)?.winner;
  return winner === "home" || winner === "away" || winner === "draw"
    ? winner
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

export function buildSelectionOutcomes(
  predictions: PredictionSelection[],
  winner: SettledWinner | null,
  participants: { home: string | null; away: string | null },
): Record<string, SettledSelectionOutcome> {
  if (!winner) return {};

  const outcomes: Record<string, SettledSelectionOutcome> = {};

  for (const prediction of predictions) {
    const selectionName = predictionSelectionName(prediction.explanation);
    if (!selectionName) continue;

    const role = settledSelectionRole(selectionName, participants);
    if (!role) continue;

    outcomes[prediction.selectionKey] = role === winner ? "win" : "loss";
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

  const winner = winnerFromPayload(payload);
  const selectionName = predictionSelectionName(prediction.explanation);
  if (!winner || !selectionName) return null;

  const role = settledSelectionRole(selectionName, participants);
  if (!role) return null;

  return role === winner ? 1 : 0;
}
