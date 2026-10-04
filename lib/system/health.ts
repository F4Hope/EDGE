import { getDb } from "@/lib/prisma";
import { getBuildInfo } from "@/lib/system/buildInfo";

export type ReadinessProbe = {
  status: "ok" | "degraded";
  checkedAt: string;
  database: "reachable" | "unreachable" | "not-configured";
  build: ReturnType<typeof getBuildInfo>;
};

export async function checkReadiness(): Promise<{
  statusCode: 200 | 503;
  body: ReadinessProbe;
}> {
  const checkedAt = new Date().toISOString();
  const build = getBuildInfo();

  if (!process.env.DATABASE_URL) {
    return {
      statusCode: 503,
      body: {
        status: "degraded",
        checkedAt,
        database: "not-configured",
        build,
      },
    };
  }

  try {
    await getDb().sport.count();
    return {
      statusCode: 200,
      body: {
        status: "ok",
        checkedAt,
        database: "reachable",
        build,
      },
    };
  } catch {
    return {
      statusCode: 503,
      body: {
        status: "degraded",
        checkedAt,
        database: "unreachable",
        build,
      },
    };
  }
}
