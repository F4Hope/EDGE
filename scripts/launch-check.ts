import dotenv from "dotenv";
import {
  checkApiSportsCredential,
  checkOddsApiCredential,
} from "../lib/providers/health";
import { buildLaunchGate } from "../lib/system/launch";
import { getSystemReadiness } from "../lib/system/readiness";

dotenv.config({
  path: [".env.production.local", ".env.production", ".env.local", ".env"],
  quiet: true,
});

async function main() {
  console.log("EDGE live launch gate");
  console.log("---------------------");
  console.log(
    "[INFO] This check never prints provider keys, passwords, or database URLs.",
  );

  const readiness = await getSystemReadiness();
  const [apiSports, oddsApi] = await Promise.all([
    checkApiSportsCredential(process.env.API_SPORTS_KEY),
    checkOddsApiCredential(process.env.ODDS_API_KEY),
  ]);

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const gate = buildLaunchGate(
    readiness,
    apiSports,
    oddsApi,
    nodeMajor,
  );

  for (const check of gate.checks) {
    console.log(
      "[" +
        (check.passed ? "OK" : "BLOCKED") +
        "] " +
        check.label +
        ": " +
        check.detail,
    );
  }

  if (!gate.ready) {
    console.log();
    console.log(
      "[BLOCKED] EDGE is not yet fully live-data ready. Use /setup or npm run doctor to identify the next configuration step.",
    );
    process.exitCode = 1;
    return;
  }

  console.log();
  console.log(
    "[OK] EDGE full live-data launch gate passed. Deployment-specific migration/security checks should still run through deploy:preflight and CI.",
  );
}

main().catch((error) => {
  console.error("EDGE live launch gate failed.");
  console.error(error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
