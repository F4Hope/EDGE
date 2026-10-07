import dotenv from "dotenv";
import { spawnSync } from "node:child_process";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

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
    console.warn("WARN " + label + " failed; continuing with stored coverage.");
    console.warn(error instanceof Error ? error.message : error);
    return false;
  }
}

function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const maxRequests = positiveInt(
    process.env.COMBO_REFRESH_MAX_ODDS_REQUESTS,
    3,
    12,
    "COMBO_REFRESH_MAX_ODDS_REQUESTS",
  );
  const oddsHours = positiveInt(
    process.env.COMBO_REFRESH_ODDS_HOURS,
    48,
    72,
    "COMBO_REFRESH_ODDS_HOURS",
  );
  const modelHours = positiveInt(
    process.env.COMBO_REFRESH_MODEL_HOURS,
    168,
    336,
    "COMBO_REFRESH_MODEL_HOURS",
  );

  console.log("EDGE rolling Combo refresh");
  console.log("--------------------------");
  console.log({
    maxRequests,
    oddsHours,
    modelHours,
  });

  if (process.env.API_SPORTS_KEY) {
    console.log(
      "Refreshing a bounded set of nearest unpriced football fixtures from API-Sports...",
    );
    runBestEffort(
      "analysis:refresh",
      [
        "--max-requests=" + String(maxRequests),
        "--hours=" + String(oddsHours),
      ],
      "Rolling API-Sports Combo odds refresh",
    );
  } else {
    console.log(
      "SKIP rolling API-Sports odds refresh: API_SPORTS_KEY is not configured.",
    );
  }

  console.log("Reconciling stored provider identities for the rolling horizon...");
  runBestEffort(
    "events:reconcile",
    ["--apply", "--hours=" + String(modelHours)],
    "Rolling Combo event reconciliation",
  );

  console.log("Recalculating rolling feature snapshots...");
  run("features:calculate", [
    "--sports=all",
    "--hours=" + String(modelHours),
    "--limit=1000",
  ]);

  console.log("Regenerating rolling priced predictions...");
  run("predictions:generate", [
    "--hours=" + String(modelHours),
    "--limit=500",
  ]);

  console.log("EDGE rolling Combo refresh complete.");
}

try {
  main();
} catch (error) {
  console.error("EDGE rolling Combo refresh failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
