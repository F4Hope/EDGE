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

test("events defaults to priced fixtures and preserves all-fixtures inspection", async () => {
  const source = await readFile("app/events/page.tsx", "utf8");

  assert.match(source, /WITH ODDS/);
  assert.match(source, /ALL FIXTURES/);
  assert.match(source, /coverage = first\(params\.coverage\) === "all" \? "all" : "odds"/);
  assert.match(source, /requireOdds: coverage === "odds"/);
});

test("event cards expose canonical odds roles, source and freshness", async () => {
  const [card, data] = await Promise.all([
    readFile("components/EventCard.tsx", "utf8"),
    readFile("lib/data/uiEvents.ts", "utf8"),
  ]);

  assert.match(card, /HOME/);
  assert.match(card, /DRAW/);
  assert.match(card, /AWAY/);
  assert.match(card, /formatOddsAge/);
  assert.match(card, /quote\.bookmakerName/);
  assert.match(card, /quote\.provider/);
  assert.match(data, /provider: snapshot\.provider/);
});

test("analysis page leads with a guarded decision summary", async () => {
  const [analysis, summary] = await Promise.all([
    readFile("app/analysis/[eventId]/page.tsx", "utf8"),
    readFile("components/PredictionDecisionSummary.tsx", "utf8"),
  ]);

  assert.match(analysis, /DECISION SUMMARY/);
  assert.match(analysis, /pickPrimaryPrediction/);
  assert.match(analysis, /HOME FORM/);
  assert.match(analysis, /HEAD TO HEAD/);
  assert.match(summary, /LEADING MODEL VIEW/);
  assert.match(summary, /not a bet recommendation or guarantee of outcome/);
  assert.match(summary, /ESTIMATED VALUE/);
  assert.match(summary, /MARKET PROBABILITY/);
});

test("opportunities page requires independent evidence and stays validation-gated", async () => {
  const [page, card, data] = await Promise.all([
    readFile("app/opportunities/page.tsx", "utf8"),
    readFile("components/OpportunityCard.tsx", "utf8"),
    readFile("lib/data/uiOpportunities.ts", "utf8"),
  ]);

  assert.match(page, /Ranked opportunities/);
  assert.match(page, /ESTIMATED VALUE/);
  assert.match(page, /HISTORICAL EVIDENCE/);
  assert.match(page, /MODEL VS MARKET/);
  assert.match(page, /BETTABLE remains disabled/);
  assert.match(card, /INDEPENDENT-EVIDENCE WATCH/);
  assert.match(card, /MODEL LIFT/);
  assert.match(card, /VIEW ANALYSIS/);
  assert.match(data, /estimatedValue: \{ gt: 0 \}/);
  assert.match(data, /dataQuality: \{ gte: 0\.5 \}/);
  assert.match(data, /modelAgreement: \{ gte: 0\.6 \}/);
  assert.match(data, /independentEvidenceSupport/);
  assert.match(data, /rankOneOpportunityPerEvent/);
});


test("combo page preloads a live default and exposes price provenance", async () => {
  const [page, builder, data] = await Promise.all([
    readFile("app/combos/page.tsx", "utf8"),
    readFile("components/ComboBuilder.tsx", "utf8"),
    readFile("lib/data/uiCombos.ts", "utf8"),
  ]);

  assert.match(page, /getComboCandidatePool/);
  assert.match(page, /buildCombo\(pool\.candidates, 2, "BALANCED"\)/);
  assert.match(page, /initialResult=/);
  assert.match(builder, /initialResult/);
  assert.match(builder, /bookmakerName/);
  assert.match(builder, /oddsProvider/);
  assert.match(builder, /marketProbability/);
  assert.match(builder, /modelLift/);
  assert.match(data, /independentEvidenceSupport/);
});
