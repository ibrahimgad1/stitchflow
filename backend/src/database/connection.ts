import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { loadEnv } from "../config/env.js";

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const env = loadEnv();
  fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });

  db = new Database(env.databasePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  db.prepare("SELECT 1").get();

  return db;
}

export function closeDatabase(): void {
  if (!db) {
    return;
  }

  db.close();
  db = null;
}

