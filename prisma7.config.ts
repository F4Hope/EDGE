import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://edge:edge@localhost:5432/edge?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
