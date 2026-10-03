# EDGE — Sports Intelligence

EDGE is a mobile-first sports intelligence platform focused on probability, estimated value, risk, model agreement, data quality, and disciplined decision-making.

## Current foundation

Phase 1 established the Next.js 16 App Router application, TypeScript, Tailwind CSS 4, the premium mobile-first dashboard shell, the EDGE visual identity, and an explicit `NO BET` state when live data is unavailable.

Phase 2 adds the PostgreSQL + Prisma data layer for the long-term sports intelligence pipeline. The initial schema covers users, sports, leagues, teams, players, events, markets, odds snapshots, features, model runs, predictions, selections, combos, combo selections, and results without coupling the application to one sports-data provider.

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

## Environment

`.env.example` documents the required server-side variables. `.env`, `.env.local`, API keys, passwords, tokens, and generated Prisma client files are excluded from Git.

## Product rule

EDGE does not claim guaranteed wins or guaranteed profit. When evidence, market quality, or availability is insufficient, the correct output is `NO BET`.
