# EDGE — Sports Intelligence

EDGE is a mobile-first sports intelligence platform focused on probability, estimated value, risk, model agreement, data quality, and disciplined decision-making.

## Current foundation

Phase 1 established the Next.js 16 App Router application, TypeScript, Tailwind CSS 4, the premium mobile-first dashboard shell, the EDGE visual identity, and an explicit `NO BET` state when live data is unavailable.

Phase 2 adds the PostgreSQL + Prisma data layer for the long-term sports intelligence pipeline. The initial schema covers users, sports, leagues, teams, players, events, markets, odds snapshots, features, model runs, predictions, selections, combos, combo selections, and results without coupling the application to one sports-data provider.

Phase 3 adds the first real sports/event ingestion path. A provider abstraction normalizes API-Sports and The Odds API event data into the EDGE database, supports Football, Basketball, and Tennis, exposes read-only normalized events through `GET /api/events`, and keeps provider credentials server-side. No live events are fabricated when a provider is unavailable.

Phase 4 expands the premium mobile-first interface into the full application shell. The required Events, Analysis, Picks, Combo Builder, History, Model Performance, and Settings screens now exist, with a fifth More navigation surface for secondary tools. Events and event basics use real normalized database records when available; model metrics, EDGE SCORE, risk, performance, and BetPawa status remain explicitly unavailable until their later phases are implemented.

Phase 5 adds real featured-market odds ingestion through The Odds API. EDGE stores bookmaker-specific decimal odds snapshots for head-to-head/moneyline, spreads/handicaps, and totals, records provider update timestamps, deduplicates repeated snapshots, tracks quota headers, and attaches cross-provider event aliases only when participant/time identity is unambiguous. Event analysis now displays real stored bookmaker quotes, and the Events page can filter by league, country, market, and odds range.

Phase 6 adds the first transparent Feature Engine. It calculates deterministic model-input snapshots from evidence that EDGE actually has: event identity, schedule/rest context, market coverage, bookmaker breadth, current price consensus/dispersion, and sport-specific availability flags. Missing football, basketball, and tennis inputs are recorded explicitly rather than invented. Each feature snapshot receives a data-quality/completeness score and a stable fingerprint for deduplication. Phase 6 does not generate predictions.

Post-Phase-6 audit infrastructure adds sports result ingestion, statistical calibration/accuracy evaluation for any future settled model records, verified news/injury signal ingestion, descriptive odds-movement diagnostics, model-performance reporting with strict INSUFFICIENT DATA behavior, cursor pagination, health checks, and production security headers. Real-money wager selection/ticket automation is intentionally not implemented.

## System doctor

Run this before development or deployment. It reports Node compatibility, provider/database configuration, database reachability, and stored data counts without printing secrets.

```bash
npm run doctor
```

The in-app readiness screen is available at:

```text
/status
GET /api/system/readiness
```

EDGE also includes installable mobile-app metadata, safe loading/error/not-found states, and a database-aware health endpoint at `GET /api/health`.

The repository intentionally does not fabricate a `package-lock.json`. Generate it from a successful `npm install` in your Codespace, then commit it to lock transitive dependencies reproducibly.

## Codespace recovery

The repository includes a devcontainer that pins Node 22 and installs Docker-in-Docker support. When a Codespace is rebuilt from the current repository configuration, resume EDGE with:

```bash
npm run codespace:resume
```

The resume command verifies Node 22, restores the private local PostgreSQL service, applies the current development schema, seeds reference sports, runs the database smoke test, and validates Prisma. It does not reset or delete database data.

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

EDGE uses PostgreSQL with Prisma ORM 7.10.0.

### Codespaces / local development — recommended

No external database account or connection-string setup is required. EDGE can start a private PostgreSQL 16 container bound only to the Codespace loopback interface and configure the ignored `.env.local` automatically:

```bash
npm run db:local
```

That single command:

- starts PostgreSQL at `127.0.0.1:54329`
- writes the local development `DATABASE_URL` to ignored `.env.local`
- applies the current Prisma schema with `prisma db push`
- seeds Football, Basketball, and Tennis
- runs the database smoke test
- runs the EDGE system doctor

Stop the local database with:

```bash
npm run db:local:stop
```

View PostgreSQL logs with:

```bash
npm run db:local:logs
```

The Docker volume keeps local database data across normal container restarts. Do not use this development database configuration as a production database.

### External / production PostgreSQL

For deployment, configure a real server-side `DATABASE_URL` in the hosting environment and use migration history appropriate to that environment. Never paste production credentials into source code or commit them to Git.

Useful database command:

```bash
npm run db:studio
```

The seed only creates the three initial reference sports: Football, Basketball, and Tennis. It does not create fabricated events, odds, predictions, results, or performance statistics.

## Safe data refresh

After the local database is ready, refresh configured evidence sources with:

```bash
npm run data:refresh
```

This command refreshes event metadata from whichever provider keys are configured, refreshes API-Sports final results and football injury/suspension intelligence when available, recalculates transparent features, and runs the readiness doctor.

Bookmaker odds are deliberately excluded from the default refresh because those calls can consume provider quota. Include them only when explicitly intended:

```bash
npm run data:refresh -- --include-odds
```

If `--include-odds` is requested without `ODDS_API_KEY`, the refresh stops with a clear configuration error instead of making assumptions.

## Automatic result synchronization

When `API_SPORTS_KEY` is configured, EDGE can refresh final Football and Basketball results for events already known to the database:

```bash
npm run results:sync
```

The default window is the previous 72 hours through the current time. A bounded historical window can also be requested:

```bash
npm run results:sync -- --sports=football,basketball --from=2026-10-01 --to=2026-10-03
```

Result ingestion matches the stable provider/external event identifier already stored in `EventSource`. Final scores are persisted only when both sides are numeric. Cancelled or abandoned events are recorded as void. Non-final or incomplete score records are skipped rather than inferred.

Stored results are available read-only from:

```text
GET /api/results
GET /api/results?eventId=<EDGE_EVENT_ID>
```

## Automatic injury and suspension intelligence

When `API_SPORTS_KEY` is configured, EDGE can refresh source-backed Football availability intelligence for upcoming fixtures:

```bash
npm run intelligence:sync
```

The sync uses the API-Sports fixture injury feed, normalizes provider records into `INJURY`, `SUSPENSION`, or `LINEUP` signals, and updates the existing event intelligence surface. Provider fixture/player pairs use stable fingerprints, so refreshed reports update instead of duplicating.

A database checkpoint prevents accidental repeated calls inside a four-hour window. Force a refresh only when deliberately needed:

```bash
npm run intelligence:sync -- --force
```

Automated signals expire unless refreshed, so stale availability information is not kept indefinitely. Participant-side attribution is set only when the team identity can be matched reliably; otherwise EDGE leaves the side unknown rather than guessing.

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
