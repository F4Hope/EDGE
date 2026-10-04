import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.warn(
      "[WARN] " +
        command +
        " could not be started: " +
        result.error.message,
    );
    return 1;
  }

  return result.status ?? 1;
}

function commandWorks(command: string, args: string[]): boolean {
  return (
    spawnSync(command, args, {
      cwd: ROOT,
      stdio: "ignore",
      env: process.env,
    }).status === 0
  );
}

function main() {
  console.log("EDGE Codespace auto-recovery");
  console.log("----------------------------");

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor !== 22) {
    console.warn(
      "[WARN] EDGE expects Node 22; current runtime is " +
        process.versions.node +
        ". Automatic recovery skipped.",
    );
    return;
  }

  if (!existsSync("node_modules")) {
    console.warn(
      "[WARN] Dependencies are not installed yet. postCreateCommand will handle installation; automatic database recovery skipped for this start.",
    );
    return;
  }

  if (!commandWorks("docker", ["--version"])) {
    console.warn(
      "[WARN] Docker is not available yet. Codespace opened normally; run npm run codespace:resume if database recovery is needed.",
    );
    return;
  }

  console.log("Restoring private local PostgreSQL...");
  const databaseStatus = run("npm", ["run", "db:local"]);
  if (databaseStatus !== 0) {
    console.warn(
      "[WARN] Automatic database recovery did not complete. Codespace remains usable; run npm run codespace:resume for full diagnostics.",
    );
    return;
  }

  console.log("Validating Prisma schema...");
  const validationStatus = run("npm", ["run", "db:validate"]);
  if (validationStatus !== 0) {
    console.warn(
      "[WARN] Database recovered, but Prisma validation needs attention.",
    );
    return;
  }

  console.log("[OK] EDGE Codespace database state recovered automatically.");
  console.log(
    "[INFO] No sports-provider refresh or quota-sensitive API call was made.",
  );
}

main();
