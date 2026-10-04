import { createHash } from "node:crypto";

export type ApiSportsInjuryRow = {
  player?: {
    id?: string | number;
    name?: string;
    type?: string;
    reason?: string | null;
  };
  team?: {
    id?: string | number;
    name?: string;
  };
  fixture?: {
    id?: string | number;
    date?: string;
  };
};

export type NormalizedAvailabilitySignal = {
  fingerprint: string;
  providerFixtureId: string;
  providerPlayerId: string;
  providerTeamId: string | null;
  teamName: string | null;
  playerName: string;
  reportType: string;
  reason: string | null;
  type: "INJURY" | "SUSPENSION" | "LINEUP";
  severity: "LOW" | "MEDIUM" | "HIGH";
  headline: string;
  summary: string;
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function id(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function intelligenceType(
  reportType: string,
  reason: string | null,
): NormalizedAvailabilitySignal["type"] {
  const combined = (reportType + " " + (reason ?? "")).toLowerCase();

  if (
    /suspend|suspension|disciplin|ban\b|red card|yellow card/.test(combined)
  ) {
    return "SUSPENSION";
  }

  if (
    /injur|illness|sick|virus|covid|ankle|knee|muscle|calf|hamstring|groin|shoulder|back|knock|tendon|fracture|broken|concussion|hip|foot|leg|thigh|achilles/.test(
      combined,
    )
  ) {
    return "INJURY";
  }

  return "LINEUP";
}

function severity(
  reportType: string,
): NormalizedAvailabilitySignal["severity"] {
  const normalized = reportType.toLowerCase();
  if (normalized.includes("missing")) return "HIGH";
  if (normalized.includes("questionable")) return "MEDIUM";
  return "LOW";
}

export function availabilityFingerprint(
  providerFixtureId: string,
  providerPlayerId: string,
): string {
  return createHash("sha256")
    .update("api-sports:availability:" + providerFixtureId + ":" + providerPlayerId)
    .digest("hex");
}

export function normalizeApiSportsInjury(
  row: ApiSportsInjuryRow,
): NormalizedAvailabilitySignal | null {
  const providerFixtureId = id(row.fixture?.id);
  const providerPlayerId = id(row.player?.id);
  const providerTeamId = id(row.team?.id);
  const playerName = text(row.player?.name);
  const teamName = text(row.team?.name);
  const reportType = text(row.player?.type);
  const reason = text(row.player?.reason);

  if (!providerFixtureId || !providerPlayerId || !playerName || !reportType) {
    return null;
  }

  const type = intelligenceType(reportType, reason);
  const signalSeverity = severity(reportType);
  const context = reason ?? reportType;

  return {
    fingerprint: availabilityFingerprint(providerFixtureId, providerPlayerId),
    providerFixtureId,
    providerPlayerId,
    providerTeamId,
    teamName,
    playerName,
    reportType,
    reason,
    type,
    severity: signalSeverity,
    headline:
      type === "SUSPENSION"
        ? playerName + " suspension/disciplinary absence"
        : type === "INJURY"
          ? playerName + " availability concern"
          : playerName + " lineup availability",
    summary: reportType + (reason ? " — " + reason : "") + ".",
  };
}
