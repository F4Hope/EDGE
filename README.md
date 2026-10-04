# EDGE — Sports Intelligence

EDGE is a mobile-first sports intelligence platform focused on probability, estimated value, risk, model agreement, data quality, and disciplined decision-making.

## Current foundation

Phase 1 established the Next.js 16 App Router application, TypeScript, Tailwind CSS 4, the premium mobile-first dashboard shell, the EDGE visual identity, and an explicit `NO BET` state when live data is unavailable.

Phase 2 adds the PostgreSQL + Prisma data layer for the long-term sports intelligence pipeline. The initial schema covers users, sports, leagues, teams, players, events, markets, odds snapshots, features, model runs, predictions, selections, combos, combo selections, and results without coupling the application to one sports-data provider.

Phase 3 adds the first real sports/event ingestion path. A provider abstraction normalizes API-Sports and The Odds API event data into the EDGE database, supports Football, Basketball, and Tennis, exposes read-only normalized events through `GET /api/events`, and keeps provider credentials server-side. No live events are fabricated when a provider is unavailable.

Phase 4 expands the premium mobile-first interface into the full application shell. The required Events, Analysis, Picks, Combo Builder, History, Model Performance, and Settings screens now exist, with a fifth More navigation surface for secondary tools. Events and event basics use real normalized database records when available; model metrics, EDGE SCORE, risk, performance, and BetPawa status remain explicitly unavailable until their later phases are implemented.

Phase 5 adds real featured-market odds ingestion through The Odds API. EDGE stores bookmaker-specific decimal odds snapshots for head-to-head/moneyline, spreads/handicaps, and totals, records provider update timestamps, deduplicates repeated snapshots, tracks quota headers, and attaches cross-provider event aliases only when participant/time identity is unambiguous. Event analysis now displays real stored bookmaker quotes, and the Events page can filter by league, country, market, and odds range.

Phase 6 adds the transparent Feature Engine. The current `features-v3` vector calculates deterministic model-input snapshots from evidence that EDGE actually has: event identity, schedule/rest context, settled recent form, settled head-to-head history, market coverage, bookmaker breadth, current price consensus/dispersion, and sport-specific availability flags. Recent form is derived only from valid FINAL score records within the existing 60-day evidence window, using at most the ten most recent settled samples per participant. Missing football, basketball, and tennis inputs are recorded explicitly rather than invented. Each feature snapshot receives a data-quality/completeness score and a stable fingerprint for deduplication. The Feature Engine does not generate predictions.

Post-Phase-6 audit infrastructure adds sports result ingestion, statistical calibration/accuracy evaluation for any future settled model records, verified news/injury signal ingestion, descriptive odds-movement diagnostics, model-performance reporting with strict INSUFFICIENT DATA behavior, cursor pagination, health checks, and production security headers. Real-money wager selection/ticket automation is intentionally not implemented.

## Release candidate

The current package version is `0.8.0-rc.1`. This marks the codebase as a release candidate; it does not claim external live-data configuration is already complete.

Run the complete local release gate with:

```bash
npm run release:check
```

See `CHANGELOG.md` for the included capabilities, remaining environment requirements, and the product boundary.

## Setup Center

The mobile app includes a plain-language Setup Center at `/setup`. It reports a five-step live-data setup percentage based only on real configuration and stored evidence:

1. reachable database
2. API-Sports configured
3. The Odds API configured
4. normalized event data stored
5. transparent feature snapshots stored

The percentage is configuration/evidence readiness only. It is never used as model confidence, prediction quality, or a wagering signal. The page shows one safe next action at a time and never renders secret values.

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

Data freshness is reported separately for event metadata, odds snapshots, feature calculations, settled results, intelligence observations, and the API-Sports injury sync checkpoint. A configured provider is therefore distinguishable from a provider that has actually delivered recent evidence.

Provider sync checkpoints record RUNNING, COMPLETED, or FAILED state for event, result, odds, and injury-intelligence pipelines. The Status screen displays their latest completion time without exposing provider credentials.

EDGE also includes installable mobile-app metadata, safe loading/error/not-found states, and a database-aware health endpoint at `GET /api/health`.

The repository includes a committed `package-lock.json`; CI uses `npm ci` so dependency resolution is reproducible.

## Codespace recovery

The repository includes a devcontainer that pins Node 22 and installs Docker-in-Docker support. Dependency installation uses the committed lockfile with `npm ci`.

Every subsequent Codespace start now runs `npm run codespace:auto-start` automatically. It restores the private local PostgreSQL service, reapplies the current development schema safely, seeds reference sports, runs the database smoke test, and validates Prisma. It does **not** call sports providers, refresh live data, or consume The Odds API quota.

If automatic recovery reports a warning, the full manual recovery command remains:

```bash
npm run codespace:resume
```

The resume command verifies Node 22, installs locked dependencies only when needed, restores the private local PostgreSQL service, applies the current development schema, seeds reference sports, runs the database smoke test, validates Prisma, and runs the readiness doctor. It does not reset/delete database data or trigger provider refreshes.

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

For deployment, configure a real server-side `DATABASE_URL` in the hosting environment. Never paste production credentials into source code or commit them to Git.

## Production deployment safety

EDGE separates development schema synchronization from production migration deployment.

Development/Codespaces may use:

```bash
npm run db:local
npm run db:push
```

Production must use committed Prisma migrations:

```bash
npm run deploy:preflight
npm run db:deploy
```

`deploy:preflight` blocks production deployment when Node is not 22, `DATABASE_URL` is missing/invalid/local, or no committed migration history exists. It never prints secrets.

The initial `0_init` migration is committed under `prisma/migrations/0_init/migration.sql`. It was generated directly from the current Prisma schema using Prisma 7's supported `migrate diff --from-empty --to-schema ... --script` flow rather than handwritten SQL.

CI applies the committed migration to a clean PostgreSQL 16 service and runs `npm run db:drift:check`; any difference between the migrated database and `schema.prisma` fails the build.

If an existing database was previously created using `db push`, review the committed baseline and mark it as applied once with Prisma `migrate resolve --applied 0_init` before using `db:deploy` for future migrations. New empty production databases should simply run `npm run db:deploy`.

Useful database command:

```bash
npm run db:studio
```

## Browser security policy

Production responses include a Content Security Policy that restricts scripts, connections, forms, frames, objects, fonts, media, workers, and manifests. Browser network connections are limited to same-origin application endpoints; sports-provider credentials and provider API calls remain server-side.

EDGE also sends HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, Referrer Policy, and Permissions Policy headers. CI boots the production container and verifies the critical runtime headers on the live service.

## Public API abuse safeguards

Database-backed public GET routes use a lightweight in-process read guard. The guard keeps only a short hashed client key in memory, returns HTTP 429 with `Retry-After` and rate-limit headers after a bounded burst, and caps its in-memory bucket count. Health and version probes are intentionally exempt so deployment monitoring cannot lock itself out.

This is a process-level safety net, not a distributed DDoS control. Production deployments should still place EDGE behind the hosting platform's CDN/WAF/rate-limit controls.

Opaque event/cursor identifiers are bounded to 128 safe characters, and the events API rejects date windows longer than 31 days. Pagination remains capped separately.

## API request correlation

Public API responses include an `X-Request-ID` header. Callers may supply a bounded alphanumeric/underscore/hyphen `X-Request-ID`; otherwise EDGE generates a UUID. Where a response body already has metadata, the same request ID is included there for easier incident correlation.

Unexpected API failures are logged server-side as structured JSON containing the route, request ID, error class, and non-sensitive error code. Raw exception messages, stack traces, database URLs, and provider secrets are not returned to clients. Explicit validation errors remain safe and descriptive.

## Runtime probes and build identity

EDGE exposes separate operational probes:

```text
GET /api/health/live   # process liveness; does not require the database
GET /api/health/ready  # database-backed readiness; returns 503 when unavailable
GET /api/health        # compatibility alias for readiness
GET /api/version       # non-secret service/version/build metadata
```

The liveness response includes uptime plus application version/build identity. Readiness verifies PostgreSQL reachability. These endpoints use `Cache-Control: no-store` and do not expose provider keys, database URLs, or other secrets.

## Container deployment

EDGE includes a multi-stage production `Dockerfile` using Node.js 22 and Next.js standalone output. The runtime image runs as the unprivileged `nextjs` user and uses `/api/health/live` for its Docker liveness check. The CI image also embeds the non-secret Git commit SHA as `EDGE_BUILD_SHA`.

Build locally:

```bash
docker build -t edge-sports-intelligence .
```

Run only after production migrations have been applied and supply secrets at runtime rather than baking them into the image:

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e API_SPORTS_KEY="..." \
  edge-sports-intelligence
```

The image does not contain `.env` files. CI builds the production image after the application and migration jobs pass. CI also boots the completed image, verifies liveness without a database, verifies readiness correctly returns HTTP 503 without database configuration, and confirms the embedded Git SHA through `/api/version`.

The seed only creates the three initial reference sports: Football, Basketball, and Tennis. It does not create fabricated events, odds, predictions, results, or performance statistics.

### Settled recent-form evidence

`features-v3` includes source-backed recent form from EDGE's own settled history. For each participant it records sample size, wins/draws/losses, win rate, and average score for/against when valid FINAL result data exists. Football values represent goals, Basketball values represent points, and Tennis values represent the provider's completed match score units.

If no valid settled sample exists, recent form remains missing and the UI displays `NO SAMPLE`; EDGE does not substitute zeros or infer outcomes from odds.

### Settled head-to-head evidence

`features-v3` also derives head-to-head evidence from valid FINAL results for the same two participants. EDGE looks back up to 730 days and uses at most the ten most recent valid meetings. Historical home/away roles are normalized back to participant A/B identity, so a reversed venue does not reverse the meaning of the statistics.

The vector records H2H sample size, participant A/B wins and win rates, draws, and average score units for each side. When no valid H2H sample exists, the matchup-history gap remains explicitly missing.

## Full live-data launch gate

Before treating an environment as fully live-data ready, run:

```bash
npm run launch:check
```

The gate is intentionally stricter than the general Status page. It requires:

- Node.js 22
- configured and reachable PostgreSQL
- an active API-Sports credential
- an active The Odds API credential
- at least one normalized event
- at least one bookmaker odds snapshot
- at least one transparent feature snapshot

Provider credential checks use the same non-secret status/catalog validation described below. The command exits non-zero when any launch requirement is missing and never prints API keys, passwords, or database URLs.

Passing `launch:check` verifies live-data readiness; production deployment still separately requires `deploy:preflight`, committed migrations, and CI.

## Provider credential check

After a provider secret is configured, validate connectivity without printing the credential:

```bash
npm run providers:check
```

The API-Sports check uses its documented `/status` endpoint, and The Odds API check uses `/v4/sports`. Both provider docs state those calls do not count against the normal usage quota. The command reports only generic reachability/authorization status, safe remaining-quota headers when available, and active sport count for The Odds API. It never prints the API key or request URL containing it.

Missing credentials produce warnings without making network calls. A configured credential that is rejected or unreachable causes a non-zero exit so setup problems are visible.

## Safe data refresh

After the local database is ready, refresh configured evidence sources with:

```bash
npm run data:refresh
```

This command refreshes Football/Basketball event metadata from API-Sports when configured, refreshes API-Sports final results and football injury/suspension intelligence, recalculates transparent features, and runs the readiness doctor.

The Odds API is deliberately excluded entirely from the default refresh—including event discovery—because those calls can consume provider quota. Include them only when explicitly intended:

```bash
npm run data:refresh -- --include-odds
```

If `--include-odds` is requested without `ODDS_API_KEY`, the refresh stops with a clear configuration error instead of making assumptions.

## Automated evidence refresh

EDGE includes an opt-in GitHub Actions workflow at `.github/workflows/evidence-refresh.yml`. It can run the standard source-backed refresh every four hours without using The Odds API.

Scheduled execution is disabled by default. Enable it only after production database/API-Sports secrets are configured by setting the repository variable:

```text
EDGE_SCHEDULED_REFRESH_ENABLED=true
```

Required repository secrets for scheduled refresh:

```text
EDGE_DATABASE_URL
API_SPORTS_KEY
```

The scheduled path runs only `npm run data:refresh`, which never invokes The Odds API. A manual workflow dispatch exposes an `include_odds` boolean; only when that option is explicitly enabled does the workflow require `ODDS_API_KEY` and run `npm run data:refresh -- --include-odds`.

Optional repository variables can configure the explicit odds path without putting values in source:

```text
ODDS_API_REGIONS
ODDS_API_MARKETS
ODDS_API_SPORT_KEYS
ODDS_SYNC_MAX_SPORT_KEYS
ODDS_RESULT_MAX_SPORT_KEYS
```

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

### Tennis results via The Odds API

Recent tennis results use a separate, explicitly quota-sensitive path:

```bash
npm run results:sync:odds
```

The command looks only at recent tennis sport keys already stored in EDGE `EventSource` records, requests completed scores for up to three days, and caps the number of sport keys queried. The default cap is four and can be changed deliberately with:

```text
ODDS_RESULT_MAX_SPORT_KEYS=4
```

This command is never used by the default scheduled refresh. It is invoked automatically only inside `npm run data:refresh -- --include-odds`, where Odds API usage has already been explicitly requested.

## Automatic schedule-change intelligence

Normal event synchronization now audits meaningful changes to events that were already stored. A provider start-time move of at least one minute creates a `SCHEDULE_CHANGE` signal; a transition into `POSTPONED` creates a high-severity `POSTPONEMENT` signal.

Signals are created only when an existing event changes, never on first import. They are fingerprinted for deduplication, written in the same database transaction as the event update, and expired when no longer relevant. When a previously postponed event is restored, the active automated postponement signal is closed rather than left stale.

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
