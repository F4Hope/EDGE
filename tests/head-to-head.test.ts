import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyHeadToHead,
  summarizeHeadToHead,
} from "../lib/features/headToHead";

test("head-to-head keeps participant identity when historical home/away roles reverse", () => {
  const h2h = summarizeHeadToHead(
    [
      {
        homeParticipantId: "a",
        awayParticipantId: "b",
        resultStatus: "FINAL",
        payload: { score: { home: 2, away: 0 } },
      },
      {
        homeParticipantId: "b",
        awayParticipantId: "a",
        resultStatus: "FINAL",
        payload: { score: { home: 3, away: 1 } },
      },
      {
        homeParticipantId: "a",
        awayParticipantId: "b",
        resultStatus: "FINAL",
        payload: { score: { home: 1, away: 1 } },
      },
    ],
    "a",
    "b",
  );

  assert.deepEqual(h2h, {
    sampleSize: 3,
    participantAWins: 1,
    draws: 1,
    participantBWins: 1,
    participantAWinRate: 0.3333,
    participantBWinRate: 0.3333,
    averageParticipantAScore: 1.3333,
    averageParticipantBScore: 1.3333,
  });
});

test("head-to-head skips unrelated, void, and malformed outcomes", () => {
  const h2h = summarizeHeadToHead(
    [
      {
        homeParticipantId: "a",
        awayParticipantId: "c",
        resultStatus: "FINAL",
        payload: { score: { home: 3, away: 0 } },
      },
      {
        homeParticipantId: "a",
        awayParticipantId: "b",
        resultStatus: "VOID",
        payload: { score: { home: 2, away: 0 } },
      },
      {
        homeParticipantId: "a",
        awayParticipantId: "b",
        resultStatus: "FINAL",
        payload: { score: { home: "2", away: 0 } },
      },
    ],
    "a",
    "b",
  );

  assert.deepEqual(h2h, emptyHeadToHead());
});

test("head-to-head respects a bounded recent valid sample", () => {
  const events = Array.from({ length: 15 }, (_, index) => ({
    homeParticipantId: index % 2 === 0 ? "a" : "b",
    awayParticipantId: index % 2 === 0 ? "b" : "a",
    resultStatus: "FINAL",
    payload: { score: { home: index % 2 === 0 ? 1 : 0, away: 0 } },
  }));

  const h2h = summarizeHeadToHead(events, "a", "b", 10);
  assert.equal(h2h.sampleSize, 10);
});
