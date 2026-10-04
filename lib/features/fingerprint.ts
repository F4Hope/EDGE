import { createHash } from "node:crypto";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }

  return value;
}

export function stableFeatureJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function featureFingerprint(input: {
  eventId: string;
  schemaVersion: string;
  values: unknown;
}): string {
  return createHash("sha256")
    .update(
      [
        input.eventId,
        input.schemaVersion,
        stableFeatureJson(input.values),
      ].join("|"),
    )
    .digest("hex");
}
