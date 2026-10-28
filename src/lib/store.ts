import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dataPath } from "./data-dir";
import { migrateContact } from "./crm";
import { getDb } from "./db";
import type { Account, CompanyProfile, CrmContact, Deal, Prospect, ProspectRun } from "./types";

// Per-user records live in SQLite (see db.ts), always queried by user id so
// one account never sees another's data. Shared, public data (API response
// caches, the SAM.gov index) stays in plain files.

export { dataPath } from "./data-dir";

const CACHE_FILE = dataPath("cache.json");
/** The single-user file from before accounts existed. */
const LEGACY_FILE = dataPath("kontract.json");

export const EMPTY_PROFILE: CompanyProfile = {
  companyName: "",
  uei: "",
  cage: "",
  address: "",
  contactName: "",
  contactTitle: "Owner",
  email: "",
  phone: "",
  website: "",
  capabilities: "",
  defaultMarkupPct: 35,
};

type Kind = "deal" | "profile" | "crm" | "account" | "prospect" | "prospect-run";

function listRecords<T>(userId: string, kind: Kind): T[] {
  const rows = getDb()
    .prepare("SELECT data FROM app_record WHERE user_id = ? AND kind = ? ORDER BY updated_at DESC")
    .all(userId, kind) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as T);
}

function getRecord<T>(userId: string, kind: Kind, id: string): T | undefined {
  const row = getDb().prepare("SELECT data FROM app_record WHERE user_id = ? AND kind = ? AND id = ?").get(userId, kind, id) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as T) : undefined;
}

function putRecord(userId: string, kind: Kind, id: string, data: unknown, updatedAt = new Date().toISOString()): void {
  getDb()
    .prepare(
      `INSERT INTO app_record (user_id, kind, id, data, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(userId, kind, id, JSON.stringify(data), updatedAt);
}

function deleteRecord(userId: string, kind: Kind, id: string): void {
  getDb().prepare("DELETE FROM app_record WHERE user_id = ? AND kind = ? AND id = ?").run(userId, kind, id);
}

// ---- Bids ----

export async function listDeals(userId: string): Promise<Deal[]> {
  return listRecords<Deal>(userId, "deal");
}

export async function getDeal(userId: string, id: string): Promise<Deal | null> {
  return getRecord<Deal>(userId, "deal", id) ?? null;
}

export async function saveDeal(userId: string, deal: Deal): Promise<Deal> {
  putRecord(userId, "deal", deal.id, deal, deal.updatedAt);
  return deal;
}

export async function deleteDeal(userId: string, id: string): Promise<void> {
  deleteRecord(userId, "deal", id);
}

// ---- Company profile ----

export async function getProfile(userId: string): Promise<CompanyProfile> {
  return { ...EMPTY_PROFILE, ...getRecord<CompanyProfile>(userId, "profile", "me") };
}

export async function saveProfile(userId: string, profile: CompanyProfile): Promise<CompanyProfile> {
  const next = { ...EMPTY_PROFILE, ...profile };
  putRecord(userId, "profile", "me", next);
  return next;
}

// ---- CRM ----

export async function listContacts(userId: string): Promise<CrmContact[]> {
  return listRecords<CrmContact>(userId, "crm").map(migrateContact);
}

export async function getContact(userId: string, id: string): Promise<CrmContact | null> {
  const c = getRecord<CrmContact>(userId, "crm", id);
  return c ? migrateContact(c) : null;
}

export async function saveContact(userId: string, contact: CrmContact): Promise<CrmContact> {
  putRecord(userId, "crm", contact.id, contact, contact.updatedAt);
  return contact;
}

export async function deleteContact(userId: string, id: string): Promise<void> {
  deleteRecord(userId, "crm", id);
}

// ---- One-time import of pre-accounts data ----

/** Move bids and profile from the old single-user kontract.json into this account, once. */
export async function importLegacyData(userId: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await fs.readFile(LEGACY_FILE, "utf8");
  } catch {
    return false;
  }
  // Rename first so two sign-ups at once can't both claim it.
  const claimed = path.join(path.dirname(LEGACY_FILE), `kontract.imported-${Date.now()}.json`);
  try {
    await fs.rename(LEGACY_FILE, claimed);
  } catch {
    return false;
  }
  const legacy = JSON.parse(raw) as { deals?: Record<string, Deal>; profile?: CompanyProfile };
  for (const deal of Object.values(legacy.deals ?? {})) putRecord(userId, "deal", deal.id, deal, deal.updatedAt);
  if (legacy.profile) putRecord(userId, "profile", "me", { ...EMPTY_PROFILE, ...legacy.profile });
  return true;
}

let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

// ---- Response cache (SAM.gov rate limits are tight; USAspending is slow) ----

interface CacheEntry {
  /** Expiry, ms since epoch. */
  exp: number;
  value: unknown;
}

let cacheMem: Record<string, CacheEntry> | null = null;
const MAX_CACHE_ENTRIES = 200;

async function cacheMap(): Promise<Record<string, CacheEntry>> {
  if (!cacheMem) cacheMem = await readJson<Record<string, CacheEntry>>(CACHE_FILE, {});
  return cacheMem;
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const entry = (await cacheMap())[key];
  if (!entry || !(entry.exp > Date.now())) return undefined;
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  return serialize(async () => {
    const map = await cacheMap();
    const now = Date.now();
    map[key] = { exp: now + ttlMs, value };
    for (const k of Object.keys(map)) if (!(map[k]!.exp > now)) delete map[k];
    const keys = Object.keys(map);
    if (keys.length > MAX_CACHE_ENTRIES) {
      keys
        .sort((a, b) => map[a]!.exp - map[b]!.exp)
        .slice(0, keys.length - MAX_CACHE_ENTRIES)
        .forEach((k) => delete map[k]);
    }
    await writeJson(CACHE_FILE, map);
  });
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await load();
  await cacheSet(key, value, ttlMs);
  return value;
}

// ---- Accounts (prime or subcontractor) ----

export function defaultAccount(now = new Date().toISOString()): Account {
  return { role: "prime", plan: "free", digest: true, createdAt: now, updatedAt: now };
}

export async function getAccount(userId: string): Promise<Account> {
  return { ...defaultAccount(), ...getRecord<Account>(userId, "account", "me") };
}

export async function saveAccount(userId: string, account: Account): Promise<Account> {
  const next = { ...account, updatedAt: new Date().toISOString() };
  putRecord(userId, "account", "me", next, next.updatedAt);
  return next;
}

/** Every saved account (for the digest job and Stripe webhooks). */
export function listAccounts(): { userId: string; account: Account }[] {
  const rows = getDb().prepare("SELECT user_id, data FROM app_record WHERE kind = 'account'").all() as { user_id: string; data: string }[];
  return rows.map((r) => ({ userId: r.user_id, account: { ...defaultAccount(), ...(JSON.parse(r.data) as Account) } }));
}

/** A signed-up user's email and name (Better Auth's user table). */
export function userInfo(userId: string): { id: string; email: string; name: string } | null {
  try {
    return (getDb().prepare('SELECT id, email, name FROM "user" WHERE id = ?').get(userId) as { id: string; email: string; name: string } | undefined) ?? null;
  } catch {
    return null;
  }
}

// ---- Prospects (AI customer finder) ----

export async function listProspects(userId: string): Promise<Prospect[]> {
  return listRecords<Prospect>(userId, "prospect");
}

export async function getProspect(userId: string, id: string): Promise<Prospect | null> {
  return getRecord<Prospect>(userId, "prospect", id) ?? null;
}

export async function saveProspect(userId: string, p: Prospect): Promise<Prospect> {
  putRecord(userId, "prospect", p.id, p);
  return p;
}

export async function getLastRun(userId: string): Promise<ProspectRun | null> {
  return getRecord<ProspectRun>(userId, "prospect-run", "last") ?? null;
}

export async function saveRun(userId: string, run: ProspectRun): Promise<ProspectRun> {
  putRecord(userId, "prospect-run", "last", run);
  return run;
}

