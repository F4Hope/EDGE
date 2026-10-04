# Changelog

## 0.8.0-rc.1 — Release candidate

This release candidate consolidates the current EDGE sports-intelligence application into a reproducible, testable, production-oriented codebase.

### Included

- Premium mobile-first Next.js application shell for Football, Basketball, and Tennis.
- PostgreSQL/Prisma data model with a committed baseline migration and zero-drift CI validation against PostgreSQL 16.
- Provider abstraction and normalized event ingestion through API-Sports and The Odds API.
- Featured-market odds snapshots with quota-conscious explicit synchronization.
- Source-backed Football/Basketball result synchronization and explicit Tennis score synchronization.
- Transparent `features-v3` evidence vectors with schedule/rest context, settled recent form, settled head-to-head history, market coverage, bookmaker breadth, and missing-evidence reporting.
- Injury/suspension/lineup intelligence, schedule-change/postponement auditing, descriptive odds movement, result history, and model-performance audit surfaces.
- Setup Center, system doctor, data freshness, pipeline checkpoints, zero-quota provider credential checks, and a strict live-data launch gate.
- Codespaces-native devcontainer recovery, Node 22 pinning, reproducible `npm ci`, standalone Docker output, liveness/readiness/version probes, production-container smoke testing, API correlation IDs, safe error envelopes, public read guards, dependency audits, and browser/runtime security headers.

### External credentials and production database still required

The repository intentionally contains no production secrets. Full live-data operation requires:

- a production PostgreSQL `DATABASE_URL`
- `API_SPORTS_KEY`
- `ODDS_API_KEY`
- provider synchronization after those credentials are configured

Use `/setup`, `npm run providers:check`, and `npm run launch:check` to verify the environment without printing secrets.

### Product boundary

EDGE is an intelligence and audit application. It does not place or construct real-money wagers automatically, and it does not guarantee wins or profit.

### Release validation

Run:

```bash
npm run release:check
```

That command performs runtime dependency audits followed by the full local validation suite. Production deployment also requires `npm run deploy:preflight`, committed migrations, and a green GitHub Actions build.
