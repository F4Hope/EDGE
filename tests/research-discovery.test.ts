import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildBingNewsRssUrl,
  buildGoogleNewsRssUrl,
  discoverGoogleNews,
  discoverPublicNews,
  isIndependentResearchDiscovery,
  parseGoogleNewsRss,
  preEventDiscoveries,
} from "../lib/intelligence/googleNewsDiscovery";

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<rss><channel>
  <item>
    <title><![CDATA[Alpha FC injury update - Example Sports]]></title>
    <link>https://news.google.com/rss/articles/example-1</link>
    <pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate>
    <description><![CDATA[<p>Alpha striker remains unavailable.</p>]]></description>
    <source url="https://example.com">Example Sports</source>
  </item>
  <item>
    <title>Beta FC lineup confirmed</title>
    <link>https://news.google.com/rss/articles/example-2</link>
    <pubDate>Mon, 05 Oct 2026 22:00:00 GMT</pubDate>
    <source url="https://beta.example">Beta News</source>
  </item>
</channel></rss>`;

test("Google News discovery builds encoded RSS search URLs", () => {
  const url = new URL(buildGoogleNewsRssUrl('"Alpha FC" injury news'));

  assert.equal(url.origin, "https://news.google.com");
  assert.equal(url.pathname, "/rss/search");
  assert.equal(url.searchParams.get("q"), '"Alpha FC" injury news');
  assert.equal(url.searchParams.get("hl"), "en-US");
  assert.equal(url.searchParams.get("gl"), "US");
  assert.equal(url.searchParams.get("ceid"), "US:en");
});

test("Bing News discovery builds encoded RSS search URLs", () => {
  const url = new URL(buildBingNewsRssUrl('"Alpha FC" injury news'));

  assert.equal(url.origin, "https://www.bing.com");
  assert.equal(url.pathname, "/news/search");
  assert.equal(url.searchParams.get("q"), '"Alpha FC" injury news');
  assert.equal(url.searchParams.get("format"), "rss");
  assert.equal(url.searchParams.get("mkt"), "en-US");
});

test("Google News RSS parser preserves attribution and publication time", () => {
  const items = parseGoogleNewsRss(sample);

  assert.equal(items.length, 2);
  assert.equal(items[0].publisherName, "Example Sports");
  assert.equal(items[0].publisherUrl, "https://example.com");
  assert.equal(
    items[0].discoveryUrl,
    "https://news.google.com/rss/articles/example-1",
  );
  assert.equal(items[0].publishedAt, "2026-10-05T10:00:00.000Z");
  assert.match(items[0].summary ?? "", /Alpha striker remains unavailable/);
});

test("research discovery keeps only pre-event results", () => {
  const items = preEventDiscoveries(
    parseGoogleNewsRss(sample),
    "2026-10-05T18:00:00Z",
    10,
  );

  assert.equal(items.length, 1);
  assert.match(items[0].headline, /Alpha FC injury update/);
});

test("Google News discovery fails open without inventing results", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response("Unavailable", { status: 503 })) as typeof fetch;

  try {
    const result = await discoverGoogleNews("Alpha vs Beta", {
      startsAt: "2026-10-05T18:00:00Z",
    });

    assert.equal(result.items.length, 0);
    assert.match(result.error ?? "", /HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public news discovery falls back to Bing when Google is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    requested.push(url);

    if (url.includes("news.google.com")) {
      return new Response("Unavailable", { status: 503 });
    }

    return new Response(sample, {
      status: 200,
      headers: { "content-type": "application/rss+xml" },
    });
  }) as typeof fetch;

  try {
    const result = await discoverPublicNews("Alpha vs Beta", {
      startsAt: "2026-10-05T18:00:00Z",
      limit: 5,
    });

    assert.equal(result.provider, "bing-news-rss");
    assert.equal(result.error, null);
    assert.equal(result.items.length, 1);
    assert.equal(requested.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("research discovery script is discovery-only and cannot mutate model state", async () => {
  const source = await readFile("scripts/discover-combo-research.ts", "utf8");

  assert.match(source, /mustReviewBeforeImport: true/);
  assert.match(source, /noOddsDerivedFromSearch: true/);
  assert.match(source, /noPredictionMutation: true/);
  assert.match(source, /noComboQualificationFromDiscoveryAlone: true/);
  assert.doesNotMatch(source, /intelligenceSignal\.(create|upsert|update)/);
  assert.doesNotMatch(source, /prediction\.(create|update|upsert)/);
  assert.doesNotMatch(source, /oddsSnapshot\.(create|update|upsert)/);
});


test("research discovery rejects circular tipster content", () => {
  assert.equal(
    isIndependentResearchDiscovery({
      headline: "Alpha vs Beta Prediction, Betting Tips & Odds",
      publisherName: "Tipster Example",
      publisherUrl: "https://tips.example",
      discoveryUrl: "https://news.example/item",
      publishedAt: "2026-10-05T10:00:00.000Z",
      summary: "Best bets and picks for the fixture.",
    }),
    false,
  );

  assert.equal(
    isIndependentResearchDiscovery({
      headline: "Alpha captain ruled out with hamstring injury",
      publisherName: "Local Sports Desk",
      publisherUrl: "https://sports.example",
      discoveryUrl: "https://news.example/injury",
      publishedAt: "2026-10-05T10:00:00.000Z",
      summary: "Club confirmed the absence before the fixture.",
    }),
    true,
  );
});

test("pre-event discovery drops stale articles outside the research window", () => {
  const items = preEventDiscoveries(
    [
      {
        headline: "Recent lineup update",
        publisherName: "Example",
        publisherUrl: "https://example.com",
        discoveryUrl: "https://example.com/recent",
        publishedAt: "2026-10-04T10:00:00.000Z",
        summary: null,
      },
      {
        headline: "Old injury report",
        publisherName: "Example",
        publisherUrl: "https://example.com",
        discoveryUrl: "https://example.com/old",
        publishedAt: "2026-08-01T10:00:00.000Z",
        summary: null,
      },
    ],
    "2026-10-06T18:00:00.000Z",
    10,
    21,
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].discoveryUrl, "https://example.com/recent");
});
