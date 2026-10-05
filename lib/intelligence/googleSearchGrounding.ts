const INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

export const GOOGLE_SEARCH_INTELLIGENCE_SOURCE = "google-search-grounded";

export type GroundedCitation = {
  url: string;
  title: string | null;
};

export type GroundedSignal = {
  type:
    | "INJURY"
    | "SUSPENSION"
    | "LINEUP"
    | "WITHDRAWAL"
    | "SCHEDULE_CHANGE"
    | "POSTPONEMENT"
    | "WEATHER"
    | "NEWS";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  headline: string;
  summary: string | null;
  affectsHome: boolean | null;
  affectsAway: boolean | null;
  participant: string | null;
};

export type GroundedEventIntelligence = {
  signals: GroundedSignal[];
  citations: GroundedCitation[];
  searchQueries: string[];
  rawText: string;
};

type InteractionResponse = {
  steps?: Array<Record<string, unknown>>;
};

const TYPES = new Set<GroundedSignal["type"]>([
  "INJURY",
  "SUSPENSION",
  "LINEUP",
  "WITHDRAWAL",
  "SCHEDULE_CHANGE",
  "POSTPONEMENT",
  "WEATHER",
  "NEWS",
]);

const SEVERITIES = new Set<GroundedSignal["severity"]>([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i);
  return match ? match[1].trim() : trimmed;
}

function parseSignal(value: unknown): GroundedSignal | null {
  const item = record(value);
  if (!item) return null;

  const type = nonEmptyString(item.type) as GroundedSignal["type"] | null;
  const severity = nonEmptyString(item.severity) as
    | GroundedSignal["severity"]
    | null;
  const headline = nonEmptyString(item.headline);

  if (
    !type ||
    !severity ||
    !headline ||
    !TYPES.has(type) ||
    !SEVERITIES.has(severity)
  ) {
    return null;
  }

  return {
    type,
    severity,
    headline,
    summary: nonEmptyString(item.summary),
    affectsHome: optionalBoolean(item.affectsHome),
    affectsAway: optionalBoolean(item.affectsAway),
    participant: nonEmptyString(item.participant),
  };
}

export function parseGroundedInteraction(
  response: InteractionResponse,
): GroundedEventIntelligence {
  const texts: string[] = [];
  const citations = new Map<string, GroundedCitation>();
  const queries = new Set<string>();

  for (const rawStep of response.steps ?? []) {
    const step = record(rawStep);
    if (!step) continue;

    if (step.type === "google_search_call") {
      const argumentsRecord = record(step.arguments);
      const queryValues = Array.isArray(argumentsRecord?.queries)
        ? argumentsRecord?.queries
        : [];
      for (const query of queryValues ?? []) {
        const text = nonEmptyString(query);
        if (text) queries.add(text);
      }
    }

    if (step.type !== "model_output" || !Array.isArray(step.content)) {
      continue;
    }

    for (const rawBlock of step.content) {
      const block = record(rawBlock);
      if (!block || block.type !== "text") continue;

      const text = nonEmptyString(block.text);
      if (text) texts.push(text);

      if (!Array.isArray(block.annotations)) continue;
      for (const rawAnnotation of block.annotations) {
        const annotation = record(rawAnnotation);
        if (!annotation || annotation.type !== "url_citation") continue;

        const url = nonEmptyString(annotation.url);
        if (!url) continue;

        citations.set(url, {
          url,
          title: nonEmptyString(annotation.title),
        });
      }
    }
  }

  const rawText = texts.join("\n").trim();
  let parsed: unknown = null;

  if (rawText) {
    try {
      parsed = JSON.parse(stripJsonFence(rawText));
    } catch {
      parsed = null;
    }
  }

  const parsedRecord = record(parsed);
  const signals = Array.isArray(parsedRecord?.signals)
    ? parsedRecord.signals
        .map(parseSignal)
        .filter((signal): signal is GroundedSignal => signal !== null)
    : [];

  return {
    signals,
    citations: [...citations.values()],
    searchQueries: [...queries],
    rawText,
  };
}

function intelligencePrompt(input: {
  sport: string;
  league: string;
  home: string;
  away: string;
  startsAt: string;
}): string {
  return [
    "You are collecting factual pre-event sports intelligence for an analytics system.",
    "Use Google Search to find CURRENT, source-backed information relevant to this exact event.",
    `Sport: ${input.sport}`,
    `League: ${input.league}`,
    `Event: ${input.home} vs ${input.away}`,
    `Scheduled start: ${input.startsAt}`,
    "",
    "Focus only on material pre-event facts: injuries, suspensions, confirmed or probable lineups, withdrawals, postponements/schedule changes, material weather, and important team news.",
    "Do not report betting odds, betting tips, predictions, picks, or unsupported rumors.",
    "Prefer official league/team sources and established sports/news outlets.",
    "If sources conflict or the evidence is weak, omit the claim.",
    "",
    "Return ONLY JSON in this exact shape:",
    '{"signals":[{"type":"INJURY|SUSPENSION|LINEUP|WITHDRAWAL|SCHEDULE_CHANGE|POSTPONEMENT|WEATHER|NEWS","severity":"LOW|MEDIUM|HIGH|CRITICAL","headline":"short factual headline","summary":"brief source-backed explanation","affectsHome":true|false|null,"affectsAway":true|false|null,"participant":"player/team/person or null"}]}',
    "Return {\"signals\":[]} when no reliable current signal is found.",
  ].join("\n");
}

export class GoogleSearchGroundingClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = "gemini-3.8-flash",
  ) {
    if (!apiKey.trim()) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
  }

  async researchEvent(input: {
    sport: string;
    league: string;
    home: string;
    away: string;
    startsAt: string;
  }): Promise<GroundedEventIntelligence> {
    const response = await fetch(INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        input: intelligencePrompt(input),
        tools: [{ type: "google_search" }],
        store: false,
      }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Gemini Google Search grounding failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : "."}`,
      );
    }

    const body = (await response.json()) as InteractionResponse;
    return parseGroundedInteraction(body);
  }
}
