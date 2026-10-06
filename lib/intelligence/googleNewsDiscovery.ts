export type GoogleNewsDiscoveryItem = {
  headline: string;
  publisherName: string | null;
  publisherUrl: string | null;
  discoveryUrl: string;
  publishedAt: string;
  summary: string | null;
};

export type PublicNewsDiscoveryResponse = {
  provider: "google-news-rss" | "bing-news-rss";
  query: string;
  feedUrl: string;
  items: GoogleNewsDiscoveryItem[];
  error: string | null;
};

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripTags(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function tag(block: string, name: string): string | null {
  const match = block.match(
    new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + name + ">", "i"),
  );
  return match ? decodeXml(match[1]) : null;
}

function source(block: string): {
  name: string | null;
  url: string | null;
} {
  const match = block.match(
    /<source(?:\s+url="([^"]*)")?>([\s\S]*?)<\/source>/i,
  );

  if (!match) {
    return { name: null, url: null };
  }

  return {
    url: match[1] ? decodeXml(match[1]) : null,
    name: match[2] ? stripTags(match[2]) : null,
  };
}

export function buildGoogleNewsRssUrl(
  query: string,
  locale = {
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  },
): string {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", locale.hl);
  url.searchParams.set("gl", locale.gl);
  url.searchParams.set("ceid", locale.ceid);
  return url.toString();
}

export function parseGoogleNewsRss(xml: string): GoogleNewsDiscoveryItem[] {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const seen = new Set<string>();
  const items: GoogleNewsDiscoveryItem[] = [];

  for (const block of blocks) {
    const headline = tag(block, "title");
    const discoveryUrl = tag(block, "link");
    const pubDate = tag(block, "pubDate");

    if (!headline || !discoveryUrl || !pubDate) continue;

    const published = new Date(pubDate);
    if (Number.isNaN(published.getTime())) continue;

    const key = discoveryUrl.trim();
    if (seen.has(key)) continue;
    seen.add(key);

    const publisher = source(block);
    const description = tag(block, "description");

    items.push({
      headline: stripTags(headline),
      publisherName: publisher.name,
      publisherUrl: publisher.url,
      discoveryUrl: discoveryUrl.trim(),
      publishedAt: published.toISOString(),
      summary: description ? stripTags(description) : null,
    });
  }

  return items;
}

export function preEventDiscoveries(
  items: GoogleNewsDiscoveryItem[],
  startsAt: string,
  limit = 5,
): GoogleNewsDiscoveryItem[] {
  const start = new Date(startsAt).getTime();

  if (!Number.isFinite(start)) {
    throw new Error("startsAt must be a valid date.");
  }

  return items
    .filter((item) => new Date(item.publishedAt).getTime() < start)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    )
    .slice(0, Math.max(1, Math.min(limit, 20)));
}

export function buildBingNewsRssUrl(query: string): string {
  const url = new URL("https://www.bing.com/news/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("mkt", "en-US");
  return url.toString();
}

async function discoverRss(
  provider: "google-news-rss" | "bing-news-rss",
  feedUrl: string,
  query: string,
  options: {
    startsAt: string;
    limit?: number;
    timeoutMs?: number;
  },
): Promise<PublicNewsDiscoveryResponse> {
  try {
    const response = await fetch(feedUrl, {
      method: "GET",
      headers: {
        accept: "application/rss+xml, application/xml, text/xml;q=0.9",
        "user-agent": "EDGE-Sports-Intelligence/0.8 source-discovery",
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        provider,
        query,
        feedUrl,
        items: [],
        error: provider + " returned HTTP " + response.status + ".",
      };
    }

    const xml = await response.text();
    return {
      provider,
      query,
      feedUrl,
      items: preEventDiscoveries(
        parseGoogleNewsRss(xml),
        options.startsAt,
        options.limit ?? 5,
      ),
      error: null,
    };
  } catch (error) {
    return {
      provider,
      query,
      feedUrl,
      items: [],
      error: error instanceof Error ? error.message : "Discovery request failed.",
    };
  }
}

export async function discoverGoogleNews(
  query: string,
  options: {
    startsAt: string;
    limit?: number;
    timeoutMs?: number;
  },
): Promise<PublicNewsDiscoveryResponse> {
  return discoverRss(
    "google-news-rss",
    buildGoogleNewsRssUrl(query),
    query,
    options,
  );
}

export async function discoverBingNews(
  query: string,
  options: {
    startsAt: string;
    limit?: number;
    timeoutMs?: number;
  },
): Promise<PublicNewsDiscoveryResponse> {
  return discoverRss(
    "bing-news-rss",
    buildBingNewsRssUrl(query),
    query,
    options,
  );
}

export async function discoverPublicNews(
  query: string,
  options: {
    startsAt: string;
    limit?: number;
    timeoutMs?: number;
  },
): Promise<PublicNewsDiscoveryResponse> {
  const google = await discoverGoogleNews(query, options);
  if (!google.error && google.items.length > 0) {
    return google;
  }

  const bing = await discoverBingNews(query, options);
  if (!bing.error && bing.items.length > 0) {
    return bing;
  }

  if (!bing.error && google.error) {
    return bing;
  }

  return {
    ...bing,
    error: [google.error, bing.error].filter(Boolean).join(" | ") || null,
  };
}
