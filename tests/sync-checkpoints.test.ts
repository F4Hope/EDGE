import test from "node:test";
import assert from "node:assert/strict";
import {
  checkpointScope,
  withSyncCheckpoint,
} from "../lib/system/syncCheckpoint";

type UpsertCall = {
  update?: { lastStatus?: string; metadata?: unknown };
  create?: { lastStatus?: string; metadata?: unknown };
};

function fakeDb(calls: UpsertCall[]) {
  return {
    syncCheckpoint: {
      async upsert(args: UpsertCall) {
        calls.push(args);
        return {};
      },
    },
  };
}

test("checkpoint scopes remain stable by pipeline and sport", () => {
  assert.equal(checkpointScope("events", "football"), "events:football");
  assert.equal(checkpointScope("results", "basketball"), "results:basketball");
  assert.equal(checkpointScope("features"), "features");
});

test("successful work records running then completed", async () => {
  const calls: UpsertCall[] = [];
  const result = await withSyncCheckpoint(
    fakeDb(calls) as never,
    {
      provider: "api-sports",
      scope: "events:football",
      work: async () => ({ fetched: 4, persisted: 4 }),
      metadata: (value) => value,
    },
  );

  assert.equal(result.persisted, 4);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].update?.lastStatus, "RUNNING");
  assert.equal(calls[1].update?.lastStatus, "COMPLETED");
});

test("failed work records failure and preserves the original error", async () => {
  const calls: UpsertCall[] = [];
  const expected = new Error("provider unavailable");

  await assert.rejects(
    withSyncCheckpoint(
      fakeDb(calls) as never,
      {
        provider: "api-sports",
        scope: "results:football",
        work: async () => {
          throw expected;
        },
      },
    ),
    expected,
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[1].update?.lastStatus, "FAILED");
});
