import dotenv from "dotenv";
import { spawnSync } from "node:child_process";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function run(script: string, args: string[] = []) {
  const result = spawnSync("npm", ["run", script, "--", ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      "npm run " + script + " failed with exit code " + String(result.status) + ".",
    );
  }
}

function positiveHours(
  envName: string,
  fallback: number,
  max: number,
): number {
  const parsed = Number(process.env[envName] ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    throw new Error(
      envName + " must be a positive number no greater than " + max + ".",
    );
  }
  return parsed;
}

function isoOffset(base: Date, hours: number): string {
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. In Codespaces, run npm run db:local first.",
    );
  }

  if (!process.env.API_SPORTS_KEY) {
    throw new Error(
      "API_SPORTS_KEY is not configured. Historical refresh requires API-Sports.",
    );
  }

  const lookbackHours = positiveHours(
    "API_SPORTS_HISTORY_LOOKBACK_HOURS",
    48,
    72,
  );
  const now = new Date();
  const from = isoOffset(now, -lookbackHours);
  const to = now.toISOString();

  console.log("EDGE rolling history refresh");
  console.log("----------------------------");
  console.log(
    "Backfilling football/basketball event identities for the previous " +
      lookbackHours +
      " hours...",
  );

  run("data:sync", [
    "--provider=api-sports",
    "--sports=football,basketball",
    "--from=" + from,
    "--to=" + to,
  ]);

  console.log(
    "Settling football/basketball results across the same historical window...",
  );
  run("results:sync", [
    "--sports=football,basketball",
    "--from=" + from,
    "--to=" + to,
  ]);

  console.log("EDGE rolling history refresh complete.");
}

try {
  main();
} catch (error) {
  console.error("EDGE rolling history refresh failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
