import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3000;

async function runMigrations() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("[migrate] DATABASE_URL is not set");
    process.exit(1);
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const client = postgres(DATABASE_URL, { max: 1, connect_timeout: 10 });
    try {
      const db = drizzle(client);
      console.log(`[migrate] Running migrations (attempt ${attempt})...`);
      await migrate(db, {
        migrationsFolder: path.join(__dirname, "migrations"),
      });
      console.log("[migrate] Migrations complete");
      await client.end();
      return;
    } catch (err) {
      await client.end().catch(() => {});
      if (attempt === MAX_RETRIES) {
        console.error("[migrate] Migration failed after all retries:", err);
        process.exit(1);
      }
      console.warn(
        `[migrate] Attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS}ms...`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

runMigrations();
