import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: [".env.production.local", ".env.production", ".env.local", ".env"], quiet: true });

type Check = {
  label: string;
  ok: boolean;
  detail: string;
};

function databaseCheck(): Check {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return {
      label: "Production database",
      ok: false,
      detail: "DATABASE_URL is not configured.",
    };
  }

  try {
    const url = new URL(raw);
    const protocolOk = url.protocol === "postgresql:" || url.protocol === "postgres:";
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (!protocolOk) {
      return {
        label: "Production database",
        ok: false,
        detail: "DATABASE_URL must use PostgreSQL.",
      };
    }

    if (localHost) {
      return {
        label: "Production database",
        ok: false,
        detail: "DATABASE_URL points to a local host; production deployment requires an external PostgreSQL service.",
      };
    }

    return {
      label: "Production database",
      ok: true,
      detail: "External PostgreSQL URL is configured.",
    };
  } catch {
    return {
      label: "Production database",
      ok: false,
      detail: "DATABASE_URL is not a valid URL.",
    };
  }
}

async function migrationCheck(): Promise<Check> {
  const root = resolve(process.cwd(), "prisma", "migrations");

  try {
    const entries = await readdir(root, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory());

    for (const dir of dirs) {
      const file = resolve(root, dir.name, "migration.sql");
      try {
        const info = await stat(file);
        if (info.isFile() && info.size > 0) {
          return {
            label: "Migration history",
            ok: true,
            detail: "Prisma migration history is committed.",
          };
        }
      } catch {
        // Continue looking for a valid migration directory.
      }
    }

    return {
      label: "Migration history",
      ok: false,
      detail: "No committed migration.sql exists. Run npm run db:baseline:create before production deployment.",
    };
  } catch {
    return {
      label: "Migration history",
      ok: false,
      detail: "prisma/migrations does not exist. Run npm run db:baseline:create before production deployment.",
    };
  }
}

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const checks: Check[] = [
    {
      label: "Node.js",
      ok: nodeMajor === 22,
      detail: "Running Node.js " + process.versions.node + "; EDGE production expects major version 22.",
    },
    databaseCheck(),
    await migrationCheck(),
    {
      label: "API-Sports",
      ok: Boolean(process.env.API_SPORTS_KEY?.trim()),
      detail: process.env.API_SPORTS_KEY?.trim()
        ? "API_SPORTS_KEY is configured."
        : "API_SPORTS_KEY is missing; scheduled result/intelligence refresh will be unavailable.",
    },
  ];

  console.log("EDGE production preflight");
  console.log("-------------------------");

  for (const check of checks) {
    console.log("[" + (check.ok ? "OK" : "BLOCKED") + "] " + check.label + ": " + check.detail);
  }

  const requiredFailures = checks.slice(0, 3).filter((check) => !check.ok);
  if (requiredFailures.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log("[OK] Required production preflight checks passed. Secrets were not printed.");
}

main().catch((error) => {
  console.error("EDGE production preflight failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
