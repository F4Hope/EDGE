import dotenv from "dotenv";
import { writeFile } from "node:fs/promises";
import { getComboCandidatePool } from "../lib/data/uiCombos";
import { buildComboResearchTask } from "../lib/intelligence/researchEvidence";
import { discoverGoogleNews } from "../lib/intelligence/googleNewsDiscovery";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

function getArg(name: string): string | undefined {
  const prefix = "--" + name + "=";
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. Combo research discovery requires the EDGE database.",
    );
  }

  const hours = positiveInt(getArg("hours"), 24, 24 * 14, "--hours");
  const taskLimit = positiveInt(getArg("limit"), 5, 20, "--limit");
  const queryLimit = positiveInt(getArg("query-limit"), 2, 3, "--query-limit");
  const resultLimit = positiveInt(getArg("results"), 5, 10, "--results");
  const delayMs = positiveInt(getArg("delay-ms"), 400, 5000, "--delay-ms");
  const output = getArg("output");

  const pool = await getComboCandidatePool(hours);
  const tasks = pool.evidenceResearchQueue
    .slice(0, taskLimit)
    .map((candidate) =>
      buildComboResearchTask({
        eventId: candidate.eventId,
        predictionId: candidate.predictionId,
        sport: candidate.sport,
        league: candidate.league,
        startsAt: candidate.startsAt,
        matchup: candidate.matchup,
        selectionName: candidate.selectionName,
        decimalOdds: candidate.decimalOdds,
        bookmakerName: candidate.bookmakerName,
        oddsProvider: candidate.oddsProvider,
      }),
    );

  const discoveries = [];

  for (const task of tasks) {
    const queries = task.searchQueries.slice(0, queryLimit);
    const queryResults = [];

    for (const query of queries) {
      const result = await discoverGoogleNews(query, {
        startsAt: task.startsAt,
        limit: resultLimit,
      });
      queryResults.push(result);
      await sleep(delayMs);
    }

    discoveries.push({
      task,
      queryResults,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    provider: "google-news-rss",
    diagnostics: pool.diagnostics,
    discoveries,
    rules: {
      discoveryOnly: true,
      mustReviewBeforeImport: true,
      noAutomaticDirection: true,
      noAutomaticConfidence: true,
      noOddsDerivedFromSearch: true,
      noPredictionMutation: true,
      noComboQualificationFromDiscoveryAlone: true,
    },
  };

  const json = JSON.stringify(payload, null, 2) + "\n";

  if (output) {
    await writeFile(output, json, "utf8");
    console.log("Combo research discovery exported.", {
      output,
      tasks: discoveries.length,
      queries: discoveries.reduce(
        (sum, item) => sum + item.queryResults.length,
        0,
      ),
      items: discoveries.reduce(
        (sum, item) =>
          sum +
          item.queryResults.reduce(
            (querySum, result) => querySum + result.items.length,
            0,
          ),
        0,
      ),
    });
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => {
  console.error("EDGE combo research discovery failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
