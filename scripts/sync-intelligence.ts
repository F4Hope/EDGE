import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import {
  normalizeApiSportsInjury,
  type ApiSportsInjuryRow,
} from "../lib/intelligence/apiSportsInjuries";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const BASE_URL = "https://v3.football.api-sports.io";
const PROVIDER = "api-sports";
const SCOPE = "injuries:football";
const MIN_REFRESH_MS = 4 * 60 * 60 * 1000;
const MAX_IDS_PER_REQUEST = 20;

type ApiSportsEnvelope<T> = {
  response?: T[];
  errors?: unknown;
};

function getArg(name: string): string | undefined {
  const prefix = "--" + name + "=";
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes("--" + name);
}

function positiveInt(
  value: string | undefined,
  fallback: number,
  max: number,
  label: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(label + " must be an integer from 1 to " + max + ".");
  }
  return parsed;
}

function hasApiErrors(errors: unknown): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(errors);
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function normalizedName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function requestInjuries(
  apiKey: string,
  fixtureIds: string[],
): Promise<ApiSportsInjuryRow[]> {
  const url = new URL("/injuries", BASE_URL);
  url.searchParams.set("ids", fixtureIds.join("-"));
  url.searchParams.set("timezone", "UTC");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-apisports-key": apiKey,
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      "API-Sports injuries request failed with HTTP " + response.status + ".",
    );
  }

  const body = (await response.json()) as ApiSportsEnvelope<ApiSportsInjuryRow>;
  if (hasApiErrors(body.errors)) {
    throw new Error("API-Sports returned an application error for injuries.");
  }
  if (!Array.isArray(body.response)) {
    throw new Error("API-Sports returned an invalid injuries response envelope.");
  }

  return body.response;
}

async function main() {
  const apiKey = process.env.API_SPORTS_KEY;
  if (!apiKey) {
    throw new Error(
      "API_SPORTS_KEY is not configured. Injury intelligence sync requires API-Sports.",
    );
  }

  const hours = positiveInt(getArg("hours"), 72, 336, "--hours");
  const limit = positiveInt(getArg("limit"), 60, 100, "--limit");
  const force = hasFlag("force");
  const db = getDb();
  const now = new Date();

  try {
    const checkpoint = await db.syncCheckpoint.findUnique({
      where: {
        provider_scope: {
          provider: PROVIDER,
          scope: SCOPE,
        },
      },
    });

    if (
      !force &&
      checkpoint?.lastCompletedAt &&
      now.getTime() - checkpoint.lastCompletedAt.getTime() < MIN_REFRESH_MS
    ) {
      console.log("Injury intelligence sync skipped.", {
        reason: "fresh-checkpoint",
        lastCompletedAt: checkpoint.lastCompletedAt.toISOString(),
        minimumRefreshHours: 4,
      });
      return;
    }

    await db.syncCheckpoint.upsert({
      where: {
        provider_scope: {
          provider: PROVIDER,
          scope: SCOPE,
        },
      },
      update: {
        lastStartedAt: now,
        lastStatus: "RUNNING",
      },
      create: {
        provider: PROVIDER,
        scope: SCOPE,
        lastStartedAt: now,
        lastStatus: "RUNNING",
      },
    });

    const events = await db.event.findMany({
      where: {
        sport: { key: "football" },
        startTime: {
          gte: new Date(now.getTime() - 6 * 60 * 60 * 1000),
          lte: new Date(now.getTime() + hours * 60 * 60 * 1000),
        },
        status: {
          notIn: ["COMPLETED", "CANCELLED", "POSTPONED"],
        },
        sources: {
          some: { provider: PROVIDER },
        },
      },
      include: {
        sources: {
          where: { provider: PROVIDER },
          select: { externalId: true },
          take: 1,
        },
        homeTeam: {
          select: { provider: true, externalId: true, name: true },
        },
        awayTeam: {
          select: { provider: true, externalId: true, name: true },
        },
      },
      orderBy: { startTime: "asc" },
      take: limit,
    });

    const fixtureEntries = events
      .map((event) => {
        const fixtureId = event.sources[0]?.externalId;
        return fixtureId ? { fixtureId, event } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const eventByFixture = new Map(
      fixtureEntries.map((entry) => [entry.fixtureId, entry.event]),
    );

    let apiCalls = 0;
    let providerRows = 0;
    let upserted = 0;
    let skipped = 0;

    for (const batch of chunks(fixtureEntries, MAX_IDS_PER_REQUEST)) {
      const rows = await requestInjuries(
        apiKey,
        batch.map((entry) => entry.fixtureId),
      );
      apiCalls += 1;
      providerRows += rows.length;

      for (const row of rows) {
        const signal = normalizeApiSportsInjury(row);
        if (!signal) {
          skipped += 1;
          continue;
        }

        const event = eventByFixture.get(signal.providerFixtureId);
        if (!event) {
          skipped += 1;
          continue;
        }

        const homeById =
          event.homeTeam?.provider === PROVIDER &&
          event.homeTeam.externalId === signal.providerTeamId;
        const awayById =
          event.awayTeam?.provider === PROVIDER &&
          event.awayTeam.externalId === signal.providerTeamId;
        const homeByName =
          Boolean(signal.teamName) &&
          normalizedName(event.homeTeam?.name) === normalizedName(signal.teamName);
        const awayByName =
          Boolean(signal.teamName) &&
          normalizedName(event.awayTeam?.name) === normalizedName(signal.teamName);

        const homeMatch = homeById || homeByName;
        const awayMatch = awayById || awayByName;
        const reliableSide = homeMatch !== awayMatch;

        const refreshExpiry = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const eventExpiry = new Date(
          event.startTime.getTime() + 6 * 60 * 60 * 1000,
        );
        const expiresAt =
          refreshExpiry < eventExpiry ? refreshExpiry : eventExpiry;

        await db.intelligenceSignal.upsert({
          where: { fingerprint: signal.fingerprint },
          update: {
            eventId: event.id,
            type: signal.type,
            severity: signal.severity,
            source: PROVIDER,
            headline: signal.headline,
            summary: signal.summary,
            affectsHome: reliableSide ? homeMatch : null,
            affectsAway: reliableSide ? awayMatch : null,
            participant: signal.playerName,
            occurredAt: now,
            expiresAt,
            metadata: {
              providerFixtureId: signal.providerFixtureId,
              providerPlayerId: signal.providerPlayerId,
              providerTeamId: signal.providerTeamId,
              teamName: signal.teamName,
              reportType: signal.reportType,
              reason: signal.reason,
              observedAt: now.toISOString(),
            },
          },
          create: {
            eventId: event.id,
            fingerprint: signal.fingerprint,
            type: signal.type,
            severity: signal.severity,
            source: PROVIDER,
            headline: signal.headline,
            summary: signal.summary,
            affectsHome: reliableSide ? homeMatch : null,
            affectsAway: reliableSide ? awayMatch : null,
            participant: signal.playerName,
            occurredAt: now,
            expiresAt,
            metadata: {
              providerFixtureId: signal.providerFixtureId,
              providerPlayerId: signal.providerPlayerId,
              providerTeamId: signal.providerTeamId,
              teamName: signal.teamName,
              reportType: signal.reportType,
              reason: signal.reason,
              observedAt: now.toISOString(),
            },
          },
        });

        upserted += 1;
      }
    }

    const completedAt = new Date();
    await db.syncCheckpoint.upsert({
      where: {
        provider_scope: {
          provider: PROVIDER,
          scope: SCOPE,
        },
      },
      update: {
        lastCompletedAt: completedAt,
        lastStatus: "COMPLETED",
        metadata: {
          fixtures: fixtureEntries.length,
          apiCalls,
          providerRows,
          upserted,
          skipped,
        },
      },
      create: {
        provider: PROVIDER,
        scope: SCOPE,
        lastStartedAt: now,
        lastCompletedAt: completedAt,
        lastStatus: "COMPLETED",
        metadata: {
          fixtures: fixtureEntries.length,
          apiCalls,
          providerRows,
          upserted,
          skipped,
        },
      },
    });

    console.log("Injury intelligence sync complete.", {
      fixtures: fixtureEntries.length,
      apiCalls,
      providerRows,
      upserted,
      skipped,
      refreshedAt: completedAt.toISOString(),
    });
  } catch (error) {
    await db.syncCheckpoint
      .upsert({
        where: {
          provider_scope: {
            provider: PROVIDER,
            scope: SCOPE,
          },
        },
        update: {
          lastStatus: "FAILED",
          metadata: {
            failedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : "Unknown error",
          },
        },
        create: {
          provider: PROVIDER,
          scope: SCOPE,
          lastStartedAt: now,
          lastStatus: "FAILED",
          metadata: {
            failedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : "Unknown error",
          },
        },
      })
      .catch(() => undefined);

    throw error;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE injury intelligence synchronization failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
