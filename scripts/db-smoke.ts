import dotenv from "dotenv";
import { getDb } from "../lib/prisma";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const db = getDb();

  const [sports, events, markets, predictions] = await Promise.all([
    db.sport.count(),
    db.event.count(),
    db.market.count(),
    db.prediction.count(),
  ]);

  console.log("EDGE database connection OK", {
    sports,
    events,
    markets,
    predictions,
  });

  await db.$disconnect();
}

main().catch((error) => {
  console.error("EDGE database smoke test failed.");
  console.error(error);
  process.exitCode = 1;
});
