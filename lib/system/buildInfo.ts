import pkg from "@/package.json";

export type BuildInfo = {
  service: "edge-sports-intelligence";
  version: string;
  commit: string | null;
  builtAt: string | null;
  node: string;
};

function validIso(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getBuildInfo(): BuildInfo {
  return {
    service: "edge-sports-intelligence",
    version: pkg.version,
    commit: process.env.EDGE_BUILD_SHA?.trim() || null,
    builtAt: validIso(process.env.EDGE_BUILD_TIME),
    node: process.versions.node,
  };
}
