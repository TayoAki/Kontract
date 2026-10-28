import "server-only";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, dataPath } from "./data-dir";

// One SQLite file holds accounts (Better Auth's user/session/account/
// verification tables) and each user's own records. Records are JSON
// documents keyed by (user_id, id), so every query is scoped to one user.
// Quote requests and feed health checks have their own tables.

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

    -- Shared, not per user: one row per health check of a public permit feed.
    CREATE TABLE IF NOT EXISTS feed_check (
      feed_id TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      days INTEGER NOT NULL,
      ok INTEGER NOT NULL,
      rows INTEGER NOT NULL,
      latest TEXT,
      error TEXT,
      ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS feed_check_feed ON feed_check (feed_id, checked_at);

    -- A link a prime sends a subcontractor to quote a job. The token is the
    -- only credential the sub has, so it's long and random.
    CREATE TABLE IF NOT EXISTS quote_request (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      deal_id TEXT NOT NULL,
      sub_id TEXT NOT NULL,
      sub_name TEXT NOT NULL,
      sub_email TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      viewed_at TEXT,
      submitted_at TEXT,
      imported_at TEXT,
      snapshot TEXT NOT NULL,
      response TEXT
    );
    CREATE INDEX IF NOT EXISTS quote_request_user ON quote_request (user_id, deal_id);
    CREATE INDEX IF NOT EXISTS quote_request_email ON quote_request (sub_email);

    -- A permit passed to a subcontractor as a lead. Like quote links, the
    -- token is the sub's only credential.
    CREATE TABLE IF NOT EXISTS lead_share (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      contact_id TEXT,
      to_name TEXT NOT NULL,
      to_email TEXT,
      permit_id TEXT NOT NULL,
      trade TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      viewed_at TEXT,
      responded_at TEXT,
      snapshot TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS lead_share_user ON lead_share (user_id, permit_id);
    CREATE INDEX IF NOT EXISTS lead_share_email ON lead_share (to_email);
  `);
  g.__kontractDb = db;
  return db;
}
