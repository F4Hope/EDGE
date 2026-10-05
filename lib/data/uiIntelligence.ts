import { getDb } from "@/lib/prisma";

const severityRank = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
} as const;

export type UiIntelligenceCitation = {
  url: string;
  title: string | null;
};

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
  citations: UiIntelligenceCitation[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function safeCitationUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function metadataCitations(value: unknown): UiIntelligenceCitation[] {
  const metadata = record(value);
  const citations = Array.isArray(metadata?.citations)
    ? metadata.citations
    : [];

  const unique = new Map<string, UiIntelligenceCitation>();

  for (const rawCitation of citations) {
    const citation = record(rawCitation);
    const url = safeCitationUrl(citation?.url);
    if (!url) continue;

    unique.set(url, {
      url,
      title:
        typeof citation?.title === "string" && citation.title.trim()
          ? citation.title.trim()
          : null,
    });
  }

  return [...unique.values()].slice(0, 6);
}

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
        citations: metadataCitations(row.metadata),
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
