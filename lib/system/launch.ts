import type { ProviderCredentialCheck } from "@/lib/providers/health";
import type { SystemReadiness } from "./readiness";

export type LaunchGateCheck = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type LaunchGate = {
  ready: boolean;
  checks: LaunchGateCheck[];
};

function readinessCheck(readiness: SystemReadiness, key: string): boolean {
  return readiness.checks.some(
    (check) => check.key === key && check.level === "READY",
  );
}

export function buildLaunchGate(
  readiness: SystemReadiness,
  apiSports: ProviderCredentialCheck,
  oddsApi: ProviderCredentialCheck,
  nodeMajor: number,
): LaunchGate {
  const checks: LaunchGateCheck[] = [
    {
      key: "runtime",
      label: "Node.js runtime",
      passed: nodeMajor === 22,
      detail:
        nodeMajor === 22
          ? "Node.js 22 runtime is active."
          : "EDGE production requires Node.js 22.",
    },
    {
      key: "database",
      label: "PostgreSQL",
      passed:
        readinessCheck(readiness, "database-env") &&
        readinessCheck(readiness, "database-reachability"),
      detail:
        readinessCheck(readiness, "database-env") &&
        readinessCheck(readiness, "database-reachability")
          ? "Database is configured and reachable."
          : "A reachable PostgreSQL database is required.",
    },
    {
      key: "api-sports",
      label: "API-Sports credential",
      passed: apiSports.configured && apiSports.ok,
      detail:
        apiSports.configured && apiSports.ok
          ? "API-Sports credential is active."
          : "API-Sports must be configured and pass the provider check.",
    },
    {
      key: "odds-api",
      label: "The Odds API credential",
      passed: oddsApi.configured && oddsApi.ok,
      detail:
        oddsApi.configured && oddsApi.ok
          ? "The Odds API credential is active."
          : "The Odds API must be configured and pass the provider check.",
    },
    {
      key: "events",
      label: "Event dataset",
      passed: (readiness.counts?.events ?? 0) > 0,
      detail:
        (readiness.counts?.events ?? 0) > 0
          ? String(readiness.counts?.events ?? 0) +
            " normalized events are stored."
          : "No normalized event data is stored.",
    },
    {
      key: "odds",
      label: "Odds snapshots",
      passed: (readiness.counts?.oddsSnapshots ?? 0) > 0,
      detail:
        (readiness.counts?.oddsSnapshots ?? 0) > 0
          ? String(readiness.counts?.oddsSnapshots ?? 0) +
            " bookmaker snapshots are stored."
          : "No bookmaker odds snapshots are stored.",
    },
    {
      key: "features",
      label: "Feature snapshots",
      passed: (readiness.counts?.features ?? 0) > 0,
      detail:
        (readiness.counts?.features ?? 0) > 0
          ? String(readiness.counts?.features ?? 0) +
            " transparent feature snapshots are stored."
          : "No feature snapshots are stored.",
    },
  ];

  return {
    ready: checks.every((check) => check.passed),
    checks,
  };
}
