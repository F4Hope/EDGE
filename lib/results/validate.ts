export type ResultImportRecord = {
  eventId: string;
  status: "PENDING" | "FINAL" | "VOID";
  completedAt?: string | null;
  payload?: Record<string, unknown> | null;
};

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Result record is missing ${field}.`);
  }
  return value.trim();
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`Result record has invalid ${field}.`);
  }
  return new Date(value).toISOString();
}

export function validateResultImportRecord(
  value: unknown,
): ResultImportRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Result record must be an object.");
  }

  const item = value as Record<string, unknown>;
  const status = requiredText(item.status, "status");
  if (!["PENDING", "FINAL", "VOID"].includes(status)) {
    throw new Error(`Unsupported result status: ${status}`);
  }

  return {
    eventId: requiredText(item.eventId, "eventId"),
    status: status as ResultImportRecord["status"],
    completedAt: optionalDate(item.completedAt, "completedAt"),
    payload:
      item.payload && typeof item.payload === "object"
        ? (item.payload as Record<string, unknown>)
        : null,
  };
}
