import { createHash } from "node:crypto";

export const RESEARCH_EVIDENCE_TYPES = [
  "FORM",
  "HEAD_TO_HEAD",
  "INJURY",
  "SUSPENSION",
  "LINEUP",
  "WITHDRAWAL",
  "STATISTICS",
  "WEATHER",
  "NEWS",
] as const;

export const RESEARCH_DIRECTIONS = [
  "SUPPORTS_SELECTION",
  "OPPOSES_SELECTION",
  "NEUTRAL",
] as const;

export const RESEARCH_SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type ResearchEvidenceType = (typeof RESEARCH_EVIDENCE_TYPES)[number];
export type ResearchDirection = (typeof RESEARCH_DIRECTIONS)[number];
export type ResearchSeverity = (typeof RESEARCH_SEVERITIES)[number];

export type SourceBackedResearchEvidence = {
  eventId: string;
  predictionId: string;
  selectionName: string;
  evidenceType: ResearchEvidenceType;
  severity: ResearchSeverity;
  direction: ResearchDirection;
  confidence: number;
  sourceName: string;
  sourceUrl: string;
  headline: string;
  summary: string | null;
  rationale: string;
  publishedAt: string;
  observedAt: string;
};

export type ComboResearchTask = {
  eventId: string;
  predictionId: string;
  sport: string;
  league: string;
  startsAt: string;
  matchup: string;
  selectionName: string;
  decimalOdds: number;
  oddsSource: string;
  searchQueries: string[];
  requiredEvidence: ResearchEvidenceType[];
};

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Research evidence is missing ${field}.`);
  }
  return value.trim();
}

function isoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`Research evidence has invalid ${field}.`);
  }
  return new Date(value).toISOString();
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  const normalized = text(value, field);
  if (!allowed.includes(normalized)) {
    throw new Error(
      `Unsupported ${field}: ${normalized}. Expected one of ${allowed.join(", ")}.`,
    );
  }
  return normalized as T[number];
}

function confidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Research evidence confidence must be a finite number.");
  }
  if (value < 0 || value > 1) {
    throw new Error("Research evidence confidence must be between 0 and 1.");
  }
  return Number(value.toFixed(4));
}

export function normalizeResearchSourceUrl(value: unknown): string {
  const raw = text(value, "sourceUrl");
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Research evidence sourceUrl must be a valid URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Research evidence sourceUrl must use http or https.");
  }

  parsed.hash = "";
  return parsed.toString();
}

export function researchEvidenceFingerprint(
  evidence: Pick<
    SourceBackedResearchEvidence,
    "eventId" | "predictionId" | "evidenceType" | "sourceUrl" | "headline" | "publishedAt"
  >,
): string {
  return createHash("sha256")
    .update(
      [
        evidence.eventId,
        evidence.predictionId,
        evidence.evidenceType,
        evidence.sourceUrl,
        evidence.headline,
        evidence.publishedAt,
      ].join("|"),
    )
    .digest("hex");
}

export function validateSourceBackedResearchEvidence(
  value: unknown,
): SourceBackedResearchEvidence {
  if (!value || typeof value !== "object") {
    throw new Error("Research evidence must be an object.");
  }

  const item = value as Record<string, unknown>;
  const publishedAt = isoDate(item.publishedAt, "publishedAt");
  const observedAt = isoDate(item.observedAt, "observedAt");

  if (new Date(publishedAt).getTime() > new Date(observedAt).getTime() + 5 * 60 * 1000) {
    throw new Error("Research evidence publishedAt cannot be after observedAt.");
  }

  return {
    eventId: text(item.eventId, "eventId"),
    predictionId: text(item.predictionId, "predictionId"),
    selectionName: text(item.selectionName, "selectionName"),
    evidenceType: enumValue(
      item.evidenceType,
      "evidenceType",
      RESEARCH_EVIDENCE_TYPES,
    ),
    severity: enumValue(item.severity, "severity", RESEARCH_SEVERITIES),
    direction: enumValue(item.direction, "direction", RESEARCH_DIRECTIONS),
    confidence: confidence(item.confidence),
    sourceName: text(item.sourceName, "sourceName"),
    sourceUrl: normalizeResearchSourceUrl(item.sourceUrl),
    headline: text(item.headline, "headline"),
    summary:
      item.summary === null || item.summary === undefined
        ? null
        : text(item.summary, "summary"),
    rationale: text(item.rationale, "rationale"),
    publishedAt,
    observedAt,
  };
}

function quoted(value: string): string {
  return `"${value.replaceAll('"', "")}"`;
}

export function buildComboResearchTask(input: {
  eventId: string;
  predictionId: string;
  sport: string;
  league: string;
  startsAt: string;
  matchup: string;
  selectionName: string;
  decimalOdds: number;
  bookmakerName: string | null;
  oddsProvider: string;
}): ComboResearchTask {
  const [leftRaw, rightRaw] = input.matchup.split(" vs ");
  const left = leftRaw?.trim() || input.matchup;
  const right = rightRaw?.trim() || "";
  const pair = right
    ? `${quoted(left)} ${quoted(right)}`
    : quoted(input.matchup);

  const sport = input.sport.toLowerCase();
  const searchQueries =
    sport === "tennis"
      ? [
          `${pair} injury withdrawal fitness news`,
          `${pair} recent form results statistics`,
          `${pair} head to head`,
        ]
      : [
          `${pair} injuries suspensions lineup team news`,
          `${pair} recent form results statistics`,
          `${pair} head to head`,
        ];

  return {
    eventId: input.eventId,
    predictionId: input.predictionId,
    sport: input.sport,
    league: input.league,
    startsAt: input.startsAt,
    matchup: input.matchup,
    selectionName: input.selectionName,
    decimalOdds: input.decimalOdds,
    oddsSource:
      (input.bookmakerName ?? "Bookmaker") + " · " + input.oddsProvider,
    searchQueries,
    requiredEvidence:
      sport === "tennis"
        ? ["FORM", "HEAD_TO_HEAD", "INJURY", "WITHDRAWAL", "NEWS"]
        : ["FORM", "HEAD_TO_HEAD", "INJURY", "SUSPENSION", "LINEUP", "NEWS"],
  };
}
