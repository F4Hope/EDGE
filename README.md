# EDGE — Sports Intelligence

EDGE is a mobile-first sports intelligence platform focused on probability, estimated value, risk, model agreement, data quality, and disciplined decision-making.

## Phase 1

The initial foundation includes:

- Next.js 16 with App Router
- TypeScript
- Tailwind CSS 4
- mobile-first premium dashboard shell
- EDGE visual identity and design tokens
- explicit `NO BET` state when live data is unavailable
- initial provider abstraction types for Football, Basketball, and Tennis
- environment-variable placeholders with secrets excluded from Git

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
```

## Environment

Copy `.env.example` to `.env.local` and add provider/database credentials locally. Never commit `.env.local` or provider secrets.

## Product rule

EDGE does not claim guaranteed wins or guaranteed profit. When evidence, market quality, or availability is insufficient, the correct output is `NO BET`.
