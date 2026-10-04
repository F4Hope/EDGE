import { getDb } from "@/lib/prisma";
import {
  FEATURE_SCHEMA_VERSION,
  type FeatureVector,
} from "@/lib/features/types";

export type UiFeatureState = {
  feature: FeatureVector | null;
  computedAt: string | null;
  available: boolean;
  message: string | null;
};

function isFeatureVector(value: unknown): value is FeatureVector {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FeatureVector>;

  return (
    candidate.schemaVersion === FEATURE_SCHEMA_VERSION &&
    typeof candidate.eventId === "string" &&
    typeof candidate.sport === "string" &&
    typeof candidate.quality?.overall === "number" &&
    typeof candidate.form?.home?.sampleSize === "number" &&
    typeof candidate.form?.away?.sampleSize === "number" &&
    typeof candidate.headToHead?.sampleSize === "number" &&
    Array.isArray(candidate.sportSpecific?.available) &&
    Array.isArray(candidate.sportSpecific?.missing)
  );
}

export async function getUiFeatureForEvent(
  eventId: string,
): Promise<UiFeatureState> {
  try {
    const db = getDb();
    const row = await db.feature.findFirst({
      where: {
        eventId,
        modelVersion: FEATURE_SCHEMA_VERSION,
      },
      orderBy: { computedAt: "desc" },
      select: {
        values: true,
        computedAt: true,
      },
    });

    if (!row) {
      return {
        feature: null,
        computedAt: null,
        available: true,
        message: "No Phase 6 feature vector has been calculated for this event yet.",
      };
    }

    if (!isFeatureVector(row.values)) {
      return {
        feature: null,
        computedAt: row.computedAt.toISOString(),
        available: false,
        message: "Stored feature data does not match the current feature schema.",
      };
    }

    return {
      feature: row.values,
      computedAt: row.computedAt.toISOString(),
      available: true,
      message: null,
    };
  } catch (error) {
    return {
      feature: null,
      computedAt: null,
      available: false,
      message:
        error instanceof Error && error.message.includes("DATABASE_URL")
          ? "Database connection is not configured in this environment."
          : "The feature database is currently unavailable.",
    };
  }
}
