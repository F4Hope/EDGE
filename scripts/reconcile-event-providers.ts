import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import { providerParticipantNamesEquivalent } from "../lib/data/eventIdentity";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const ODDS_PROVIDER = "odds-api";
const DEFAULT_HOURS = 168;
const TOLERANCE_MS = 15 * 60 * 1000;

function hasFlag(name: string): boolean {
  return process.argv.includes("--" + name);
}

function getArg(name: string): string | undefined {
  const prefix = "--" + name + "=";
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseHours(value: string | undefined): number {
  const parsed = Number(value ?? DEFAULT_HOURS);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24 * 14) {
    throw new Error("--hours must be an integer from 1 to 336.");
  }
  return parsed;
}

type EventCandidate = {
  id: string;
  provider: string;
  startTime: Date;
  sport: { key: string };
  homeTeam: { name: string } | null;
  awayTeam: { name: string } | null;
  homePlayer: { fullName: string } | null;
  awayPlayer: { fullName: string } | null;
};

function names(event: EventCandidate): { home: string; away: string } {
  return {
    home: event.homeTeam?.name ?? event.homePlayer?.fullName ?? "",
    away: event.awayTeam?.name ?? event.awayPlayer?.fullName ?? "",
  };
}

function sameParticipants(left: EventCandidate, right: EventCandidate): boolean {
  const a = names(left);
  const b = names(right);
  if (!a.home || !a.away || !b.home || !b.away) return false;

  const direct =
    providerParticipantNamesEquivalent(a.home, b.home) &&
    providerParticipantNamesEquivalent(a.away, b.away);

  if (left.sport.key !== "tennis") return direct;

  return (
    direct ||
    (providerParticipantNamesEquivalent(a.home, b.away) &&
      providerParticipantNamesEquivalent(a.away, b.home))
  );
}

async function main() {
  const apply = hasFlag("apply");
  const hours = parseHours(getArg("hours"));
  const db = getDb();
  const now = new Date();
  const from = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000);

  try {
    const oddsEvents = await db.event.findMany({
      where: {
        provider: ODDS_PROVIDER,
        startTime: { gte: from, lte: to },
        sources: { some: { provider: ODDS_PROVIDER } },
      },
      select: {
        id: true,
        provider: true,
        startTime: true,
        sport: { select: { key: true } },
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        homePlayer: { select: { fullName: true } },
        awayPlayer: { select: { fullName: true } },
      },
      orderBy: { startTime: "asc" },
    });

    let matched = 0;
    let ambiguous = 0;
    let applied = 0;
    let blockedByResults = 0;

    for (const oddsEvent of oddsEvents) {
      const candidates = await db.event.findMany({
        where: {
          id: { not: oddsEvent.id },
          provider: { not: ODDS_PROVIDER },
          sport: { key: oddsEvent.sport.key },
          startTime: {
            gte: new Date(oddsEvent.startTime.getTime() - TOLERANCE_MS),
            lte: new Date(oddsEvent.startTime.getTime() + TOLERANCE_MS),
          },
        },
        select: {
          id: true,
          provider: true,
          startTime: true,
          sport: { select: { key: true } },
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          homePlayer: { select: { fullName: true } },
          awayPlayer: { select: { fullName: true } },
        },
      });

      const matches = candidates.filter((candidate) =>
        sameParticipants(oddsEvent as EventCandidate, candidate as EventCandidate),
      );

      if (matches.length === 0) continue;
      if (matches.length > 1) {
        ambiguous += 1;
        console.log("AMBIGUOUS", {
          oddsEventId: oddsEvent.id,
          matchup: names(oddsEvent as EventCandidate),
          candidateIds: matches.map((candidate) => candidate.id),
        });
        continue;
      }

      const target = matches[0];
      matched += 1;

      console.log(apply ? "RECONCILE" : "DRY-RUN MATCH", {
        oddsEventId: oddsEvent.id,
        targetEventId: target.id,
        oddsMatchup: names(oddsEvent as EventCandidate),
        canonicalMatchup: names(target as EventCandidate),
        startTime: oddsEvent.startTime.toISOString(),
      });

      if (!apply) continue;

      const outcome = await db.$transaction(async (tx) => {
        const [sourceResult, targetResult] = await Promise.all([
          tx.result.findUnique({ where: { eventId: oddsEvent.id } }),
          tx.result.findUnique({ where: { eventId: target.id } }),
        ]);

        if (sourceResult && targetResult) {
          return { blocked: true, movedMarkets: 0 };
        }

        const markets = await tx.market.findMany({
          where: { eventId: oddsEvent.id },
        });

        let movedMarkets = 0;

        for (const market of markets) {
          const existing = await tx.market.findFirst({
            where: {
              eventId: target.id,
              provider: market.provider,
              key: market.key,
              line: market.line,
            },
          });

          if (existing) {
            await tx.oddsSnapshot.updateMany({
              where: { marketId: market.id },
              data: { marketId: existing.id },
            });
            await tx.prediction.updateMany({
              where: { marketId: market.id },
              data: { eventId: target.id, marketId: existing.id },
            });
            await tx.market.delete({ where: { id: market.id } });
          } else {
            await tx.market.update({
              where: { id: market.id },
              data: { eventId: target.id },
            });
            await tx.prediction.updateMany({
              where: { marketId: market.id },
              data: { eventId: target.id },
            });
          }

          movedMarkets += 1;
        }

        await tx.feature.updateMany({
          where: { eventId: oddsEvent.id },
          data: { eventId: target.id },
        });
        await tx.prediction.updateMany({
          where: { eventId: oddsEvent.id },
          data: { eventId: target.id },
        });
        await tx.intelligenceSignal.updateMany({
          where: { eventId: oddsEvent.id },
          data: { eventId: target.id },
        });
        await tx.eventSource.updateMany({
          where: { eventId: oddsEvent.id },
          data: { eventId: target.id },
        });

        if (sourceResult && !targetResult) {
          await tx.result.update({
            where: { eventId: oddsEvent.id },
            data: { eventId: target.id },
          });
        }

        await tx.event.delete({ where: { id: oddsEvent.id } });

        return { blocked: false, movedMarkets };
      });

      if (outcome.blocked) {
        blockedByResults += 1;
        console.log("BLOCKED", {
          oddsEventId: oddsEvent.id,
          targetEventId: target.id,
          reason: "both events already have settled result rows",
        });
      } else {
        applied += 1;
        console.log("APPLIED", {
          oddsEventId: oddsEvent.id,
          targetEventId: target.id,
          movedMarkets: outcome.movedMarkets,
        });
      }
    }

    console.log("Event provider reconciliation complete.", {
      mode: apply ? "apply" : "dry-run",
      scannedOddsEvents: oddsEvents.length,
      matched,
      ambiguous,
      applied,
      blockedByResults,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE event provider reconciliation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
