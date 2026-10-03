# EDGE — Sports Intelligence

EDGE is a mobile-first sports intelligence platform focused on probability, estimated value, risk, model agreement, data quality, and disciplined decision-making.

## Current foundation

Phase 1 established the Next.js 16 App Router application, TypeScript, Tailwind CSS 4, the premium mobile-first dashboard shell, the EDGE visual identity, and an explicit `NO BET` state when live data is unavailable.

Phase 2 adds the PostgreSQL + Prisma data layer for the long-term sports intelligence pipeline. The initial schema covers users, sports, leagues, teams, players, events, markets, odds snapshots, features, model runs, predictions, selections, combos, combo selections, and results without coupling the application to one sports-data provider.

Phase 3 adds the first real sports/event ingestion path. A provider abstraction normalizes API-Sports and The Odds API event data into the EDGE database, supports Football, Basketball, and Tennis, exposes read-only normalized events through `GET /api/events`, and keeps provider credentials server-side. No live events are fabricated when a provider is unavailable.\n\nPhase 4 expands the premium mobile-first interface into the full application shell. The required Events, Analysis, Picks, Combo Builder, History, Model Performance, and Settings screens now exist, with a fifth More navigation surface for secondary tools. Events and event basics use real normalized database records when available; odds, model metrics, EDGE SCORE, risk, performance, and BetPawa status remain explicitly unavailable until their later phases are implemented.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run lint
npm run build
npm run db:validate
npm run test:providers
```

## Database setup

EDGE uses PostgreSQL with Prisma ORM 7.10.0. Keep the real database URL local and never paste it into source code or commit it to Git.

```bash
cp .env.example .env.local
```

Set `DATABASE_URL` inside `.env.local`, then run:

```bash
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run db:smoke
```

Useful database command:

```bash
npm run db:studio
```

The seed only creates the three initial reference sports: Football, Basketball, and Tennis. It does not create fabricated events, odds, predictions, results, or performance statistics.

## Sports/event ingestion

Provider secrets belong only in `.env.local`. EDGE never sends them to the browser.

```bash
SPORTS_DATA_PROVIDER="auto"
API_SPORTS_KEY="your-local-key"
ODDS_API_KEY="your-local-key"
```

Do not paste real keys into source files or commit them to Git.

Sync the next 48 hours using the configured provider strategy:

```bash
npm run data:sync
```

Or use an explicit date window and sports list:

```bash
npm run data:sync -- --sports=football,basketball,tennis --from=2026-10-04 --to=2026-10-05
```

To force a provider:

```bash
npm run data:sync -- --provider=api-sports --sports=football,basketball
npm run data:sync -- --provider=odds-api --sports=football,basketball,tennis
```

API-Sports is used for Football/Basketball in the initial adapter. The Odds API provides event discovery for Football, Basketball, and Tennis. The Odds API event endpoint is used only for event metadata in Phase 3; odds ingestion remains a later phase.

Once data has been synchronized, the application can read normalized events from:

```text
GET /api/events
GET /api/events?sport=football
GET /api/events?sport=tennis&limit=50
```

## Environment

`.env.example` documents the required server-side variables. `.env`, `.env.local`, API keys, passwords, tokens, and generated Prisma client files are excluded from Git.

## Product rule

EDGE does not claim guaranteed wins or guaranteed profit. When evidence, market quality, or availability is insufficient, the correct output is `NO BET`.
