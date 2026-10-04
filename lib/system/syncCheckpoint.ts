import type { getDb } from "@/lib/prisma";

type EdgeDb = ReturnType<typeof getDb>;
type CheckpointDb = Pick<EdgeDb, "syncCheckpoint">;

type CheckpointOptions<T> = {
  provider: string;
  scope: string;
  work: () => Promise<T>;
  metadata?: (result: T) => unknown;
};

function jsonSafe(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function checkpointScope(
  kind: "events" | "results" | "odds" | "features",
  sport?: string,
): string {
  return sport ? kind + ":" + sport : kind;
}

export async function withSyncCheckpoint<T>(
  db: CheckpointDb,
  options: CheckpointOptions<T>,
): Promise<T> {
  const startedAt = new Date();

  await db.syncCheckpoint.upsert({
    where: {
      provider_scope: {
        provider: options.provider,
        scope: options.scope,
      },
    },
    update: {
      lastStartedAt: startedAt,
      lastStatus: "RUNNING",
    },
    create: {
      provider: options.provider,
      scope: options.scope,
      lastStartedAt: startedAt,
      lastStatus: "RUNNING",
    },
  });

  try {
    const result = await options.work();
    const completedAt = new Date();
    const metadata = options.metadata
      ? jsonSafe(options.metadata(result))
      : undefined;

    await db.syncCheckpoint.upsert({
      where: {
        provider_scope: {
          provider: options.provider,
          scope: options.scope,
        },
      },
      update: {
        lastCompletedAt: completedAt,
        lastStatus: "COMPLETED",
        metadata,
      },
      create: {
        provider: options.provider,
        scope: options.scope,
        lastStartedAt: startedAt,
        lastCompletedAt: completedAt,
        lastStatus: "COMPLETED",
        metadata,
      },
    });

    return result;
  } catch (error) {
    const failedAt = new Date();
    const message = error instanceof Error ? error.message : "Unknown sync error";

    await db.syncCheckpoint
      .upsert({
        where: {
          provider_scope: {
            provider: options.provider,
            scope: options.scope,
          },
        },
        update: {
          lastStatus: "FAILED",
          metadata: {
            failedAt: failedAt.toISOString(),
            error: message,
          },
        },
        create: {
          provider: options.provider,
          scope: options.scope,
          lastStartedAt: startedAt,
          lastStatus: "FAILED",
          metadata: {
            failedAt: failedAt.toISOString(),
            error: message,
          },
        },
      })
      .catch(() => undefined);

    throw error;
  }
}
