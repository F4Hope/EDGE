import type { getDb } from "@/lib/prisma";
import type {
  ProviderResult,
  ResultProvider,
} from "@/lib/providers/resultTypes";
import type { SupportedSport } from "@/lib/providers/types";

type EdgeDb = ReturnType<typeof getDb>;

export type ResultSyncSummary = {
  provider: string;
  sport: SupportedSport;
  fetched: number;
  matched: number;
  finalized: number;
  voided: number;
  skipped: number;
};

function resultPayload(provider: string, result: ProviderResult) {
  return {
    source: {
      provider,
      externalId: result.providerId,
      status: result.sourceStatus,
    },
    score: {
      home: result.homeScore,
      away: result.awayScore,
    },
    winner: result.winner,
  };
}

export async function syncProviderResults(
  db: EdgeDb,
  provider: ResultProvider,
  sport: SupportedSport,
  from: Date,
  to: Date,
): Promise<ResultSyncSummary> {
  if (!provider.supportsResults(sport)) {
    throw new Error(provider.name + " does not support result ingestion for " + sport + ".");
  }

  const incoming = await provider.getResults({ sport, from, to });
  const unique = [
    ...new Map(incoming.map((result) => [result.providerId, result])).values(),
  ];

  let matched = 0;
  let finalized = 0;
  let voided = 0;
  let skipped = 0;

  for (const result of unique) {
    const source = await db.eventSource.findUnique({
      where: {
        provider_externalId: {
          provider: provider.name,
          externalId: result.providerId,
        },
      },
      select: { eventId: true },
    });

    if (!source) {
      skipped += 1;
      continue;
    }

    matched += 1;

    if (result.status === "final") {
      if (
        typeof result.homeScore !== "number" ||
        typeof result.awayScore !== "number"
      ) {
        skipped += 1;
        continue;
      }

      await db.$transaction([
        db.event.update({
          where: { id: source.eventId },
          data: { status: "COMPLETED" },
        }),
        db.result.upsert({
          where: { eventId: source.eventId },
          update: {
            status: "FINAL",
            completedAt: result.completedAt
              ? new Date(result.completedAt)
              : null,
            payload: resultPayload(provider.name, result),
          },
          create: {
            eventId: source.eventId,
            status: "FINAL",
            completedAt: result.completedAt
              ? new Date(result.completedAt)
              : null,
            payload: resultPayload(provider.name, result),
          },
        }),
      ]);

      finalized += 1;
      continue;
    }

    await db.$transaction([
      db.event.update({
        where: { id: source.eventId },
        data: { status: "CANCELLED" },
      }),
      db.result.upsert({
        where: { eventId: source.eventId },
        update: {
          status: "VOID",
          completedAt: result.completedAt
            ? new Date(result.completedAt)
            : null,
          payload: resultPayload(provider.name, result),
        },
        create: {
          eventId: source.eventId,
          status: "VOID",
          completedAt: result.completedAt
            ? new Date(result.completedAt)
            : null,
          payload: resultPayload(provider.name, result),
        },
      }),
    ]);

    voided += 1;
  }

  return {
    provider: provider.name,
    sport,
    fetched: incoming.length,
    matched,
    finalized,
    voided,
    skipped,
  };
}
