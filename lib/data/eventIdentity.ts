import type { getDb } from "@/lib/prisma";
import type { ProviderEvent, SupportedSport } from "@/lib/providers/types";

type EdgeDb = ReturnType<typeof getDb>;

type CandidateEvent = {
  id: string;
  provider: string;
  externalId: string;
  startTime: Date;
  sport: { key: string };
  homeTeam: { name: string } | null;
  awayTeam: { name: string } | null;
  homePlayer: { fullName: string } | null;
  awayPlayer: { fullName: string } | null;
};

export type AliasResolution = {
  matched: number;
  direct: number;
  unmatched: ProviderEvent[];
};

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function candidateNames(candidate: CandidateEvent): {
  home: string;
  away: string;
} {
  return {
    home: candidate.homeTeam?.name ?? candidate.homePlayer?.fullName ?? "",
    away: candidate.awayTeam?.name ?? candidate.awayPlayer?.fullName ?? "",
  };
}

function participantMatch(
  sport: SupportedSport,
  event: ProviderEvent,
  candidate: CandidateEvent,
): boolean {
  const incomingHome = normalizeName(event.home.name);
  const incomingAway = normalizeName(event.away.name);
  const names = candidateNames(candidate);
  const candidateHome = normalizeName(names.home);
  const candidateAway = normalizeName(names.away);

  if (!incomingHome || !incomingAway || !candidateHome || !candidateAway) {
    return false;
  }

  if (sport === "tennis") {
    return (
      (incomingHome === candidateHome && incomingAway === candidateAway) ||
      (incomingHome === candidateAway && incomingAway === candidateHome)
    );
  }

  return incomingHome === candidateHome && incomingAway === candidateAway;
}

async function writeAlias(
  db: EdgeDb,
  eventId: string,
  provider: string,
  event: ProviderEvent,
): Promise<void> {
  await db.eventSource.upsert({
    where: {
      provider_externalId: {
        provider,
        externalId: event.providerId,
      },
    },
    update: {
      eventId,
      sourceSportKey: event.sourceSportKey ?? null,
    },
    create: {
      eventId,
      provider,
      externalId: event.providerId,
      sourceSportKey: event.sourceSportKey ?? null,
    },
  });
}

export async function attachProviderAliases(
  db: EdgeDb,
  provider: string,
  events: ProviderEvent[],
  toleranceMinutes = 15,
): Promise<AliasResolution> {
  const result: AliasResolution = {
    matched: 0,
    direct: 0,
    unmatched: [],
  };

  const toleranceMs = Math.max(1, toleranceMinutes) * 60_000;

  for (const event of events) {
    const existingAlias = await db.eventSource.findUnique({
      where: {
        provider_externalId: {
          provider,
          externalId: event.providerId,
        },
      },
      select: { eventId: true },
    });

    if (existingAlias) {
      result.direct += 1;
      continue;
    }

    const existingDirect = await db.event.findUnique({
      where: {
        provider_externalId: {
          provider,
          externalId: event.providerId,
        },
      },
      select: { id: true },
    });

    if (existingDirect) {
      await writeAlias(db, existingDirect.id, provider, event);
      result.direct += 1;
      continue;
    }

    const startTime = new Date(event.startsAt);
    if (Number.isNaN(startTime.getTime())) {
      throw new Error(
        `Cannot resolve provider event ${event.providerId}: invalid start time.`,
      );
    }

    const candidates = await db.event.findMany({
      where: {
        sport: { key: event.sport },
        startTime: {
          gte: new Date(startTime.getTime() - toleranceMs),
          lte: new Date(startTime.getTime() + toleranceMs),
        },
      },
      select: {
        id: true,
        provider: true,
        externalId: true,
        startTime: true,
        sport: { select: { key: true } },
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        homePlayer: { select: { fullName: true } },
        awayPlayer: { select: { fullName: true } },
      },
    });

    const matches = candidates.filter((candidate) =>
      participantMatch(event.sport, event, candidate as CandidateEvent),
    );

    if (matches.length > 1) {
      throw new Error(
        `Ambiguous cross-provider identity for ${event.sport} event ${event.providerId}; refusing to guess.`,
      );
    }

    if (matches.length === 1) {
      await writeAlias(db, matches[0].id, provider, event);
      result.matched += 1;
      continue;
    }

    result.unmatched.push(event);
  }

  return result;
}
