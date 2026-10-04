import { getDb } from "@/lib/prisma";
import {
  FEATURE_SCHEMA_VERSION,
  type FeatureVector,
  type ParticipantFormFeatures,
  type ParticipantScheduleFeatures,
} from "./types";
import { buildMarketFeatures } from "./market";
import { buildSportSpecificFeatures } from "./sports";
import { calculateFeatureQuality } from "./quality";
import { featureFingerprint } from "./fingerprint";
import {
  emptyParticipantForm,
  summarizeParticipantForm,
} from "./form";
import {
  supportedSports,
  type SupportedSport,
} from "@/lib/providers/types";

type EdgeDb = ReturnType<typeof getDb>;

const DAY_MS = 86_400_000;
const HISTORY_WINDOW_MS = 60 * DAY_MS;
const SHORT_WINDOW_MS = 7 * DAY_MS;

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

type ParticipantEvidence = {
  schedule: ParticipantScheduleFeatures;
  form: ParticipantFormFeatures;
};

async function participantEvidence(
  db: EdgeDb,
  input: {
    eventId: string;
    eventStart: Date;
    teamId?: string | null;
    playerId?: string | null;
  },
): Promise<ParticipantEvidence> {
  if (!input.teamId && !input.playerId) {
    return {
      schedule: {
        priorEvents60d: 0,
        eventsLast7d: 0,
        restDays: null,
        backToBack: null,
      },
      form: emptyParticipantForm(),
    };
  }

  const participantFilter = input.teamId
    ? {
        OR: [
          { homeTeamId: input.teamId },
          { awayTeamId: input.teamId },
        ],
      }
    : {
        OR: [
          { homePlayerId: input.playerId },
          { awayPlayerId: input.playerId },
        ],
      };

  const prior = await db.event.findMany({
    where: {
      id: { not: input.eventId },
      startTime: {
        lt: input.eventStart,
        gte: new Date(input.eventStart.getTime() - HISTORY_WINDOW_MS),
      },
      status: { notIn: ["CANCELLED", "POSTPONED"] },
      ...participantFilter,
    },
    orderBy: { startTime: "desc" },
    take: 60,
    select: {
      startTime: true,
      homeTeamId: true,
      awayTeamId: true,
      homePlayerId: true,
      awayPlayerId: true,
      result: {
        select: {
          status: true,
          payload: true,
        },
      },
    },
  });

  const lastEvent = prior[0]?.startTime ?? null;
  const restDays = lastEvent
    ? round((input.eventStart.getTime() - lastEvent.getTime()) / DAY_MS, 2)
    : null;
  const shortWindowStart = input.eventStart.getTime() - SHORT_WINDOW_MS;
  const eventsLast7d = prior.filter(
    (event) => event.startTime.getTime() >= shortWindowStart,
  ).length;

  const participantId = input.teamId ?? input.playerId ?? null;
  const form = summarizeParticipantForm(
    prior.map((event) => ({
      homeParticipantId: input.teamId
        ? event.homeTeamId
        : event.homePlayerId,
      awayParticipantId: input.teamId
        ? event.awayTeamId
        : event.awayPlayerId,
      resultStatus: event.result?.status ?? null,
      payload: event.result?.payload ?? null,
    })),
    participantId,
    10,
  );

  return {
    schedule: {
      priorEvents60d: prior.length,
      eventsLast7d,
      restDays,
      backToBack: restDays === null ? null : restDays < 2,
    },
    form,
  };
}

export type FeatureCalculationResult = {
  featureId: string;
  reused: boolean;
  vector: FeatureVector;
};

export async function calculateEventFeatures(
  db: EdgeDb,
  eventId: string,
  asOf = new Date(),
): Promise<FeatureCalculationResult> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      sport: { select: { key: true } },
      league: { select: { name: true, country: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      homePlayer: { select: { id: true, fullName: true } },
      awayPlayer: { select: { id: true, fullName: true } },
      markets: {
        select: {
          key: true,
          oddsSnapshots: {
            orderBy: { capturedAt: "desc" },
            take: 500,
            select: {
              bookmakerKey: true,
              selectionKey: true,
              selectionName: true,
              point: true,
              decimalOdds: true,
              capturedAt: true,
            },
          },
        },
      },
    },
  });

  if (!event) {
    throw new Error(`Event ${eventId} does not exist.`);
  }

  if (!supportedSports.includes(event.sport.key as SupportedSport)) {
    throw new Error(
      `Feature engine does not support sport ${event.sport.key} yet.`,
    );
  }

  const sport = event.sport.key as SupportedSport;
  const participantKind = sport === "tennis" ? "player" : "team";
  const homeParticipant =
    event.homeTeam?.name ?? event.homePlayer?.fullName ?? null;
  const awayParticipant =
    event.awayTeam?.name ?? event.awayPlayer?.fullName ?? null;

  const [homeEvidence, awayEvidence] = await Promise.all([
    participantEvidence(db, {
      eventId: event.id,
      eventStart: event.startTime,
      teamId: event.homeTeam?.id,
      playerId: event.homePlayer?.id,
    }),
    participantEvidence(db, {
      eventId: event.id,
      eventStart: event.startTime,
      teamId: event.awayTeam?.id,
      playerId: event.awayPlayer?.id,
    }),
  ]);

  const homeSchedule = homeEvidence.schedule;
  const awaySchedule = awayEvidence.schedule;
  const market = buildMarketFeatures(event.markets, event.startTime);
  const sportSpecific = buildSportSpecificFeatures(sport, {
    home: homeSchedule,
    away: awaySchedule,
    homeForm: homeEvidence.form,
    awayForm: awayEvidence.form,
    participantKind,
  });

  const identityComplete = Boolean(
    event.league.name &&
      homeParticipant &&
      awayParticipant &&
      event.startTime,
  );

  const quality = calculateFeatureQuality({
    identityComplete,
    homeSchedule,
    awaySchedule,
    market,
    sportSpecific,
  });

  const vector: FeatureVector = {
    schemaVersion: FEATURE_SCHEMA_VERSION,
    eventId: event.id,
    sport,
    identity: {
      league: event.league.name,
      country: event.league.country,
      startsAt: event.startTime.toISOString(),
      homeParticipant,
      awayParticipant,
      participantKind,
    },
    temporal: {
      daysUntilStart: round(
        (event.startTime.getTime() - asOf.getTime()) / DAY_MS,
      ),
      eventHourUtc: event.startTime.getUTCHours(),
      home: homeSchedule,
      away: awaySchedule,
    },
    form: {
      home: homeEvidence.form,
      away: awayEvidence.form,
    },
    market,
    sportSpecific,
    quality,
  };

  const fingerprint = featureFingerprint({
    eventId: event.id,
    schemaVersion: FEATURE_SCHEMA_VERSION,
    values: vector,
  });

  const existing = await db.feature.findUnique({
    where: { fingerprint },
    select: { id: true },
  });

  if (existing) {
    return {
      featureId: existing.id,
      reused: true,
      vector,
    };
  }

  const saved = await db.feature.create({
    data: {
      eventId: event.id,
      modelVersion: FEATURE_SCHEMA_VERSION,
      fingerprint,
      values: JSON.parse(JSON.stringify(vector)),
      dataQuality: quality.overall,
      computedAt: asOf,
    },
    select: { id: true },
  });

  return {
    featureId: saved.id,
    reused: false,
    vector,
  };
}
