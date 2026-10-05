import test from "node:test";
import assert from "node:assert/strict";
import {
  GoogleSearchGroundingClient,
  parseGroundedInteraction,
} from "../lib/intelligence/googleSearchGrounding";

test("parses Google Search queries, grounded citations, and intelligence JSON", () => {
  const parsed = parseGroundedInteraction({
    steps: [
      {
        type: "google_search_call",
        arguments: {
          queries: [
            "Arsenal Chelsea injuries October 5 2026",
            "Arsenal Chelsea lineup news",
          ],
        },
      },
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text: "```json\n{\"signals\":[{\"type\":\"INJURY\",\"severity\":\"HIGH\",\"headline\":\"Key player ruled out\",\"summary\":\"Club update confirms the player is unavailable.\",\"affectsHome\":true,\"affectsAway\":false,\"participant\":\"Example Player\"}]}\n```",
            annotations: [
              {
                type: "url_citation",
                url: "https://example.com/team-update",
                title: "Official team update",
                start_index: 0,
                end_index: 20,
              },
              {
                type: "url_citation",
                url: "https://example.com/team-update",
                title: "Duplicate",
                start_index: 0,
                end_index: 20,
              },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(parsed.searchQueries, [
    "Arsenal Chelsea injuries October 5 2026",
    "Arsenal Chelsea lineup news",
  ]);
  assert.equal(parsed.citations.length, 1);
  assert.equal(parsed.citations[0].url, "https://example.com/team-update");
  assert.equal(parsed.signals.length, 1);
  assert.equal(parsed.signals[0].type, "INJURY");
  assert.equal(parsed.signals[0].severity, "HIGH");
  assert.equal(parsed.signals[0].affectsHome, true);
  assert.equal(parsed.signals[0].participant, "Example Player");
});

test("drops malformed or unsupported intelligence claims", () => {
  const parsed = parseGroundedInteraction({
    steps: [
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              signals: [
                {
                  type: "BETTING_TIP",
                  severity: "HIGH",
                  headline: "Unsupported",
                },
                {
                  type: "NEWS",
                  severity: "UNKNOWN",
                  headline: "Bad severity",
                },
                {
                  type: "NEWS",
                  severity: "LOW",
                  headline: "Valid factual update",
                  summary: "Verified context.",
                  affectsHome: null,
                  affectsAway: null,
                  participant: null,
                },
              ],
            }),
            annotations: [],
          },
        ],
      },
    ],
  });

  assert.equal(parsed.signals.length, 1);
  assert.equal(parsed.signals[0].headline, "Valid factual update");
});

test("Google grounding client uses stateless Interactions API with google_search", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    capturedUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    capturedInit = init;

    return new Response(
      JSON.stringify({
        steps: [
          {
            type: "google_search_call",
            arguments: { queries: ["Team A Team B injury news"] },
          },
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: '{"signals":[]}',
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://example.com/source",
                    title: "Example",
                    start_index: 0,
                    end_index: 2,
                  },
                ],
              },
            ],
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const client = new GoogleSearchGroundingClient(
      "secret-test-key",
      "gemini-test-model",
    );

    await client.researchEvent({
      sport: "football",
      league: "Test League",
      home: "Team A",
      away: "Team B",
      startsAt: "2026-10-05T18:00:00.000Z",
    });

    assert.equal(
      capturedUrl,
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    assert.equal(
      new Headers(capturedInit?.headers).get("x-goog-api-key"),
      "secret-test-key",
    );

    const body = JSON.parse(String(capturedInit?.body));
    assert.equal(body.model, "gemini-test-model");
    assert.equal(body.store, false);
    assert.deepEqual(body.tools, [{ type: "google_search" }]);
    assert.match(body.input, /Do not report betting odds/);
    assert.match(body.input, /Team A vs Team B/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
