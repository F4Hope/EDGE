import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import {
  dailyPrioritySoccerOddsKeys,
  prioritySoccerEventKeys,
} from "../lib/providers/soccerCoverage";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function getArg(name: string): string | undefined {
  const prefix = "--" + name + "=";
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveInt(
  value: string | undefined,
  fallback: number,
  max: number,
  label: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(label + " must be an integer from 1 to " + max + ".");
  }
  return parsed;
}

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

function runBestEffort(script: string, args: string[], label: string): boolean {
  try {
    run(script, args);
    return true;
  } catch (error) {
    console.warn("WARN " + label + " failed; continuing with stored evidence.");
    console.warn(error instanceof Error ? error.message : error);
    return false;
  }
}

function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  if (!process.env.ODDS_API_KEY) {
    throw new Error(
      "ODDS_API_KEY is not configured. Priority soccer pricing requires The Odds API.",
    );
  }

  const hours = positiveInt(getArg("hours"), 168, 336, "--hours");
  const maxOddsKeys = positiveInt(
    getArg("max-odds-keys") ?? process.env.ODDS_PRIORITY_MAX_SPORT_KEYS,
    dailyPrioritySoccerOddsKeys.length,
    dailyPrioritySoccerOddsKeys.length,
    "ODDS_PRIORITY_MAX_SPORT_KEYS",
  );

  const now = new Date();
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
  const pricedKeys = dailyPrioritySoccerOddsKeys.slice(0, maxOddsKeys);

  console.log("EDGE priority soccer coverage refresh");
  console.log("------------------------------------");
  console.log(
    "Discovering major-league and international fixtures for the next " +
      hours +
      " hours...",
  );
  run("data:sync", [
    "--provider=odds-api",
    "--sports=football",
    "--to=" + to,
    "--sport-keys=" + prioritySoccerEventKeys.join(","),
    "--max-sport-keys=" + String(prioritySoccerEventKeys.length),
  ]);

  runBestEffort(
    "events:reconcile",
    ["--apply", "--hours=" + String(hours)],
    "Cross-provider event reconciliation",
  );

  if (process.env.API_SPORTS_KEY) {
    console.log("Refreshing day-of API-Sports featured football markets...");
    runBestEffort(
      "analysis:refresh",
      ["--max-requests=25", "--hours=24"],
      "API-Sports day-of odds refresh",
    );
  }

  console.log(
    "Refreshing one-region H2H prices for " +
      pricedKeys.length +
      " priority soccer competitions...",
  );
  run("odds:sync", [
    "--sports=football",
    "--markets=h2h",
    "--to=" + to,
    "--sport-keys=" + pricedKeys.join(","),
    "--max-sport-keys=" + String(pricedKeys.length),
    "--event-max-sport-keys=" + String(prioritySoccerEventKeys.length),
  ]);

  console.log("Recalculating seven-day football features...");
  run("features:calculate", [
    "--sports=football",
    "--hours=" + String(hours),
    "--limit=1000",
  ]);

  console.log("Regenerating seven-day priced predictions...");
  run("predictions:generate", [
    "--hours=" + String(hours),
    "--limit=500",
  ]);

  console.log("Running readiness check...");
  run("doctor");

  console.log("EDGE priority soccer coverage refresh complete.", {
    hours,
    pricedCompetitionKeys: pricedKeys,
    discoveredCompetitionKeys: prioritySoccerEventKeys.length,
  });
}

try {
  main();
} catch (error) {
  console.error("EDGE priority soccer coverage refresh failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
