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

function main() {
  const fullRefreshEveryHours = positiveInt(
    process.env.EDGE_FULL_REFRESH_EVERY_HOURS,
    8,
    24,
    "EDGE_FULL_REFRESH_EVERY_HOURS",
  );
  const now = new Date();
  const utcHour = now.getUTCHours();
  const fullRefresh = utcHour % fullRefreshEveryHours === 0;

  console.log("EDGE scheduled refresh");
  console.log("----------------------");
  console.log({
    utcHour,
    fullRefreshEveryHours,
    mode: fullRefresh ? "full" : "combo-only",
  });

  if (fullRefresh) {
    const args =
      process.env.EDGE_REFRESH_INCLUDE_ODDS === "true"
        ? ["--include-odds"]
        : [];
    run("data:refresh", args);
    return;
  }

  run("combo:refresh");
}

try {
  main();
} catch (error) {
  console.error("EDGE scheduled refresh failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
