import { getDb } from "@/lib/prisma";

const severityRank = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
} as const;

export type UiIntelligenceSignal = {
  id: string;
  type: string;
  severity: keyof typeof severityRank;
  source: string;
  headline: string;
  summary: string | null;
  affectsHome: boolean | null;
  affectsAway: boolean | null;
  participant: string | null;
  occurredAt: string;
  expiresAt: string | null;
};

export async function getUiIntelligenceForEvent(
  eventId: string,
): Promise<{
  signals: UiIntelligenceSignal[];
  available: boolean;
  message: string | null;
}> {
  try {
    const now = new Date();
    const rows = await getDb().intelligenceSignal.findMany({
      where: {
        eventId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });

    const signals = rows
      .map((row) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        source: row.source,
        headline: row.headline,
        summary: row.summary,
        affectsHome: row.affectsHome,
        affectsAway: row.affectsAway,
        participant: row.participant,
        occurredAt: row.occurredAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() ?? null,
      }))
      .sort(
        (a, b) =>
          severityRank[b.severity] - severityRank[a.severity] ||
          b.occurredAt.localeCompare(a.occurredAt),
      );

    return {
      signals,
      available: true,
      message:
        signals.length === 0
          ? "No active news/injury intelligence has been recorded for this event."
          : null,
    };
  } catch (error) {
    return {
      signals: [],
      available: false,
      message:
        error instanceof Error && error.message.includes("DATABASE_URL")
          ? "Database connection is not configured in this environment."
          : "Sports intelligence data is currently unavailable.",
    };
  }
}
