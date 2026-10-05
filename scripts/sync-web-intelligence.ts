import { createHash } from "node:crypto";
import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import {
  GOOGLE_SEARCH_INTELLIGENCE_SOURCE,
  GoogleSearchGroundingClient,
} from "../lib/intelligence/googleSearchGrounding";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const CHECKPOINT_PROVIDER = "gemini-google-search";
const CHECKPOINT_SCOPE = "web-intelligence:events";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveInt(
  value: string | undefined,
  fallback: number,
  max: number,
  label: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${label} must be an integer from 1 to ${max}.`);
  }
  return parsed;
}

function participant(event: {
  homeTeam: { name: string } | null;
  awayTeam: { name: string } | null;
  homePlayer: { fullName: string } | null;
  awayPlayer: { fullName: string } | null;
}): { home: string | null; away: string | null } {
  return {
    home: event.homeTeam?.name ?? event.homePlayer?.fullName ?? null,
    away: event.awayTeam?.name ?? event.awayPlayer?.fullName ?? null,
  };
}

function fingerprint(input: {
  eventId: string;
  type: string;
  headline: string;
  urls: string[];
}): string {
  return createHash("sha256")
    .update(
      [
        GOOGLE_SEARCH_INTELLIGENCE_SOURCE,
        input.eventId,
        input.type,
        input.headline.trim().toLowerCase(),
        ...input.urls.sort(),
      ].join("|"),
    )
    .digest("hex");
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.log("Web intelligence sync skipped.", {
      reason: "GEMINI_API_KEY is not configured",
      source: GOOGLE_SEARCH_INTELLIGENCE_SOURCE,
    });
    return;
  }

  const model =
    process.env.GEMINI_WEB_INTELLIGENCE_MODEL?.trim() || "gemini-3.8-flash";
  const hours = positiveInt(
    getArg("hours") ?? process.env.WEB_INTELLIGENCE_FORWARD_HOURS,
    24,
    72,
    "WEB_INTELLIGENCE_FORWARD_HOURS",
  );
  const maxEvents = positiveInt(
    getArg("max-events") ?? process.env.WEB_INTELLIGENCE_MAX_EVENTS,
    6,
    20,
    "WEB_INTELLIGENCE_MAX_EVENTS",
  );
  const freshnessHours = positiveInt(
    process.env.WEB_INTELLIGENCE_REFRESH_HOURS,
    4,
    24,
    "WEB_INTELLIGENCE_REFRESH_HOURS",
  );

  const client = new GoogleSearchGroundingClient(apiKey, model);
  const db = getDb();
  const now = new Date();
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const freshAfter = new Date(
    now.getTime() - freshnessHours * 60 * 60 * 1000,
  );

  let searchedEvents = 0;
  let groundedEvents = 0;
  let signalsUpserted = 0;
  let noReliableSignals = 0;
  let skippedFresh = 0;
  let skippedMissingParticipants = 0;
  let failedEvents = 0;

  try {
    await db.syncCheckpoint.upsert({
      where: {
        provider_scope: {
          provider: CHECKPOINT_PROVIDER,
          scope: CHECKPOINT_SCOPE,
        },
      },
      update: {
        lastStartedAt: now,
        lastStatus: "RUNNING",
      },
      create: {
        provider: CHECKPOINT_PROVIDER,
        scope: CHECKPOINT_SCOPE,
        lastStartedAt: now,
        lastStatus: "RUNNING",
      },
    });

    const events = await db.event.findMany({
      where: {
        startTime: { gt: now, lte: to },
        status: { notIn: ["LIVE", "COMPLETED", "CANCELLED", "POSTPONED"] },
      },
      orderBy: { startTime: "asc" },
      take: 80,
      include: {
        sport: { select: { key: true } },
        league: { select: { name: true } },
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        homePlayer: { select: { fullName: true } },
        awayPlayer: { select: { fullName: true } },
        markets: {
          where: { key: "h2h", status: "OPEN" },
          select: {
            oddsSnapshots: {
              take: 1,
              select: { id: true },
            },
          },
        },
        intelligenceSignals: {
          where: {
            source: GOOGLE_SEARCH_INTELLIGENCE_SOURCE,
            occurredAt: { gte: freshAfter },
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    const prioritized = [...events].sort((a, b) => {
      const aHasOdds = a.markets.some(
        (market) => market.oddsSnapshots.length > 0,
      );
      const bHasOdds = b.markets.some(
        (market) => market.oddsSnapshots.length > 0,
      );

      if (aHasOdds !== bHasOdds) return aHasOdds ? 1 : -1;
      return a.startTime.getTime() - b.startTime.getTime();
    });

    const selected = prioritized
      .filter((event) => {
        if (event.intelligenceSignals.length > 0) {
          skippedFresh += 1;
          return false;
        }

        const names = participant(event);
        if (!names.home || !names.away) {
          skippedMissingParticipants += 1;
          return false;
        }

        return true;
      })
      .slice(0, maxEvents);

    for (const event of selected) {
      const names = participant(event);
      if (!names.home || !names.away) continue;

      searchedEvents += 1;

      try {
        const result = await client.researchEvent({
          sport: event.sport.key,
          league: event.league.name,
          home: names.home,
          away: names.away,
          startsAt: event.startTime.toISOString(),
        });

        if (result.signals.length === 0 || result.citations.length === 0) {
          noReliableSignals += 1;
          continue;
        }

        groundedEvents += 1;
        const citationUrls = result.citations.map((citation) => citation.url);
        const expiresAt = minDate(
          new Date(now.getTime() + freshnessHours * 60 * 60 * 1000),
          new Date(event.startTime.getTime() + 2 * 60 * 60 * 1000),
        );

        for (const signal of result.signals) {
          const signalFingerprint = fingerprint({
            eventId: event.id,
            type: signal.type,
            headline: signal.headline,
            urls: [...citationUrls],
          });

          await db.intelligenceSignal.upsert({
            where: { fingerprint: signalFingerprint },
            update: {
              eventId: event.id,
              type: signal.type,
              severity: signal.severity,
              source: GOOGLE_SEARCH_INTELLIGENCE_SOURCE,
              headline: signal.headline,
              summary: signal.summary,
              affectsHome: signal.affectsHome,
              affectsAway: signal.affectsAway,
              participant: signal.participant,
              occurredAt: now,
              expiresAt,
              metadata: {
                grounded: true,
                model,
                observedAt: now.toISOString(),
                searchQueries: result.searchQueries,
                citations: result.citations,
              },
            },
            create: {
              eventId: event.id,
              fingerprint: signalFingerprint,
              type: signal.type,
              severity: signal.severity,
              source: GOOGLE_SEARCH_INTELLIGENCE_SOURCE,
              headline: signal.headline,
              summary: signal.summary,
              affectsHome: signal.affectsHome,
              affectsAway: signal.affectsAway,
              participant: signal.participant,
              occurredAt: now,
              expiresAt,
              metadata: {
                grounded: true,
                model,
                observedAt: now.toISOString(),
                searchQueries: result.searchQueries,
                citations: result.citations,
              },
            },
          });

          signalsUpserted += 1;
        }
      } catch (error) {
        failedEvents += 1;
        console.error("Web intelligence event lookup failed.", {
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const completedAt = new Date();
    await db.syncCheckpoint.upsert({
      where: {
        provider_scope: {
          provider: CHECKPOINT_PROVIDER,
          scope: CHECKPOINT_SCOPE,
        },
      },
      update: {
        lastCompletedAt: completedAt,
        lastStatus: failedEvents > 0 ? "PARTIAL" : "COMPLETED",
        metadata: {
          model,
          hours,
          maxEvents,
          searchedEvents,
          groundedEvents,
          signalsUpserted,
          noReliableSignals,
          skippedFresh,
          skippedMissingParticipants,
          failedEvents,
        },
      },
      create: {
        provider: CHECKPOINT_PROVIDER,
        scope: CHECKPOINT_SCOPE,
        lastStartedAt: now,
        lastCompletedAt: completedAt,
        lastStatus: failedEvents > 0 ? "PARTIAL" : "COMPLETED",
        metadata: {
          model,
          hours,
          maxEvents,
          searchedEvents,
          groundedEvents,
          signalsUpserted,
          noReliableSignals,
          skippedFresh,
          skippedMissingParticipants,
          failedEvents,
        },
      },
    });

    console.log("Web intelligence sync complete.", {
      model,
      hours,
      maxEvents,
      searchedEvents,
      groundedEvents,
      signalsUpserted,
      noReliableSignals,
      skippedFresh,
      skippedMissingParticipants,
      failedEvents,
    });
  } catch (error) {
    await db.syncCheckpoint
      .upsert({
        where: {
          provider_scope: {
            provider: CHECKPOINT_PROVIDER,
            scope: CHECKPOINT_SCOPE,
          },
        },
        update: {
          lastStatus: "FAILED",
          metadata: {
            failedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          },
        },
        create: {
          provider: CHECKPOINT_PROVIDER,
          scope: CHECKPOINT_SCOPE,
          lastStartedAt: now,
          lastStatus: "FAILED",
          metadata: {
            failedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
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
  console.error("EDGE web intelligence sync failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
