import test from "node:test";
import assert from "node:assert/strict";
import { parsePageRequest } from "../lib/production/pagination";

test("pagination bounds payload size", () => {
  const params = new URLSearchParams("limit=9999&cursor=abc");
  const page = parsePageRequest(params, {
    defaultLimit: 50,
    maxLimit: 250,
  });

  assert.equal(page.limit, 250);
  assert.equal(page.cursor, "abc");
});

test("pagination uses safe defaults for invalid input", () => {
  const params = new URLSearchParams("limit=not-a-number");
  const page = parsePageRequest(params);

  assert.equal(page.limit, 50);
  assert.equal(page.cursor, null);
});
