import test from "node:test";
import assert from "node:assert/strict";
import {
  checkApiSportsCredential,
  checkOddsApiCredential,
} from "../lib/providers/health";

function response(
  body: unknown,
  init: {
    status?: number;
    headers?: Record<string, string>;
  } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

test("provider checks stay offline when credentials are absent", async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls += 1;
    return response({});
  }) as typeof fetch;

  const [apiSports, odds] = await Promise.all([
    checkApiSportsCredential(undefined, fakeFetch),
    checkOddsApiCredential("", fakeFetch),
  ]);

  assert.equal(calls, 0);
  assert.equal(apiSports.configured, false);
  assert.equal(odds.configured, false);
});

test("API-Sports status check recognizes an active credential without returning it", async () => {
  const fakeFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(
      new Headers(init?.headers).get("x-apisports-key"),
      "secret-api-sports",
    );
    return response(
      {
        errors: [],
        response: {
          subscription: { active: true },
        },
      },
      {
        headers: {
          "x-ratelimit-requests-remaining": "97",
        },
      },
    );
  }) as typeof fetch;

  const result = await checkApiSportsCredential(
    "secret-api-sports",
    fakeFetch,
  );

  assert.equal(result.ok, true);
  assert.equal(result.quotaRemaining, 97);
  assert.doesNotMatch(JSON.stringify(result), /secret-api-sports/);
});

test("The Odds API catalog check returns active sport count and never exposes the key", async () => {
  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("apiKey"), "secret-odds");
    return response(
      [{ key: "soccer_epl" }, { key: "tennis_atp_example" }],
      {
        headers: {
          "x-requests-remaining": "488",
        },
      },
    );
  }) as typeof fetch;

  const result = await checkOddsApiCredential("secret-odds", fakeFetch);

  assert.equal(result.ok, true);
  assert.equal(result.activeSports, 2);
  assert.equal(result.quotaRemaining, 488);
  assert.doesNotMatch(JSON.stringify(result), /secret-odds/);
});

test("configured provider failures are reported generically", async () => {
  const fakeFetch = (async () =>
    response({ message: "bad key" }, { status: 401 })) as typeof fetch;

  const result = await checkOddsApiCredential("bad-secret", fakeFetch);

  assert.equal(result.configured, true);
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.detail, /bad-secret|bad key/);
});
