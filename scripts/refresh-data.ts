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

function hasFlag(name: string): boolean {
  return process.argv.includes("--" + name);
}

function positiveHours(
  envName: string,
  fallback: number,
  max = 24 * 14,
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

function endOfUtcDay(base: Date): Date {
  return new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

export function apiSportsEventTo(
  now: Date,
  forwardHours: number,
  allowFutureDates =
    process.env.API_SPORTS_ALLOW_FUTURE_DATES === "true",
): string {
  const requested = new Date(
    now.getTime() + forwardHours * 60 * 60 * 1000,
  );

  if (allowFutureDates) {
    return requested.toISOString();
  }

  const todayEnd = endOfUtcDay(now);
  return (requested < todayEnd ? requested : todayEnd).toISOString();
}

function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. In Codespaces, run npm run db:local first.",
    );
  }

  const apiSports = Boolean(process.env.API_SPORTS_KEY);
  const oddsApi = Boolean(process.env.ODDS_API_KEY);
  const includeOdds = hasFlag("include-odds");

  console.log("EDGE data refresh");
  console.log("-----------------");

  if (apiSports) {
    const now = new Date();
    const eventForwardHours = positiveHours(
      "API_SPORTS_EVENT_FORWARD_HOURS",
      24,
    );
    const resultLookbackHours = positiveHours(
      "API_SPORTS_RESULT_LOOKBACK_HOURS",
      24,
    );

    const eventTo = apiSportsEventTo(now, eventForwardHours);
    const futureDatesAllowed =
      process.env.API_SPORTS_ALLOW_FUTURE_DATES === "true";

    console.log(
      "Refreshing football/basketball events from API-Sports " +
        "(" +
        eventForwardHours +
        "h requested; future UTC dates " +
        (futureDatesAllowed ? "enabled" : "disabled") +
        ")...",
    );
    run("data:sync", [
      "--provider=api-sports",
      "--sports=football,basketball",
      "--to=" + eventTo,
    ]);

    console.log(
      "Refreshing recent final football/basketball results " +
        "(" +
        resultLookbackHours +
        "h lookback)...",
    );
    run("results:sync", [
      "--sports=football,basketball",
      "--from=" + isoOffset(now, -resultLookbackHours),
      "--to=" + now.toISOString(),
    ]);

    console.log("Refreshing football injury/suspension intelligence...");
    run("intelligence:sync");
  } else {
    console.log(
      "SKIP API-Sports evidence: API_SPORTS_KEY is not configured.",
    );
  }

  if (includeOdds) {
    if (!oddsApi) {
      throw new Error(
        "--include-odds was requested but ODDS_API_KEY is not configured.",
      );
    }

    console.log(
      "Refreshing Odds API event identities because --include-odds was explicitly requested...",
    );
    run("data:sync", ["--provider=odds-api", "--sports=all"]);

    console.log(
      "Refreshing recent tennis scores because --include-odds was explicitly requested...",
    );
    run("results:sync:odds");

    console.log(
      "Refreshing bookmaker odds because --include-odds was explicitly requested...",
    );
    run("odds:sync", ["--sports=all"]);
  } else {
    console.log(
      "SKIP The Odds API entirely: quota-sensitive event/odds calls require explicit --include-odds.",
    );
  }

  console.log("Recalculating transparent feature snapshots...");
  run("features:calculate", ["--sports=all"]);

  console.log("Generating Phase 7 market-evidence predictions...");
  run("predictions:generate");

  console.log("Running system readiness check...");
  run("doctor");

  console.log("EDGE data refresh complete.");
}

try {
  main();
} catch (error) {
  console.error("EDGE data refresh failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
