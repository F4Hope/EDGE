import { createHash } from "node:crypto";
import type { getDb } from "@/lib/prisma";
import { buildMarketFeatures } from "@/lib/features/market";
import {
  FEATURE_SCHEMA_VERSION,
  type FeatureVector,
} from "@/lib/features/types";
import {
  buildMarketPredictionCandidates,
  PREDICTION_MODEL_VERSION,
} from "./model";

type EdgeDb = ReturnType<typeof getDb>;

export type PredictionGenerationResult = {
  eventId: string;
  created: number;
  reused: number;
  modelRunId: string | null;
  reason: string | null;
};

function isFeatureVector(value: unknown): value is FeatureVector {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FeatureVector>;
  return (
    candidate.schemaVersion === FEATURE_SCHEMA_VERSION &&
    typeof candidate.eventId === "string" &&
    typeof candidate.quality?.overall === "number" &&
    Array.isArray(candidate.market?.markets)
  );
}

function pointNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function samePoint(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-9;
}

function inputFingerprint(parts: object): string {
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex");
}

function explanationFingerprint(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const fingerprint = (value as Record<string, unknown>).inputFingerprint;
  return typeof fingerprint === "string" ? fingerprint : null;
}

export async function generatePredictionsForEvent(
  db: EdgeDb,
  eventId: string,
  asOf = new Date(),
): Promise<PredictionGenerationResult> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      sport: { select: { id: true, key: true } },
      features: {
        where: {
          modelVersion: FEATURE_SCHEMA_VERSION,
          computedAt: { lte: asOf },
        },
        orderBy: { computedAt: "desc" },
        take: 1,
        select: {
          id: true,
          values: true,
          computedAt: true,
        },
      },
      markets: {
        where: {
          key: { in: ["h2h", "totals", "spreads", "double_chance"] },
          status: "OPEN",
        },
        include: {
          oddsSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 500,
            select: {
              id: true,
              bookmakerKey: true,
              selectionKey: true,
              selectionName: true,
              point: true,
              decimalOdds: true,
              capturedAt: true,
            },
          },
        },
      },
    },
  });

  if (!event) {
    return {
      eventId,
      created: 0,
      reused: 0,
      modelRunId: null,
      reason: "event-not-found",
    };
  }

  if (event.startTime <= asOf) {
    return {
      eventId,
      created: 0,
      reused: 0,
      modelRunId: null,
      reason: "event-already-started",
    };
  }

  const featureRow = event.features[0];
  if (!featureRow || !isFeatureVector(featureRow.values)) {
    return {
      eventId,
      created: 0,
      reused: 0,
      modelRunId: null,
      reason: "feature-vector-unavailable",
    };
  }

  if (featureRow.computedAt >= event.startTime) {
    return {
      eventId,
      created: 0,
      reused: 0,
      modelRunId: null,
      reason: "feature-vector-not-pre-event",
    };
  }

  const prepared: Array<{
    market: (typeof event.markets)[number];
    candidates: ReturnType<typeof buildMarketPredictionCandidates>;
    fingerprint: string;
  }> = [];
  let reused = 0;

  for (const market of event.markets) {
    if (market.oddsSnapshots.length === 0) continue;

    const summary = buildMarketFeatures(
      [
        {
          key: market.key,
          oddsSnapshots: market.oddsSnapshots.map((snapshot) => ({
            bookmakerKey: snapshot.bookmakerKey,
            selectionKey: snapshot.selectionKey,
            selectionName: snapshot.selectionName,
            point: snapshot.point,
            decimalOdds: snapshot.decimalOdds,
            capturedAt: snapshot.capturedAt,
          })),
        },
      ],
      event.startTime,
    ).markets[0];

    if (!summary) continue;

    const candidates = buildMarketPredictionCandidates(
      featureRow.values,
      summary,
    );
    if (candidates.length === 0) continue;

    const latestCapturedAt = market.oddsSnapshots.reduce(
      (latest, snapshot) =>
        snapshot.capturedAt > latest ? snapshot.capturedAt : latest,
      market.oddsSnapshots[0].capturedAt,
    );

    if (latestCapturedAt >= event.startTime) continue;

    const fingerprint = inputFingerprint({
      eventId,
      featureId: featureRow.id,
      featureComputedAt: featureRow.computedAt.toISOString(),
      marketId: market.id,
      latestCapturedAt: latestCapturedAt.toISOString(),
      modelVersion: PREDICTION_MODEL_VERSION,
    });

    const existing = await db.prediction.findFirst({
      where: {
        eventId,
        marketId: market.id,
        modelRun: { modelVersion: PREDICTION_MODEL_VERSION },
      },
      orderBy: { createdAt: "desc" },
      select: { explanation: true },
    });

    if (explanationFingerprint(existing?.explanation) === fingerprint) {
      reused += candidates.length;
      continue;
    }

    prepared.push({ market, candidates, fingerprint });
  }

  if (prepared.length === 0) {
    return {
      eventId,
      created: 0,
      reused,
      modelRunId: null,
      reason: reused > 0 ? "current-inputs-already-scored" : "no-eligible-featured-market",
    };
  }

  const modelRun = await db.modelRun.create({
    data: {
      sportId: event.sport.id,
      modelVersion: PREDICTION_MODEL_VERSION,
      status: "RUNNING",
      parameters: {
        modelClass: "transparent-market-anchored-featured-baseline",
        featureSchemaVersion: FEATURE_SCHEMA_VERSION,
        validationGate: "UNVALIDATED_BASELINE",
        bettableEnabled: false,
        generatedAt: asOf.toISOString(),
      },
    },
    select: { id: true },
  });

  let created = 0;

  try {
    for (const item of prepared) {
      for (const candidate of item.candidates) {
        const snapshot = item.market.oddsSnapshots.find(
          (row) =>
            row.selectionName.trim().toLowerCase() ===
              candidate.selectionName.trim().toLowerCase() &&
            samePoint(pointNumber(row.point), candidate.point),
        );

        if (!snapshot) continue;

        await db.prediction.create({
          data: {
            eventId,
            marketId: item.market.id,
            modelRunId: modelRun.id,
            selectionKey: snapshot.selectionKey,
            modelProbability: candidate.modelProbability,
            impliedProbability: candidate.impliedProbability,
            estimatedEdge: candidate.estimatedEdge,
            estimatedValue: candidate.estimatedValue,
            edgeScore: null,
            risk: candidate.risk,
            status: candidate.status,
            dataQuality: candidate.dataQuality,
            modelAgreement: candidate.modelAgreement,
            explanation: {
              inputFingerprint: item.fingerprint,
              modelClass: "transparent-market-anchored-featured-baseline",
              validationState: "UNVALIDATED_BASELINE",
              bettableEnabled: false,
              selectionName: candidate.selectionName,
              point: candidate.point,
              bookmakerCount: candidate.bookmakerCount,
              bestDecimalOdds: candidate.bestDecimalOdds,
              marketProbability: candidate.marketProbability,
              evidence: candidate.evidence,
            },
          },
        });
        created += 1;
      }
    }

    await db.modelRun.update({
      where: { id: modelRun.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await db.modelRun.update({
      where: { id: modelRun.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
      },
    });
    throw error;
  }

  return {
    eventId,
    created,
    reused,
    modelRunId: modelRun.id,
    reason: created > 0 ? null : "no-selection-key-match",
  };
}
