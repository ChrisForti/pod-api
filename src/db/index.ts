import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("[db] Missing required environment variable: DATABASE_URL");
}

// postgres-js connection — max 10 connections, safe for Railway hobby tier
const client = postgres(process.env.DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema });
export type Db = typeof db;
