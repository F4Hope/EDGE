import dotenv from "dotenv";
import { getDb } from "../lib/prisma";
import { ApiSportsProvider } from "../lib/providers/apiSports";
import {
  supportedSports,
  type SupportedSport,
} from "../lib/providers/types";
import { syncProviderResults } from "../lib/data/syncResults";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function getArg(name: string): string | undefined {
  const prefix = "--" + name + "=";
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseDate(value: string | undefined, boundary: "from" | "to"): Date {
  if (!value) {
    const now = new Date();
    return boundary === "from"
      ? new Date(now.getTime() - 72 * 60 * 60 * 1000)
      : now;
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(
    dateOnly
      ? value + "T" + (boundary === "from" ? "00:00:00.000" : "23:59:59.999") + "Z"
      : value,
  );

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid --" + boundary + " date: " + value);
  }

  return parsed;
}

type ResultSport = Exclude<SupportedSport, "tennis">;

function parseSports(value: string | undefined): ResultSport[] {
  const allowed: ResultSport[] = ["football", "basketball"];

  if (!value || value === "all") return [...allowed];

  const requested = value
    .split(",")
    .map((sport) => sport.trim().toLowerCase())
    .filter(Boolean);

  const invalid = requested.filter(
    (sport) => !allowed.includes(sport as ResultSport),
  );

  if (invalid.length > 0) {
    throw new Error(
      "Result sync currently supports football,basketball only. Unsupported: " +
        invalid.join(", "),
    );
  }

  return [...new Set(requested)] as ResultSport[];
}

async function main() {
  const apiKey = process.env.API_SPORTS_KEY;
  if (!apiKey) {
    throw new Error(
      "API_SPORTS_KEY is not configured. Result synchronization requires API-Sports.",
    );
  }

  const from = parseDate(getArg("from"), "from");
  const to = parseDate(getArg("to"), "to");
  if (from > to) throw new Error("--from must be before --to.");

  const sports = parseSports(getArg("sports"));
  const provider = new ApiSportsProvider(apiKey);
  const db = getDb();

  try {
    for (const sport of sports) {
      const summary = await syncProviderResults(db, provider, sport, from, to);
      console.log("Result sync complete.", summary);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("EDGE result synchronization failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
