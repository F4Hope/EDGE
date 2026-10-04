export type IntelligenceImportRecord = {
  eventId: string;
  type:
    | "INJURY"
    | "SUSPENSION"
    | "LINEUP"
    | "WITHDRAWAL"
    | "SCHEDULE_CHANGE"
    | "POSTPONEMENT"
    | "WEATHER"
    | "NEWS";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  source: string;
  headline: string;
  summary?: string | null;
  affectsHome?: boolean | null;
  affectsAway?: boolean | null;
  participant?: string | null;
  occurredAt: string;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

const types = [
  "INJURY",
  "SUSPENSION",
  "LINEUP",
  "WITHDRAWAL",
  "SCHEDULE_CHANGE",
  "POSTPONEMENT",
  "WEATHER",
  "NEWS",
] as const;

const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Intelligence record is missing ${field}.`);
  }
  return value.trim();
}

function date(value: unknown, field: string, optional = false): string | null {
  if ((value === null || value === undefined || value === "") && optional) {
    return null;
  }
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`Intelligence record has invalid ${field}.`);
  }
  return new Date(value).toISOString();
}

export function validateIntelligenceRecord(
  value: unknown,
): IntelligenceImportRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Intelligence record must be an object.");
  }

  const item = value as Record<string, unknown>;
  const type = text(item.type, "type");
  const severity = text(item.severity, "severity");

  if (!types.includes(type as (typeof types)[number])) {
    throw new Error(`Unsupported intelligence type: ${type}`);
  }
  if (!severities.includes(severity as (typeof severities)[number])) {
    throw new Error(`Unsupported intelligence severity: ${severity}`);
  }

  return {
    eventId: text(item.eventId, "eventId"),
    type: type as IntelligenceImportRecord["type"],
    severity: severity as IntelligenceImportRecord["severity"],
    source: text(item.source, "source"),
    headline: text(item.headline, "headline"),
    summary:
      item.summary === null || item.summary === undefined
        ? null
        : text(item.summary, "summary"),
    affectsHome:
      typeof item.affectsHome === "boolean" ? item.affectsHome : null,
    affectsAway:
      typeof item.affectsAway === "boolean" ? item.affectsAway : null,
    participant:
      item.participant === null || item.participant === undefined
        ? null
        : text(item.participant, "participant"),
    occurredAt: date(item.occurredAt, "occurredAt") as string,
    expiresAt: date(item.expiresAt, "expiresAt", true),
    metadata:
      item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>)
        : null,
  };
}
