import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const requiredRoutes = [
  "app/page.tsx",
  "app/events/page.tsx",
  "app/analysis/[eventId]/page.tsx",
  "app/opportunities/page.tsx",
  "app/combos/page.tsx",
  "app/history/page.tsx",
  "app/model/page.tsx",
  "app/settings/page.tsx",
  "app/setup/page.tsx",
];

test("Phase 4 required mobile routes exist", async () => {
  await Promise.all(requiredRoutes.map((route) => access(route)));
});

test("bottom navigation exposes the primary mobile destinations", async () => {
  const source = await readFile("components/BottomNav.tsx", "utf8");

  for (const destination of ["/", "/opportunities", "/combos", "/history", "/more"]) {
    assert.ok(source.includes(`href: "${destination}"`), `Missing nav destination ${destination}`);
  }
});

test("mobile UI preserves explicit uncertainty language", async () => {
  const [home, analysis, history] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/analysis/[eventId]/page.tsx", "utf8"),
    readFile("app/history/page.tsx", "utf8"),
  ]);

  assert.match(home, /NO BET/);
  assert.match(analysis, /AVAILABILITY UNCONFIRMED/);
  assert.match(history, /INSUFFICIENT DATA/);
});


test("history surface exposes source-backed settled results", async () => {
  const source = await readFile("app/history/page.tsx", "utf8");
  assert.match(source, /Settled results/);
  assert.match(source, /SOURCE-BACKED/);
  assert.match(source, /No settled model sample exists yet/);
});


test("setup center is reachable from More and treated as a More destination", async () => {
  const [more, nav, setup] = await Promise.all([
    readFile("app/more/page.tsx", "utf8"),
    readFile("components/BottomNav.tsx", "utf8"),
    readFile("app/setup/page.tsx", "utf8"),
  ]);

  assert.match(more, /href: "\/setup"/);
  assert.match(nav, /path\.startsWith\("\/setup"\)/);
  assert.match(setup, /SETUP COMPLETION/);
  assert.match(setup, /not a model-confidence or prediction-quality score/);
});
