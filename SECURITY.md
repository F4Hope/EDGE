# EDGE Security Policy

## Supported development line

The active `main` branch is the supported development line.

## Dependency security gates

CI enforces two dependency checks:

- `npm run audit:runtime` blocks high-or-critical advisories in the runtime dependency tree. Development and optional tooling are omitted from this gate.
- `npm run audit:critical` blocks critical advisories anywhere in the full installed dependency tree.

This separation is intentional. Build tooling is still audited, but a high-severity advisory in tooling that is not shipped or reachable from the running application does not masquerade as a production runtime vulnerability.

## Tracked Prisma 7 tooling advisories

As of October 2026, Prisma ORM 7.10.0 is the latest stable Prisma 7 release used by EDGE. Its CLI dependency tree includes known high-severity advisories that do not belong to the running EDGE PostgreSQL application:

- `deepmerge-ts@7.1.5` — GHSA-ggr8-5vv4-36mx. The patched line begins at deepmerge-ts 8.0.0. Prisma 7.10.0 still pins 7.1.5 through `@prisma/config`.
- `mysql2@3.15.3` — GHSA-3f6p-5ww8-9rcr and GHSA-rgwj-5xj2-c3m3. EDGE does not use MySQL; this package is present through the Prisma CLI tooling tree.

The affected Prisma subtree is recorded as `devOptional` in the lockfile. EDGE runtime database access uses `@prisma/client`, `@prisma/adapter-pg`, and PostgreSQL.

Do not run `npm audit fix --force` to silence these reports. npm currently proposes a breaking Prisma 6 downgrade, while Prisma 8 remains pre-release. The safer policy is to keep the runtime audit strict, keep critical issues strict across the full tree, and remove this exception when a stable Prisma release consumes patched transitive versions.

## Secrets

Provider keys, database passwords, tokens, and production connection strings must remain server-side. Local secrets belong in ignored environment files such as `.env.local`; they must never be committed.

## Reporting

Do not open a public issue containing credentials, tokens, private database URLs, or other secrets. Revoke any credential that is accidentally exposed before discussing the incident.
