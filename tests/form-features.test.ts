import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyParticipantForm,
  summarizeParticipantForm,
} from "../lib/features/form";

test("participant form is relative to home/away identity", () => {
  const form = summarizeParticipantForm(
    [
      {
        homeParticipantId: "alpha",
        awayParticipantId: "beta",
        resultStatus: "FINAL",
        payload: { score: { home: 2, away: 1 } },
      },
      {
        homeParticipantId: "gamma",
        awayParticipantId: "alpha",
        resultStatus: "FINAL",
        payload: { score: { home: 1, away: 1 } },
      },
      {
        homeParticipantId: "alpha",
        awayParticipantId: "delta",
        resultStatus: "FINAL",
        payload: { score: { home: 0, away: 3 } },
      },
    ],
    "alpha",
  );

  assert.deepEqual(form, {
    sampleSize: 3,
    wins: 1,
    draws: 1,
    losses: 1,
    winRate: 0.3333,
    averageFor: 1,
    averageAgainst: 1.6667,
  });
});

test("participant form skips void, pending, malformed, and unrelated results", () => {
  const form = summarizeParticipantForm(
    [
      {
        homeParticipantId: "alpha",
        awayParticipantId: "beta",
        resultStatus: "VOID",
        payload: { score: { home: 4, away: 0 } },
      },
      {
        homeParticipantId: "alpha",
        awayParticipantId: "beta",
        resultStatus: "FINAL",
        payload: { score: { home: "2", away: 1 } },
      },
      {
        homeParticipantId: "gamma",
        awayParticipantId: "beta",
        resultStatus: "FINAL",
        payload: { score: { home: 3, away: 2 } },
      },
    ],
    "alpha",
  );

  assert.deepEqual(form, emptyParticipantForm());
});

test("participant form respects the most-recent valid sample limit", () => {
  const events = Array.from({ length: 12 }, (_, index) => ({
    homeParticipantId: "alpha",
    awayParticipantId: "beta-" + index,
    resultStatus: "FINAL",
    payload: { score: { home: index < 10 ? 1 : 0, away: 0 } },
  }));

  const form = summarizeParticipantForm(events, "alpha", 10);

  assert.equal(form.sampleSize, 10);
  assert.equal(form.wins, 10);
  assert.equal(form.winRate, 1);
});

test("draw-free tennis-style scores work without special inference", () => {
  const form = summarizeParticipantForm(
    [
      {
        homeParticipantId: "player-a",
        awayParticipantId: "player-b",
        resultStatus: "FINAL",
        payload: { score: { home: 2, away: 0 } },
      },
      {
        homeParticipantId: "player-c",
        awayParticipantId: "player-a",
        resultStatus: "FINAL",
        payload: { score: { home: 2, away: 1 } },
      },
    ],
    "player-a",
  );

  assert.equal(form.sampleSize, 2);
  assert.equal(form.wins, 1);
  assert.equal(form.losses, 1);
  assert.equal(form.draws, 0);
  assert.equal(form.averageFor, 1.5);
});
