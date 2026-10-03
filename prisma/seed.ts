import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the EDGE database.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const sports = [
  { key: "football", name: "Football" },
  { key: "basketball", name: "Basketball" },
  { key: "tennis", name: "Tennis" },
] as const;

async function main() {
  for (const sport of sports) {
    await prisma.sport.upsert({
      where: { key: sport.key },
      update: { name: sport.name, active: true },
      create: sport,
    });
  }

  console.log("Seeded EDGE reference sports:", sports.map((sport) => sport.name).join(", "));
}

main()
  .catch((error) => {
    console.error("EDGE database seed failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
