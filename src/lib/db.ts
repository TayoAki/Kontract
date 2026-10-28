import "server-only";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, dataPath } from "./data-dir";

// One SQLite file holds accounts (Better Auth's user/session/account/
// verification tables) and each user's own records. Records are JSON
// documents keyed by (user_id, id), so every query is scoped to one user.

const g = globalThis as unknown as { __kontractDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (g.__kontractDb) return g.__kontractDb;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(dataPath("kontract.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_record (
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, kind, id)
    );
    CREATE INDEX IF NOT EXISTS app_record_user_kind ON app_record (user_id, kind, updated_at);
  `);
  g.__kontractDb = db;
  return db;
}
