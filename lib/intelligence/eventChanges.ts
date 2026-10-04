import { createHash } from "node:crypto";

export type StoredEventState = {
  startTime: Date;
  status: string;
};

export type EventChangeSignal = {
  fingerprint: string;
  type: "SCHEDULE_CHANGE" | "POSTPONEMENT";
  severity: "MEDIUM" | "HIGH";
  headline: string;
  summary: string;
  occurredAt: Date;
  expiresAt: Date;
  metadata: Record<string, unknown>;
};

function fingerprint(parts: string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

export function buildEventChangeSignals(
  provider: string,
  providerEventId: string,
  previous: StoredEventState,
  next: StoredEventState,
  observedAt: Date,
): EventChangeSignal[] {
  const signals: EventChangeSignal[] = [];
  const startDeltaMs = Math.abs(
    next.startTime.getTime() - previous.startTime.getTime(),
  );

  if (startDeltaMs >= 60_000) {
    const deltaHours = startDeltaMs / (60 * 60 * 1000);
    const expiryBase = new Date(next.startTime.getTime() + 6 * 60 * 60 * 1000);
    const expiresAt =
      expiryBase > observedAt
        ? expiryBase
        : new Date(observedAt.getTime() + 6 * 60 * 60 * 1000);

    signals.push({
      fingerprint: fingerprint([
        provider,
        providerEventId,
        "schedule-change",
        previous.startTime.toISOString(),
        next.startTime.toISOString(),
      ]),
      type: "SCHEDULE_CHANGE",
      severity: deltaHours >= 24 ? "HIGH" : "MEDIUM",
      headline: "Event start time changed",
      summary:
        "Provider start time moved from " +
        previous.startTime.toISOString() +
        " to " +
        next.startTime.toISOString() +
        ".",
      occurredAt: observedAt,
      expiresAt,
      metadata: {
        provider,
        providerEventId,
        previousStartTime: previous.startTime.toISOString(),
        nextStartTime: next.startTime.toISOString(),
        deltaMinutes: Math.round(startDeltaMs / 60_000),
      },
    });
  }

  if (previous.status !== "POSTPONED" && next.status === "POSTPONED") {
    signals.push({
      fingerprint: fingerprint([
        provider,
        providerEventId,
        "postponed",
        observedAt.toISOString().slice(0, 13),
      ]),
      type: "POSTPONEMENT",
      severity: "HIGH",
      headline: "Event postponed",
      summary:
        "The provider changed this event from " +
        previous.status +
        " to POSTPONED.",
      occurredAt: observedAt,
      expiresAt: new Date(observedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      metadata: {
        provider,
        providerEventId,
        previousStatus: previous.status,
        nextStatus: next.status,
      },
    });
  }

  return signals;
}
