import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

type PrismaGlobal = typeof globalThis & {
  edgePrisma?: PrismaClient;
};

const globalForPrisma = globalThis as PrismaGlobal;

export function getDb(): PrismaClient {
  if (globalForPrisma.edgePrisma) {
    return globalForPrisma.edgePrisma;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Add it to .env.local before using the EDGE database.",
    );
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.edgePrisma = prisma;

  return prisma;
}
