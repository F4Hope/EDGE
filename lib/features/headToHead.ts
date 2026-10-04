import type { HeadToHeadFeatures } from "./types";

export type HeadToHeadEvent = {
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

export function emptyHeadToHead(): HeadToHeadFeatures {
  return {
    sampleSize: 0,
    participantAWins: 0,
    draws: 0,
    participantBWins: 0,
    participantAWinRate: null,
    participantBWinRate: null,
    averageParticipantAScore: null,
    averageParticipantBScore: null,
  };
}

export function summarizeHeadToHead(
  events: HeadToHeadEvent[],
  participantAId: string | null | undefined,
  participantBId: string | null | undefined,
  limit = 10,
): HeadToHeadFeatures {
  if (
    !participantAId ||
    !participantBId ||
    participantAId === participantBId ||
    limit < 1
  ) {
    return emptyHeadToHead();
  }

  let sampleSize = 0;
  let participantAWins = 0;
  let draws = 0;
  let participantBWins = 0;
  let totalAScore = 0;
  let totalBScore = 0;

  for (const event of events) {
    if (sampleSize >= limit) break;
    if (event.resultStatus !== "FINAL") continue;

    const aIsHome =
      event.homeParticipantId === participantAId &&
      event.awayParticipantId === participantBId;
    const aIsAway =
      event.awayParticipantId === participantAId &&
      event.homeParticipantId === participantBId;

    if (!aIsHome && !aIsAway) continue;

    const score = scoreFromPayload(event.payload);
    if (!score) continue;

    const aScore = aIsHome ? score.home : score.away;
    const bScore = aIsHome ? score.away : score.home;

    sampleSize += 1;
    totalAScore += aScore;
    totalBScore += bScore;

    if (aScore > bScore) participantAWins += 1;
    else if (bScore > aScore) participantBWins += 1;
    else draws += 1;
  }

  if (sampleSize === 0) return emptyHeadToHead();

  return {
    sampleSize,
    participantAWins,
    draws,
    participantBWins,
    participantAWinRate: rounded(participantAWins / sampleSize),
    participantBWinRate: rounded(participantBWins / sampleSize),
    averageParticipantAScore: rounded(totalAScore / sampleSize),
    averageParticipantBScore: rounded(totalBScore / sampleSize),
  };
}
