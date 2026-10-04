import dotenv from "dotenv";
import {
  checkApiSportsCredential,
  checkOddsApiCredential,
} from "../lib/providers/health";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function printCheck(
  label: string,
  check: {
    configured: boolean;
    ok: boolean;
    detail: string;
    quotaRemaining: number | null;
  },
  extra?: string,
) {
  const marker = check.ok ? "OK" : check.configured ? "FAIL" : "WARN";
  console.log("[" + marker + "] " + label + ": " + check.detail);

  if (check.quotaRemaining !== null) {
    console.log(
      "[INFO] " +
        label +
        " reported remaining quota: " +
        String(check.quotaRemaining),
    );
  }

  if (extra) console.log("[INFO] " + label + ": " + extra);
}

async function main() {
  console.log("EDGE provider credential check");
  console.log("------------------------------");
  console.log(
    "[INFO] Uses provider status/catalog endpoints intended for credential/connectivity checks. Secret values are never printed.",
  );

  const [apiSports, oddsApi] = await Promise.all([
    checkApiSportsCredential(process.env.API_SPORTS_KEY),
    checkOddsApiCredential(process.env.ODDS_API_KEY),
  ]);

  printCheck("API-Sports", apiSports);
  printCheck(
    "The Odds API",
    oddsApi,
    oddsApi.activeSports === null
      ? undefined
      : String(oddsApi.activeSports) + " active sport keys returned.",
  );

  const configuredFailures = [apiSports, oddsApi].filter(
    (check) => check.configured && !check.ok,
  );

  if (configuredFailures.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (!apiSports.configured && !oddsApi.configured) {
    console.log(
      "[WARN] No provider credential is configured yet. Database/local app setup can still run without external provider calls.",
    );
  }
}

main().catch((error) => {
  console.error("EDGE provider credential check failed.");
  console.error(error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
