import { getDb } from "@/lib/prisma";
import { buildEventChangeSignals } from "@/lib/intelligence/eventChanges";
import type { DataProvider, ProviderEventStatus, SupportedSport } from "@/lib/providers/types";

const statusMap = {
  scheduled: "SCHEDULED",
  live: "LIVE",
  completed: "COMPLETED",
  postponed: "POSTPONED",
  cancelled: "CANCELLED",
  unknown: "UNKNOWN",
} as const satisfies Record<ProviderEventStatus, string>;

const sportNames: Record<SupportedSport, string> = {
  football: "Football",
  basketball: "Basketball",
  tennis: "Tennis",
};

type EdgeDb = ReturnType<typeof getDb>;

export type EventSyncResult = {
  provider: string;
  sport: SupportedSport;
  fetched: number;
  persisted: number;
  from: string;
  to: string;
};

export async function syncProviderEvents(
  db: EdgeDb,
  provider: DataProvider,
  sportKey: SupportedSport,
  from: Date,
  to: Date,
): Promise<EventSyncResult> {
  if (!provider.supports(sportKey)) {
    throw new Error(`${provider.name} does not support ${sportKey}.`);
  }

  const incoming = await provider.getEvents({ sport: sportKey, from, to });
  const events = [...new Map(incoming.map((event) => [event.providerId, event])).values()];

  const sport = await db.sport.upsert({
    where: { key: sportKey },
    update: { name: sportNames[sportKey], active: true },
    create: { key: sportKey, name: sportNames[sportKey], active: true },
  });

  let persisted = 0;

  for (const event of events) {
    if (event.sport !== sportKey) {
      throw new Error(
        `Provider ${provider.name} returned ${event.sport} while syncing ${sportKey}.`,
      );
    }

    const startTime = new Date(event.startsAt);
    if (Number.isNaN(startTime.getTime())) {
      throw new Error(
        `Provider ${provider.name} returned an invalid start time for event ${event.providerId}.`,
      );
    }

    const nextStatus = statusMap[event.status];
    const observedAt = new Date();

    await db.$transaction(async (tx) => {
      const existingEvent = await tx.event.findUnique({
        where: {
          provider_externalId: {
            provider: provider.name,
            externalId: event.providerId,
          },
        },
        select: {
          id: true,
          startTime: true,
          status: true,
        },
      });

      const league = await tx.league.upsert({
        where: {
          sportId_provider_externalId: {
            sportId: sport.id,
            provider: provider.name,
            externalId: event.competition.id,
          },
        },
        update: {
          name: event.competition.name,
          country: event.competition.country ?? null,
        },
        create: {
          externalId: event.competition.id,
          provider: provider.name,
          name: event.competition.name,
          country: event.competition.country ?? null,
          sportId: sport.id,
        },
      });

      const homeTeam =
        event.home.kind === "team"
          ? await tx.team.upsert({
              where: {
                sportId_provider_externalId: {
                  sportId: sport.id,
                  provider: provider.name,
                  externalId: event.home.id,
                },
              },
              update: {
                name: event.home.name,
                shortName: event.home.shortName ?? null,
                country: event.home.country ?? null,
              },
              create: {
                externalId: event.home.id,
                provider: provider.name,
                name: event.home.name,
                shortName: event.home.shortName ?? null,
                country: event.home.country ?? null,
                sportId: sport.id,
              },
            })
          : null;

      const awayTeam =
        event.away.kind === "team"
          ? await tx.team.upsert({
              where: {
                sportId_provider_externalId: {
                  sportId: sport.id,
                  provider: provider.name,
                  externalId: event.away.id,
                },
              },
              update: {
                name: event.away.name,
                shortName: event.away.shortName ?? null,
                country: event.away.country ?? null,
              },
              create: {
                externalId: event.away.id,
                provider: provider.name,
                name: event.away.name,
                shortName: event.away.shortName ?? null,
                country: event.away.country ?? null,
                sportId: sport.id,
              },
            })
          : null;

      const homePlayer =
        event.home.kind === "player"
          ? await tx.player.upsert({
              where: {
                sportId_provider_externalId: {
                  sportId: sport.id,
                  provider: provider.name,
                  externalId: event.home.id,
                },
              },
              update: {
                fullName: event.home.name,
                country: event.home.country ?? null,
              },
              create: {
                externalId: event.home.id,
                provider: provider.name,
                fullName: event.home.name,
                country: event.home.country ?? null,
                sportId: sport.id,
              },
            })
          : null;

      const awayPlayer =
        event.away.kind === "player"
          ? await tx.player.upsert({
              where: {
                sportId_provider_externalId: {
                  sportId: sport.id,
                  provider: provider.name,
                  externalId: event.away.id,
                },
              },
              update: {
                fullName: event.away.name,
                country: event.away.country ?? null,
              },
              create: {
                externalId: event.away.id,
                provider: provider.name,
                fullName: event.away.name,
                country: event.away.country ?? null,
                sportId: sport.id,
              },
            })
          : null;

      const savedEvent = await tx.event.upsert({
        where: {
          provider_externalId: {
            provider: provider.name,
            externalId: event.providerId,
          },
        },
        update: {
          sportId: sport.id,
          leagueId: league.id,
          homeTeamId: homeTeam?.id ?? null,
          awayTeamId: awayTeam?.id ?? null,
          homePlayerId: homePlayer?.id ?? null,
          awayPlayerId: awayPlayer?.id ?? null,
          startTime,
          status: nextStatus,
        },
        create: {
          externalId: event.providerId,
          provider: provider.name,
          sportId: sport.id,
          leagueId: league.id,
          homeTeamId: homeTeam?.id ?? null,
          awayTeamId: awayTeam?.id ?? null,
          homePlayerId: homePlayer?.id ?? null,
          awayPlayerId: awayPlayer?.id ?? null,
          startTime,
          status: nextStatus,
        },
      });

      await tx.eventSource.upsert({
        where: {
          provider_externalId: {
            provider: provider.name,
            externalId: event.providerId,
          },
        },
        update: {
          eventId: savedEvent.id,
          sourceSportKey: event.sourceSportKey ?? null,
        },
        create: {
          eventId: savedEvent.id,
          provider: provider.name,
          externalId: event.providerId,
          sourceSportKey: event.sourceSportKey ?? null,
        },
      });

      if (existingEvent) {
        const signalSource = provider.name + ":event-sync";

        if (
          existingEvent.status === "POSTPONED" &&
          nextStatus !== "POSTPONED"
        ) {
          await tx.intelligenceSignal.updateMany({
            where: {
              eventId: savedEvent.id,
              type: "POSTPONEMENT",
              source: signalSource,
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: observedAt } },
              ],
            },
            data: { expiresAt: observedAt },
          });
        }

        const changeSignals = buildEventChangeSignals(
          provider.name,
          event.providerId,
          {
            startTime: existingEvent.startTime,
            status: existingEvent.status,
          },
          {
            startTime,
            status: nextStatus,
          },
          observedAt,
        );

        for (const signal of changeSignals) {
          await tx.intelligenceSignal.upsert({
            where: { fingerprint: signal.fingerprint },
            update: {
              eventId: savedEvent.id,
              type: signal.type,
              severity: signal.severity,
              source: signalSource,
              headline: signal.headline,
              summary: signal.summary,
              occurredAt: signal.occurredAt,
              expiresAt: signal.expiresAt,
              metadata: JSON.parse(JSON.stringify(signal.metadata)),
            },
            create: {
              eventId: savedEvent.id,
              fingerprint: signal.fingerprint,
              type: signal.type,
              severity: signal.severity,
              source: signalSource,
              headline: signal.headline,
              summary: signal.summary,
              occurredAt: signal.occurredAt,
              expiresAt: signal.expiresAt,
              metadata: JSON.parse(JSON.stringify(signal.metadata)),
            },
          });
        }
      }
    });

    persisted += 1;
  }

  return {
    provider: provider.name,
    sport: sportKey,
    fetched: incoming.length,
    persisted,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
