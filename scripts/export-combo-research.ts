import dotenv from "dotenv";
import { writeFile } from "node:fs/promises";
import { getComboCandidatePool } from "../lib/data/uiCombos";
import { buildComboResearchTask } from "../lib/intelligence/researchEvidence";

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

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. Research queue export requires the EDGE database.",
    );
  }

  const hours = positiveInt(getArg("hours"), 24, 24 * 14, "--hours");
  const limit = positiveInt(getArg("limit"), 20, 100, "--limit");
  const output = getArg("output");

  const pool = await getComboCandidatePool(hours);
  const tasks = pool.evidenceResearchQueue
    .slice(0, limit)
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

  const payload = {
    generatedAt: new Date().toISOString(),
    hours,
    diagnostics: pool.diagnostics,
    tasks,
    rules: {
      sourceBackedOnly: true,
      oddsMustRemainProviderBacked: true,
      researchDoesNotQualifyComboByItself: true,
      directionalEvidenceRequiresExplicitInterpretation: true,
    },
  };

  const json = JSON.stringify(payload, null, 2) + "\n";

  if (output) {
    await writeFile(output, json, "utf8");
    console.log("Combo research queue exported.", {
      output,
      tasks: tasks.length,
    });
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => {
  console.error("EDGE combo research queue export failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
