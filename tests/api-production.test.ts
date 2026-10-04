import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiRequestError,
  apiFailure,
  apiHeaders,
  getRequestId,
} from "../lib/production/api";

function requestWithId(value: string | null) {
  return {
    headers: new Headers(value ? { "x-request-id": value } : {}),
  };
}

test("request IDs accept bounded safe caller IDs and reject unsafe values", () => {
  assert.equal(
    getRequestId(requestWithId("client_12345") as never),
    "client_12345",
  );

  const generated = getRequestId(
    requestWithId("bad id with spaces") as never,
  );
  assert.match(generated, /^[0-9a-f-]{36}$/);
});

test("API headers always return correlation identity", () => {
  assert.deepEqual(apiHeaders("request-123", { "Cache-Control": "no-store" }), {
    "Cache-Control": "no-store",
    "X-Request-ID": "request-123",
  });
});

test("public request errors preserve only explicit safe client messages", async () => {
  const response = apiFailure(
    "/api/example",
    "request-123",
    new ApiRequestError("Invalid query.", 400),
    "Unavailable.",
    503,
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Invalid query.",
    requestId: "request-123",
  });
});
