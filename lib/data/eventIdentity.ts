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

const providerNameStopTokens = new Set([
  "fc",
  "cf",
  "sc",
  "ca",
  "ac",
  "afc",
  "club",
  "de",
  "del",
  "da",
  "do",
  "ba",
]);

const providerNameAliases = new Map([
  ["jrs", "juniors"],
  ["jr", "junior"],
]);

function normalizedNameTokens(value: string): string[] {
  const rawTokens = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const normalized = rawTokens
    .map((token) => providerNameAliases.get(token) ?? token)
    .filter((token) => !providerNameStopTokens.has(token));

  return normalized.length > 0 ? normalized : rawTokens;
}

function isSubset(shorter: string[], longer: string[]): boolean {
  const longerSet = new Set(longer);
  return shorter.every((token) => longerSet.has(token));
}

export function providerParticipantNamesEquivalent(
  left: string,
  right: string,
): boolean {
  const leftTokens = normalizedNameTokens(left);
  const rightTokens = normalizedNameTokens(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  if (leftTokens.join("|") === rightTokens.join("|")) return true;

  const shorter =
    leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longer =
    leftTokens.length <= rightTokens.length ? rightTokens : leftTokens;

  if (longer.length - shorter.length > 1) return false;
  if (!isSubset(shorter, longer)) return false;

  return shorter.some((token) => token.length >= 5);
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
  const names = candidateNames(candidate);

  if (!event.home.name || !event.away.name || !names.home || !names.away) {
    return false;
  }

  const direct =
    providerParticipantNamesEquivalent(event.home.name, names.home) &&
    providerParticipantNamesEquivalent(event.away.name, names.away);

  if (sport !== "tennis") return direct;

  return (
    direct ||
    (providerParticipantNamesEquivalent(event.home.name, names.away) &&
      providerParticipantNamesEquivalent(event.away.name, names.home))
  );
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
