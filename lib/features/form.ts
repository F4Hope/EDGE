import type { ParticipantFormFeatures } from "./types";

export type FormEvent = {
  homeParticipantId: string | null;
  awayParticipantId: string | null;
  resultStatus: string | null;
  payload: unknown;
};

function scoreFromPayload(payload: unknown): {
  home: number;
  away: number;
} | null {
  if (!payload || typeof payload !== "object") return null;

  const score = (payload as Record<string, unknown>).score;
  if (!score || typeof score !== "object") return null;

  const home = (score as Record<string, unknown>).home;
  const away = (score as Record<string, unknown>).away;

  if (
    typeof home !== "number" ||
    !Number.isFinite(home) ||
    typeof away !== "number" ||
    !Number.isFinite(away)
  ) {
    return null;
  }

  return { home, away };
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

export function emptyParticipantForm(): ParticipantFormFeatures {
  return {
    sampleSize: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    winRate: null,
    averageFor: null,
    averageAgainst: null,
  };
}

export function summarizeParticipantForm(
  events: FormEvent[],
  participantId: string | null | undefined,
  limit = 10,
): ParticipantFormFeatures {
  if (!participantId || limit < 1) return emptyParticipantForm();

  let sampleSize = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let totalFor = 0;
  let totalAgainst = 0;

  for (const event of events) {
    if (sampleSize >= limit) break;
    if (event.resultStatus !== "FINAL") continue;

    const isHome = event.homeParticipantId === participantId;
    const isAway = event.awayParticipantId === participantId;
    if (isHome === isAway) continue;

    const score = scoreFromPayload(event.payload);
    if (!score) continue;

    const scored = isHome ? score.home : score.away;
    const conceded = isHome ? score.away : score.home;

    sampleSize += 1;
    totalFor += scored;
    totalAgainst += conceded;

    if (scored > conceded) wins += 1;
    else if (scored < conceded) losses += 1;
    else draws += 1;
  }

  if (sampleSize === 0) return emptyParticipantForm();

  return {
    sampleSize,
    wins,
    draws,
    losses,
    winRate: rounded(wins / sampleSize),
    averageFor: rounded(totalFor / sampleSize),
    averageAgainst: rounded(totalAgainst / sampleSize),
  };
}
