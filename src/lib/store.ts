import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CompanyProfile, Deal } from "./types";

// A tiny JSON-file database. One process owns the file, writes are serialized
// and atomic (write to a temp file, then rename). Point DATA_DIR at a mounted
// volume when you deploy.

const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || ".data");
const DB_FILE = path.join(DATA_DIR, "kontract.json");

/** Path of a file inside the data directory. */
export const dataPath = (name: string) => path.join(DATA_DIR, name);
const CACHE_FILE = path.join(DATA_DIR, "cache.json");

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

interface DB {
  deals: Record<string, Deal>;
  profile: CompanyProfile;
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
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

async function readDB(): Promise<DB> {
  const db = await readJson<Partial<DB>>(DB_FILE, {});
  return { deals: db.deals ?? {}, profile: { ...EMPTY_PROFILE, ...db.profile } };
}

export async function listDeals(): Promise<Deal[]> {
  const db = await readDB();
  return Object.values(db.deals).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveDeal(deal: Deal): Promise<Deal> {
  return serialize(async () => {
    const db = await readDB();
    db.deals[deal.id] = deal;
    await writeJson(DB_FILE, db);
    return deal;
  });
}

export function deleteDeal(id: string): Promise<void> {
  return serialize(async () => {
    const db = await readDB();
    delete db.deals[id];
    await writeJson(DB_FILE, db);
  });
}

export async function getProfile(): Promise<CompanyProfile> {
  return (await readDB()).profile;
}

export function saveProfile(profile: CompanyProfile): Promise<CompanyProfile> {
  return serialize(async () => {
    const db = await readDB();
    db.profile = { ...EMPTY_PROFILE, ...profile };
    await writeJson(DB_FILE, db);
    return db.profile;
  });
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
