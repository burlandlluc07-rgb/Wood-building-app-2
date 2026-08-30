import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// Local single-file database — no server, no connection string required.
// Override the location with DATABASE_URL (a plain file path, or "file:./path")
// if you ever want the .db file somewhere other than <project>/data/nestforge.db.
const rawUrl = process.env.DATABASE_URL;
const dbPath = rawUrl
  ? rawUrl.replace(/^file:/, "")
  : path.join(process.cwd(), "data", "nestforge.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalForDb = globalThis as typeof globalThis & {
  __nestforgeSqlite?: Database.Database;
};

export const sqlite = globalForDb.__nestforgeSqlite ?? new Database(dbPath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

if (process.env.NODE_ENV !== "production") {
  globalForDb.__nestforgeSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { schema };
