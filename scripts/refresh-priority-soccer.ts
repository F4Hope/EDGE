import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import { prioritySoccerEventKeys } from "../lib/providers/soccerCoverage";

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
      "ODDS_API_KEY is not configured. Daily Combo coverage requires The Odds API.",
    );
  }

  const hours = positiveInt(getArg("hours"), 168, 336, "--hours");
  const footballKeys = positiveInt(
    getArg("football-keys") ?? process.env.ODDS_TODAY_FOOTBALL_KEYS,
    4,
    12,
    "ODDS_TODAY_FOOTBALL_KEYS",
  );
  const basketballKeys = positiveInt(
    getArg("basketball-keys") ?? process.env.ODDS_TODAY_BASKETBALL_KEYS,
    2,
    8,
    "ODDS_TODAY_BASKETBALL_KEYS",
  );
  const tennisKeys = positiveInt(
    getArg("tennis-keys") ?? process.env.ODDS_TODAY_TENNIS_KEYS,
    2,
    8,
    "ODDS_TODAY_TENNIS_KEYS",
  );

  const now = new Date();
  const isWeeklyBootstrap = now.getUTCDay() === 1;
  const pricingHours = isWeeklyBootstrap ? hours : 24;
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
  const pricingTo = new Date(
    now.getTime() + pricingHours * 60 * 60 * 1000,
  ).toISOString();

  console.log("EDGE today-first sports coverage refresh");
  console.log("---------------------------------------");
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
    console.log("Refreshing API-Sports featured markets, prioritizing fixtures with no stored price...");
    runBestEffort(
      "analysis:refresh",
      ["--max-requests=6", "--hours=48"],
      "API-Sports day-of odds refresh",
    );
  }

  console.log(
    "Pricing today-first football coverage with H2H + totals across up to " +
      footballKeys +
      " priority competitions...",
  );
  run("odds:sync", [
    "--sports=football",
    "--markets=h2h,totals",
    "--to=" + pricingTo,
    "--sport-keys=" + prioritySoccerEventKeys.join(","),
    "--max-sport-keys=" + String(footballKeys),
    "--event-max-sport-keys=" + String(prioritySoccerEventKeys.length),
  ]);

  console.log(
    "Pricing today-first basketball H2H coverage across the busiest active competitions...",
  );
  runBestEffort(
    "odds:sync",
    [
      "--sports=basketball",
      "--markets=h2h",
      "--to=" + pricingTo,
      "--max-sport-keys=" + String(basketballKeys),
      "--event-max-sport-keys=12",
    ],
    "Today basketball odds refresh",
  );

  console.log(
    "Pricing today-first tennis H2H coverage across the busiest active competitions...",
  );
  runBestEffort(
    "odds:sync",
    [
      "--sports=tennis",
      "--markets=h2h",
      "--to=" + pricingTo,
      "--max-sport-keys=" + String(tennisKeys),
      "--event-max-sport-keys=12",
    ],
    "Today tennis odds refresh",
  );

  console.log(
    isWeeklyBootstrap
      ? "Recalculating full-week features for Weekly Combo bootstrap..."
      : "Recalculating today-first features across all supported sports...",
  );
  run("features:calculate", [
    "--sports=all",
    "--hours=" + String(pricingHours),
    "--limit=1000",
  ]);

  console.log(
    isWeeklyBootstrap
      ? "Regenerating full-week priced predictions for Weekly Combo..."
      : "Regenerating today-first priced predictions...",
  );
  run("predictions:generate", [
    "--hours=" + String(pricingHours),
    "--limit=500",
  ]);

  console.log("Running readiness check...");
  run("doctor");

  console.log("EDGE today-first sports coverage refresh complete.", {
    discoveryHours: hours,
    pricingHours,
    weeklyBootstrap: isWeeklyBootstrap,
    paidCompetitionCaps: {
      football: footballKeys,
      basketball: basketballKeys,
      tennis: tennisKeys,
    },
    discoveredSoccerCompetitionKeys: prioritySoccerEventKeys.length,
  });
}

try {
  main();
} catch (error) {
  console.error("EDGE priority soccer coverage refresh failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
