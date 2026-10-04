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

  if (apiSports && oddsApi) {
    console.log("Refreshing events from configured provider strategy...");
    run("data:sync", ["--sports=all"]);
  } else if (apiSports) {
    console.log("Refreshing football/basketball events from API-Sports...");
    run("data:sync", [
      "--provider=api-sports",
      "--sports=football,basketball",
    ]);
  } else if (oddsApi) {
    console.log("Refreshing events from The Odds API...");
    run("data:sync", ["--provider=odds-api", "--sports=all"]);
  } else {
    console.log(
      "SKIP events: no sports provider key is configured. Existing database records are unchanged.",
    );
  }

  if (apiSports) {
    console.log("Refreshing recent final football/basketball results...");
    run("results:sync", ["--sports=football,basketball"]);

    console.log("Refreshing football injury/suspension intelligence...");
    run("intelligence:sync");
  } else {
    console.log("SKIP results/intelligence: API_SPORTS_KEY is not configured.");
  }

  if (includeOdds) {
    if (!oddsApi) {
      throw new Error(
        "--include-odds was requested but ODDS_API_KEY is not configured.",
      );
    }

    console.log(
      "Refreshing bookmaker odds because --include-odds was explicitly requested...",
    );
    run("odds:sync", ["--sports=all"]);
  } else {
    console.log(
      "SKIP odds: paid/quota-sensitive odds calls require explicit --include-odds.",
    );
  }

  console.log("Recalculating transparent feature snapshots...");
  run("features:calculate", ["--sports=all"]);

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
