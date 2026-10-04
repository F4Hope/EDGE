import { getDb } from "@/lib/prisma";

export type ReadinessLevel = "READY" | "WARNING" | "BLOCKED" | "INFO";

export type ReadinessCheck = {
  key: string;
  label: string;
  level: ReadinessLevel;
  detail: string;
};

export type SystemCounts = {
  sports: number;
  events: number;
  markets: number;
  oddsSnapshots: number;
  features: number;
  results: number;
  intelligenceSignals: number;
};

export type SystemFreshness = {
  events: string | null;
  odds: string | null;
  features: string | null;
  results: string | null;
  intelligence: string | null;
  injurySync: string | null;
};

export type SystemSyncState = {
  provider: string;
  scope: string;
  status: string | null;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
};

export type SystemReadiness = {
  generatedAt: string;
  overall: "READY" | "DEGRADED";
  checks: ReadinessCheck[];
  counts: SystemCounts | null;
  freshness: SystemFreshness | null;
  syncs: SystemSyncState[];
  capabilities: {
    eventIngestion: boolean;
    oddsIngestion: boolean;
    resultIngestion: boolean;
    intelligenceIngestion: boolean;
    featureEngine: boolean;
    resultAudit: boolean;
    intelligenceSignals: boolean;
    movementDiagnostics: boolean;
    automatedWagering: false;
  };
};

function envCheck(
  key: string,
  label: string,
  configured: boolean,
  detailReady: string,
  detailMissing: string,
): ReadinessCheck {
  return {
    key,
    label,
    level: configured ? "READY" : "WARNING",
    detail: configured ? detailReady : detailMissing,
  };
}

export async function getSystemReadiness(): Promise<SystemReadiness> {
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const apiSportsConfigured = Boolean(process.env.API_SPORTS_KEY);
  const oddsApiConfigured = Boolean(process.env.ODDS_API_KEY);

  const checks: ReadinessCheck[] = [
    envCheck(
      "database-env",
      "Database configuration",
      databaseConfigured,
      "DATABASE_URL is configured server-side.",
      "DATABASE_URL is not configured. Database-backed screens will remain unavailable.",
    ),
    envCheck(
      "api-sports",
      "API-Sports",
      apiSportsConfigured,
      "API_SPORTS_KEY is configured server-side.",
      "API_SPORTS_KEY is not configured. Football/basketball event ingestion may fall back to another provider, and provider result/injury intelligence sync remains disabled.",
    ),
    envCheck(
      "odds-api",
      "The Odds API",
      oddsApiConfigured,
      "ODDS_API_KEY is configured server-side.",
      "ODDS_API_KEY is not configured. Live odds synchronization remains disabled.",
    ),
    {
      key: "wager-automation",
      label: "Automated wagering",
      level: "INFO",
      detail:
        "Not implemented. EDGE remains an intelligence/audit application and does not place or construct real-money wagers automatically.",
    },
  ];

  if (!databaseConfigured) {
    return {
      generatedAt: new Date().toISOString(),
      overall: "DEGRADED",
      checks,
      counts: null,
      freshness: null,
      syncs: [],
      capabilities: {
        eventIngestion: apiSportsConfigured || oddsApiConfigured,
        oddsIngestion: oddsApiConfigured,
        resultIngestion: false,
        intelligenceIngestion: false,
        featureEngine: false,
        resultAudit: false,
        intelligenceSignals: false,
        movementDiagnostics: false,
        automatedWagering: false,
      },
    };
  }

  try {
    const db = getDb();
    const [
      sports,
      events,
      markets,
      oddsSnapshots,
      features,
      results,
      intelligenceSignals,
      latestEvent,
      latestOdds,
      latestFeature,
      latestResult,
      latestIntelligence,
      injuryCheckpoint,
      syncRows,
    ] = await Promise.all([
      db.sport.count(),
      db.event.count(),
      db.market.count(),
      db.oddsSnapshot.count(),
      db.feature.count(),
      db.result.count(),
      db.intelligenceSignal.count(),
      db.event.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      db.oddsSnapshot.findFirst({
        orderBy: { capturedAt: "desc" },
        select: { capturedAt: true },
      }),
      db.feature.findFirst({
        orderBy: { computedAt: "desc" },
        select: { computedAt: true },
      }),
      db.result.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      db.intelligenceSignal.findFirst({
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
      db.syncCheckpoint.findUnique({
        where: {
          provider_scope: {
            provider: "api-sports",
            scope: "injuries:football",
          },
        },
        select: { lastCompletedAt: true },
      }),
      db.syncCheckpoint.findMany({
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          provider: true,
          scope: true,
          lastStatus: true,
          lastStartedAt: true,
          lastCompletedAt: true,
        },
      }),
    ]);

    const counts: SystemCounts = {
      sports,
      events,
      markets,
      oddsSnapshots,
      features,
      results,
      intelligenceSignals,
    };

    const freshness: SystemFreshness = {
      events: latestEvent?.updatedAt.toISOString() ?? null,
      odds: latestOdds?.capturedAt.toISOString() ?? null,
      features: latestFeature?.computedAt.toISOString() ?? null,
      results: latestResult?.updatedAt.toISOString() ?? null,
      intelligence: latestIntelligence?.occurredAt.toISOString() ?? null,
      injurySync: injuryCheckpoint?.lastCompletedAt?.toISOString() ?? null,
    };

    const syncs: SystemSyncState[] = syncRows.map((row) => ({
      provider: row.provider,
      scope: row.scope,
      status: row.lastStatus,
      lastStartedAt: row.lastStartedAt?.toISOString() ?? null,
      lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
    }));

    checks.push({
      key: "database-reachability",
      label: "Database reachability",
      level: "READY",
      detail: "PostgreSQL is reachable through Prisma.",
    });

    checks.push({
      key: "event-data",
      label: "Event dataset",
      level: events > 0 ? "READY" : "WARNING",
      detail:
        events > 0
          ? `${events} normalized events are stored.`
          : "Database is reachable but no normalized events are stored yet.",
    });

    checks.push({
      key: "odds-data",
      label: "Odds history",
      level: oddsSnapshots > 0 ? "READY" : "WARNING",
      detail:
        oddsSnapshots > 0
          ? `${oddsSnapshots} bookmaker snapshots are stored.`
          : "No bookmaker snapshots are stored yet.",
    });

    checks.push({
      key: "feature-data",
      label: "Feature snapshots",
      level: features > 0 ? "READY" : "WARNING",
      detail:
        features > 0
          ? `${features} feature snapshots are stored.`
          : "No Phase 6 feature snapshots have been calculated yet.",
    });

    return {
      generatedAt: new Date().toISOString(),
      overall: "READY",
      checks,
      counts,
      freshness,
      syncs,
      capabilities: {
        eventIngestion: apiSportsConfigured || oddsApiConfigured,
        oddsIngestion: oddsApiConfigured,
        resultIngestion: apiSportsConfigured,
        intelligenceIngestion: apiSportsConfigured,
        featureEngine: true,
        resultAudit: true,
        intelligenceSignals: true,
        movementDiagnostics: oddsSnapshots > 1,
        automatedWagering: false,
      },
    };
  } catch (error) {
    checks.push({
      key: "database-reachability",
      label: "Database reachability",
      level: "BLOCKED",
      detail:
        error instanceof Error
          ? `Database check failed: ${error.message}`
          : "Database check failed.",
    });

    return {
      generatedAt: new Date().toISOString(),
      overall: "DEGRADED",
      checks,
      counts: null,
      freshness: null,
      syncs: [],
      capabilities: {
        eventIngestion: apiSportsConfigured || oddsApiConfigured,
        oddsIngestion: oddsApiConfigured,
        resultIngestion: false,
        intelligenceIngestion: false,
        featureEngine: false,
        resultAudit: false,
        intelligenceSignals: false,
        movementDiagnostics: false,
        automatedWagering: false,
      },
    };
  }
}
