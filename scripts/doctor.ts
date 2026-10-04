import dotenv from "dotenv";
import { getSystemReadiness } from "../lib/system/readiness";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function marker(level: string): string {
  if (level === "READY") return "OK";
  if (level === "BLOCKED") return "BLOCKED";
  if (level === "WARNING") return "WARN";
  return "INFO";
}

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const supportedNode = nodeMajor === 22;

  console.log("EDGE system doctor");
  console.log("------------------");
  console.log(
    `[${supportedNode ? "OK" : "BLOCKED"}] Node.js ${process.versions.node} (expected major version 22)`,
  );

  const readiness = await getSystemReadiness();

  for (const check of readiness.checks) {
    console.log(`[${marker(check.level)}] ${check.label}: ${check.detail}`);
  }

  if (readiness.counts) {
    console.log("[INFO] Stored data:", readiness.counts);
  }

  console.log(
    `[INFO] Overall readiness: ${readiness.overall}. Secrets are never printed by this command.`,
  );

  if (!supportedNode) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("EDGE doctor failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
