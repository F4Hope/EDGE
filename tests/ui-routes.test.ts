import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const requiredRoutes = [
  "app/page.tsx",
  "app/events/page.tsx",
  "app/analysis/[eventId]/page.tsx",
  "app/opportunities/page.tsx",
  "app/best-picks/page.tsx",
  "app/combos/page.tsx",
  "app/combos/weekly/page.tsx",
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
  assert.match(summary, /LEADING MODEL VIEW · SAFEST PROBABILITY/);
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
  assert.match(data, /modelProbability: \{ gte: MIN_PICK_MODEL_PROBABILITY \}/);
  assert.match(data, /estimatedValue: \{ gte: MIN_PICK_ESTIMATED_VALUE \}/);
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


test("history shows measured displayed Combo performance", async () => {
  const [page, data] = await Promise.all([
    readFile("app/history/page.tsx", "utf8"),
    readFile("lib/data/uiHistory.ts", "utf8"),
  ]);

  assert.match(page, /COMBOS SHOWN/);
  assert.match(page, /COMBO WINS/);
  assert.match(page, /COMBO LOSSES/);
  assert.match(page, /COMBO HIT RATE/);
  assert.match(page, /DISPLAYED COMBO AUDIT/);
  assert.match(page, /Pending and void recommendations are excluded from/);
  assert.match(data, /calculateDisplayedComboPerformance/);
  assert.match(data, /db\.combo\.findMany/);
});


test("history explains failed Combo legs and market failure patterns", async () => {
  const page = await readFile("app/history/page.tsx", "utf8");

  assert.match(page, /FAILURE PATTERNS/);
  assert.match(page, /Which markets broke displayed Combos/);
  assert.match(page, /FAILED ·/);
  assert.match(page, /failedLegs/);
  assert.match(page, /failureByMarket/);
});


test("picks page exposes best picks grouped by league", async () => {
  const [page, component, data] = await Promise.all([
    readFile("app/opportunities/page.tsx", "utf8"),
    readFile("components/LeagueBestPicks.tsx", "utf8"),
    readFile("lib/data/uiOpportunities.ts", "utf8"),
  ]);

  assert.match(page, /LeagueBestPicks/);
  assert.match(component, /Best picks by league/);
  assert.match(component, /up to three distinct qualified games per league/i);
  assert.match(data, /rankBestPicksByLeague/);
  assert.match(data, /cappedPerLeague/);
});


test("best picks has a dedicated visible route and remains visible when empty", async () => {
  const [page, picks, nav] = await Promise.all([
    readFile("app/best-picks/page.tsx", "utf8"),
    readFile("components/LeagueBestPicks.tsx", "utf8"),
    readFile("components/BottomNav.tsx", "utf8"),
  ]);

  assert.match(page, /Best picks by league/);
  assert.match(page, /Maximum three per league/);
  assert.match(page, /href="\/opportunities"/);
  assert.match(picks, /No league has a qualified best pick yet/);
  assert.doesNotMatch(picks, /groups\.length === 0\) return null/);
  assert.match(nav, /path\.startsWith\("\/best-picks"\)/);
});


test("Combo Pick route and visual participant refresh are wired into the app", async () => {
  const [page, eventCard, opportunityCard, bestPicks, nav, css] = await Promise.all([
    readFile("app/combo-pick/page.tsx", "utf8"),
    readFile("components/EventCard.tsx", "utf8"),
    readFile("components/OpportunityCard.tsx", "utf8"),
    readFile("components/LeagueBestPicks.tsx", "utf8"),
    readFile("components/BottomNav.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);

  assert.match(page, /READY-TO-READ TICKET/);
  assert.match(eventCard, /ParticipantBadge/);
  assert.match(opportunityCard, /ParticipantBadge/);
  assert.match(bestPicks, /ParticipantBadge/);
  assert.match(nav, /path\.startsWith\("\/combo-pick"\)/);
  assert.match(css, /EDGE visual refresh/);
  assert.match(css, /--edge-blue: #2979ff/);
  assert.match(css, /\.participant-badge/);
});


test("weekly Combo is a visible child of Combos and uses participant visuals", async () => {
  const [page, card, nav] = await Promise.all([
    readFile("app/combos/weekly/page.tsx", "utf8"),
    readFile("components/WeeklyComboCard.tsx", "utf8"),
    readFile("components/BottomNav.tsx", "utf8"),
  ]);

  assert.match(page, /WeeklyComboCard/);
  assert.match(card, /ParticipantBadge/);
  assert.match(card, /Football, basketball and tennis eligible/);
  assert.match(nav, /path\.startsWith\("\/combos"\)/);
});
