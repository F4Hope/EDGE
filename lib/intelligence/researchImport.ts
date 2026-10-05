import type {
  ResearchEvidenceType,
  SourceBackedResearchEvidence,
} from "./researchEvidence";
import { researchEvidenceFingerprint } from "./researchEvidence";

export type PersistedResearchSignalType =
  | "INJURY"
  | "SUSPENSION"
  | "LINEUP"
  | "WITHDRAWAL"
  | "WEATHER"
  | "NEWS";

export type ResearchSignalDraft = {
  fingerprint: string;
  type: PersistedResearchSignalType;
  severity: SourceBackedResearchEvidence["severity"];
  source: string;
  headline: string;
  summary: string | null;
  occurredAt: string;
  metadata: {
    researchEvidence: {
      evidenceType: ResearchEvidenceType;
      direction: SourceBackedResearchEvidence["direction"];
      confidence: number;
      predictionId: string;
      selectionName: string;
      sourceName: string;
      sourceUrl: string;
      rationale: string;
      publishedAt: string;
      observedAt: string;
    };
  };
};

export function persistedSignalType(
  evidenceType: ResearchEvidenceType,
): PersistedResearchSignalType {
  switch (evidenceType) {
    case "INJURY":
    case "SUSPENSION":
    case "LINEUP":
    case "WITHDRAWAL":
    case "WEATHER":
    case "NEWS":
      return evidenceType;
    case "FORM":
    case "HEAD_TO_HEAD":
    case "STATISTICS":
      return "NEWS";
  }
}

function normalizedSelection(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function researchSelectionMatches(
  evidenceSelection: string,
  predictionSelection: string,
): boolean {
  const evidence = normalizedSelection(evidenceSelection);
  const prediction = normalizedSelection(predictionSelection);
  return Boolean(evidence && prediction && evidence === prediction);
}

export function buildResearchSignalDraft(
  evidence: SourceBackedResearchEvidence,
): ResearchSignalDraft {
  return {
    fingerprint: researchEvidenceFingerprint(evidence),
    type: persistedSignalType(evidence.evidenceType),
    severity: evidence.severity,
    source: `web-research:${evidence.sourceName}`,
    headline: evidence.headline,
    summary: evidence.summary,
    occurredAt: evidence.publishedAt,
    metadata: {
      researchEvidence: {
        evidenceType: evidence.evidenceType,
        direction: evidence.direction,
        confidence: evidence.confidence,
        predictionId: evidence.predictionId,
        selectionName: evidence.selectionName,
        sourceName: evidence.sourceName,
        sourceUrl: evidence.sourceUrl,
        rationale: evidence.rationale,
        publishedAt: evidence.publishedAt,
        observedAt: evidence.observedAt,
      },
    },
  };
}
