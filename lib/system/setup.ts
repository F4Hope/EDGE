import type { SystemReadiness } from "./readiness";

export type SetupStepState = "READY" | "ACTION" | "WAITING";

export type SetupStep = {
  key: string;
  title: string;
  state: SetupStepState;
  detail: string;
  action: string | null;
};

export type SetupPlan = {
  completed: number;
  total: number;
  percent: number;
  steps: SetupStep[];
  nextAction: string | null;
};

function checkReady(readiness: SystemReadiness, key: string): boolean {
  return readiness.checks.some(
    (check) => check.key === key && check.level === "READY",
  );
}

export function buildSetupPlan(readiness: SystemReadiness): SetupPlan {
  const databaseReady =
    checkReady(readiness, "database-env") &&
    checkReady(readiness, "database-reachability");
  const apiSportsReady = checkReady(readiness, "api-sports");
  const oddsApiReady = checkReady(readiness, "odds-api");
  const eventsReady = (readiness.counts?.events ?? 0) > 0;
  const featuresReady = (readiness.counts?.features ?? 0) > 0;

  const steps: SetupStep[] = [
    {
      key: "database",
      title: "Database",
      state: databaseReady ? "READY" : "ACTION",
      detail: databaseReady
        ? "PostgreSQL is configured and reachable."
        : "EDGE needs a reachable PostgreSQL database before live evidence can be stored.",
      action: databaseReady
        ? null
        : "In Codespaces, rebuild from the latest devcontainer or run npm run codespace:resume.",
    },
    {
      key: "api-sports",
      title: "API-Sports",
      state: apiSportsReady ? "READY" : "ACTION",
      detail: apiSportsReady
        ? "Football/basketball events, results, and football availability feeds are enabled."
        : "The core Football/Basketball provider credential is not configured.",
      action: apiSportsReady
        ? null
        : "Add API_SPORTS_KEY as a Codespace or production secret. EDGE never displays its value.",
    },
    {
      key: "odds-api",
      title: "The Odds API",
      state: oddsApiReady ? "READY" : "ACTION",
      detail: oddsApiReady
        ? "Bookmaker odds, Tennis event discovery, and explicit Tennis score sync are enabled."
        : "Odds/Tennis provider access is not configured.",
      action: oddsApiReady
        ? null
        : "Add ODDS_API_KEY as a Codespace or production secret when you are ready to enable odds and Tennis coverage.",
    },
    {
      key: "events",
      title: "Live event evidence",
      state: eventsReady
        ? "READY"
        : databaseReady && (apiSportsReady || oddsApiReady)
          ? "ACTION"
          : "WAITING",
      detail: eventsReady
        ? String(readiness.counts?.events ?? 0) +
          " normalized events are stored."
        : "No normalized events are stored yet.",
      action: eventsReady
        ? null
        : databaseReady && apiSportsReady
          ? "Run npm run data:refresh. The default refresh does not call The Odds API."
          : databaseReady && oddsApiReady
            ? "Run the explicit provider sync when you want Odds API event discovery."
            : null,
    },
    {
      key: "features",
      title: "Feature snapshots",
      state: featuresReady
        ? "READY"
        : eventsReady
          ? "ACTION"
          : "WAITING",
      detail: featuresReady
        ? String(readiness.counts?.features ?? 0) +
          " transparent feature snapshots are stored."
        : "No feature snapshots are stored yet.",
      action: featuresReady
        ? null
        : eventsReady
          ? "Run npm run features:calculate -- --sports=all, or use npm run data:refresh."
          : null,
    },
  ];

  const completed = steps.filter((step) => step.state === "READY").length;
  const nextAction =
    steps.find((step) => step.state === "ACTION" && step.action)?.action ?? null;

  return {
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    steps,
    nextAction,
  };
}
