import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      command +
        " " +
        args.join(" ") +
        " exited with code " +
        String(result.status) +
        ".",
    );
  }
}

function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor !== 22) {
    throw new Error(
      "EDGE requires Node 22. Current runtime is " +
        process.versions.node +
        ". Rebuild the Codespace from the repository devcontainer or run nvm use 22.",
    );
  }

  if (!existsSync("node_modules")) {
    console.log("Installing locked EDGE dependencies...");
    run("npm", ["ci", "--no-audit", "--no-fund"]);
  }

  console.log("Restoring local PostgreSQL and EDGE database state...");
  run("npm", ["run", "db:local"]);

  console.log("Validating EDGE application configuration...");
  run("npm", ["run", "db:validate"]);

  console.log("Running EDGE readiness doctor...");
  run("npm", ["run", "doctor"]);

  console.log();
  console.log("EDGE Codespace is ready.");
  console.log("Start the application with: npm run dev -- --hostname 0.0.0.0");
  console.log(
    "Provider data refresh remains separate and is never triggered by Codespace recovery.",
  );
}

main();
