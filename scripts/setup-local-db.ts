import dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = process.cwd();
const ENV_PATH = resolve(ROOT, ".env.local");
const EXAMPLE_PATH = resolve(ROOT, ".env.example");
const COMPOSE_PATH = resolve(ROOT, "docker-compose.local.yml");
const LOCAL_DATABASE_URL =
  "postgresql://edge:edge_local_dev_only@127.0.0.1:54329/edge?schema=public";

function run(
  command: string,
  args: string[],
  options?: { allowFailure?: boolean },
): number {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    if (options?.allowFailure) return 1;
    throw result.error;
  }

  const status = result.status ?? 1;
  if (status !== 0 && !options?.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${status}.`);
  }

  return status;
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

function writeLocalEnv() {
  let content = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8")
    : readFileSync(EXAMPLE_PATH, "utf8");

  const line = `DATABASE_URL="${LOCAL_DATABASE_URL}"`;
  if (/^DATABASE_URL=.*$/m.test(content)) {
    content = content.replace(/^DATABASE_URL=.*$/m, line);
  } else {
    content = `${line}\n${content}`;
  }

  writeFileSync(ENV_PATH, content.endsWith("\n") ? content : `${content}\n`, {
    mode: 0o600,
  });

  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
  dotenv.config({ path: ENV_PATH, override: true, quiet: true });

  console.log("Configured ignored .env.local for the private Codespace PostgreSQL service.");
}

function waitForPostgres() {
  process.stdout.write("Waiting for PostgreSQL");

  for (let attempt = 0; attempt < 45; attempt += 1) {
    const result = spawnSync(
      "docker",
      [
        "compose",
        "-f",
        COMPOSE_PATH,
        "exec",
        "-T",
        "edge-db",
        "pg_isready",
        "-U",
        "edge",
        "-d",
        "edge",
      ],
      {
        cwd: ROOT,
        stdio: "ignore",
      },
    );

    if (result.status === 0) {
      console.log(" ready.");
      return;
    }

    process.stdout.write(".");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  console.log();
  throw new Error("PostgreSQL did not become ready in time.");
}

function main() {
  console.log("EDGE local database bootstrap");
  console.log("-----------------------------");

  if (!commandWorks("docker", ["--version"])) {
    throw new Error(
      "Docker is not available in this Codespace. Rebuild the Codespace with Docker support or use an external PostgreSQL URL.",
    );
  }

  if (!commandWorks("docker", ["compose", "version"])) {
    throw new Error("Docker Compose is not available in this Codespace.");
  }

  writeLocalEnv();

  console.log("Starting private PostgreSQL container...");
  run("docker", ["compose", "-f", COMPOSE_PATH, "up", "-d", "edge-db"]);
  waitForPostgres();

  console.log("Applying current Prisma schema to the local development database...");
  run("npm", ["run", "db:push"]);

  console.log("Seeding EDGE reference sports...");
  run("npm", ["run", "db:seed"]);

  console.log("Running database smoke test...");
  run("npm", ["run", "db:smoke"]);

  console.log("Running EDGE doctor...");
  run("npm", ["run", "doctor"], { allowFailure: true });

  console.log();
  console.log("EDGE local PostgreSQL is ready.");
  console.log("Database host: 127.0.0.1:54329");
  console.log(
    "The development-only database credential is stored only in ignored .env.local and the local Docker service.",
  );
}

main();
