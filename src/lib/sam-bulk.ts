import "server-only";
import { once } from "node:events";
import { createWriteStream, promises as fs } from "node:fs";
import { CsvParser, MixedDecoder } from "./csv";
import { searchOpportunities } from "./opportunity-search";
import { sampleOpportunities } from "./sample-data";
import { closesOut, keepForSearch, mergeVersions, normalizeBulkRow, REQUIRED_COLUMNS, versionKey, type BulkRow } from "./sam-normalize";
import { dataPath } from "./data-dir";
import type { Opportunity, OpportunityResults, OpportunitySearch, SamDataStatus } from "./types";

// SAM.gov publishes every active contract opportunity as one CSV each night
// (~200 MB, no API key, no rate limit). We download it, keep the notices
// someone can still act on, merge amendments into one notice per
// solicitation (~7k), and search them locally. Every hour we check the
// file's Last-Modified and re-download only when it changed.

export const BULK_URL =
  process.env.SAM_BULK_URL ||
  "https://sam.gov/api/prod/fileextractservices/v1/api/download/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv?privacy=Public";

const INDEX_FILE = dataPath("sam-opportunities.jsonl");
const CHECK_EVERY_MS = 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

interface Meta {
  /** SAM.gov's Last-Modified for the file. */
  asOf: string | null;
  fetchedAt: string;
  checkedAt: string;
  totalRows: number;
  count: number;
}

interface BulkIndex {
  meta: Meta;
  /** Notices without descriptions (those are kept separately to keep results light). */
  items: Opportunity[];
  byId: Map<string, Opportunity>;
  descriptions: Map<string, string>;
}

interface State {
  index: BulkIndex | null;
  diskLoad: Promise<void> | null;
  refreshing: Promise<BulkIndex | null> | null;
  lastFailure: number;
  error: string | null;
  timer: ReturnType<typeof setInterval> | null;
}

// Survives dev-server module reloads.
const g = globalThis as unknown as { __kontractSamBulk?: State };
const state: State = (g.__kontractSamBulk ??= { index: null, diskLoad: null, refreshing: null, lastFailure: 0, error: null, timer: null });

const errorText = (err: unknown) =>
  err instanceof TypeError && err.message === "fetch failed" ? "couldn't reach sam.gov" : err instanceof Error ? err.message : String(err);
const isoOrNull = (header: string | null) => {
  const t = header ? Date.parse(header) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

function buildIndex(meta: Meta, entries: Iterable<[Opportunity, string | undefined]>): BulkIndex {
  const byId = new Map<string, Opportunity>();
  const descriptions = new Map<string, string>();
  for (const [o, d] of entries) {
    byId.set(o.id, o);
    if (d) descriptions.set(o.id, d);
  }
  const items = [...byId.values()];
  return { meta: { ...meta, count: items.length }, items, byId, descriptions };
}

/** Cheap freshness check: a 1-byte range request returns the file's Last-Modified. */
async function remoteLastModified(): Promise<string | null> {
  const res = await fetch(BULK_URL, { headers: { Range: "bytes=0-0" }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  await res.body?.cancel();
  if (!res.ok) throw new Error(`SAM.gov responded ${res.status}`);
  return isoOrNull(res.headers.get("last-modified"));
}

async function download(): Promise<BulkIndex> {
  const res = await fetch(BULK_URL, { cache: "no-store", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`Couldn't download SAM.gov's daily file (HTTP ${res.status})`);
  const now = new Date();
  const decoder = new MixedDecoder();
  const parser = new CsvParser();
  const kept: [Opportunity, string | undefined][] = [];
  const closedAt = new Map<string, string>();
  let header: string[] | null = null;
  let totalRows = 0;

  const handle = (cells: string[]) => {
    if (!header) {
      header = cells.map((c) => c.replace(/^﻿/, "").trim());
      const missing = REQUIRED_COLUMNS.filter((c) => !header!.includes(c));
      if (missing.length) throw new Error(`SAM.gov's file format changed (missing ${missing.join(", ")})`);
      return;
    }
    totalRows++;
    const row: BulkRow = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    if (row.Active && row.Active.trim().toLowerCase() !== "yes") return;
    const o = normalizeBulkRow(row);
    if (!o) return;
    if (closesOut(o)) {
      const key = versionKey(o);
      if (o.postedDate > (closedAt.get(key) ?? "")) closedAt.set(key, o.postedDate);
    }
    if (!keepForSearch(o, now)) return;
    const { description, ...rest } = o;
    kept.push([rest, description]);
  };

  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    for (const r of parser.push(decoder.decode(chunk))) handle(r);
  }
  for (const r of parser.push(decoder.decode(new Uint8Array(), true))) handle(r);
  for (const r of parser.end()) handle(r);
  if (totalRows === 0) throw new Error("SAM.gov's daily file was empty");

  const ts = now.toISOString();
  return buildIndex({ asOf: isoOrNull(res.headers.get("last-modified")), fetchedAt: ts, checkedAt: ts, totalRows, count: 0 }, mergeVersions(kept, closedAt));
}

/** One JSON line for the metadata, then one per notice. Written to a temp file, then renamed. */
async function persist(idx: BulkIndex): Promise<void> {
  const tmp = `${INDEX_FILE}.${process.pid}.tmp`;
  await fs.mkdir(dataPath(""), { recursive: true });
  const out = createWriteStream(tmp, { encoding: "utf8" });
  const write = async (line: string) => {
    if (!out.write(`${line}\n`)) await once(out, "drain");
  };
  await write(JSON.stringify(idx.meta));
  for (const o of idx.items) await write(JSON.stringify({ o, d: idx.descriptions.get(o.id) }));
  out.end();
  await once(out, "finish");
  await fs.rename(tmp, INDEX_FILE);
}

async function loadFromDisk(): Promise<BulkIndex | null> {
  let text: string;
  try {
    text = await fs.readFile(INDEX_FILE, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const lines = text.split("\n").filter(Boolean);
  const meta = JSON.parse(lines[0]!) as Meta;
  return buildIndex(
    meta,
    lines.slice(1).map((l) => {
      const { o, d } = JSON.parse(l) as { o: Opportunity; d?: string };
      return [o, d] as [Opportunity, string | undefined];
    }),
  );
}

function refresh(): Promise<BulkIndex | null> {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    try {
      const current = state.index;
      if (current?.meta.asOf) {
        const remote = await remoteLastModified();
        if (remote && Date.parse(remote) <= Date.parse(current.meta.asOf)) {
          current.meta.checkedAt = new Date().toISOString();
          state.error = null;
          return current;
        }
      }
      const idx = await download();
      state.index = idx;
      state.error = null;
      state.lastFailure = 0;
      await persist(idx).catch((err) => console.error("Couldn't save the SAM.gov index to disk", err));
      return idx;
    } catch (err) {
      state.lastFailure = Date.now();
      state.error = errorText(err);
      console.error("SAM.gov daily file refresh failed:", state.error);
      return state.index;
    } finally {
      state.refreshing = null;
    }
  })();
  return state.refreshing;
}

/**
 * The local index. Loads it from disk on first use, then checks SAM.gov for
 * a newer file at most hourly. With `wait`, blocks for the first download
 * when there's nothing on disk yet; otherwise returns what's available.
 */
async function getIndex({ wait }: { wait: boolean }): Promise<BulkIndex | null> {
  if (!state.index) {
    state.diskLoad ??= loadFromDisk()
      .then((idx) => {
        state.index ??= idx;
      })
      .catch((err) => console.error("Couldn't read the saved SAM.gov index", err));
    await state.diskLoad;
  }
  const due = !state.index || Date.now() - Date.parse(state.index.meta.checkedAt) > CHECK_EVERY_MS;
  const mayTry = Date.now() - state.lastFailure > RETRY_AFTER_FAILURE_MS;
  if (due && (mayTry || state.refreshing)) {
    const pending = refresh();
    if (!state.index && wait) return pending;
  }
  return state.index;
}

/** Search SAM.gov's notices plus `extra` (state and local bids). */
export async function searchSamOpportunities(
  search: OpportunitySearch,
  page: { limit: number; offset: number },
  now: Date = new Date(),
  extra: Opportunity[] = [],
): Promise<OpportunityResults> {
  const idx = await getIndex({ wait: true });
  if (!idx) {
    const r = searchOpportunities([...sampleOpportunities(now), ...extra], search, { now, ...page });
    return {
      ...r,
      source: "sample",
      notice: `Couldn't load SAM.gov's daily file${state.error ? ` (${state.error})` : ""}. Showing sample data; it will retry automatically.`,
    };
  }
  const r = searchOpportunities(extra.length ? [...idx.items, ...extra] : idx.items, search, {
    now,
    ...page,
    descriptionOf: (o) => (o.source === "sled" ? o.description : idx.descriptions.get(o.id)),
  });
  return { ...r, source: "bulk", dataAsOf: idx.meta.asOf ?? idx.meta.fetchedAt };
}

/** Full description for a notice in the local index ("" if it has none, undefined if unknown). */
export async function samDescription(id: string): Promise<string | undefined> {
  const idx = await getIndex({ wait: false });
  if (!idx?.byId.has(id)) return undefined;
  return idx.descriptions.get(id) ?? "";
}

export async function samDataStatus(): Promise<SamDataStatus | null> {
  const idx = await getIndex({ wait: false });
  if (!idx && !state.refreshing && !state.error) return null;
  return {
    asOf: idx?.meta.asOf ?? null,
    fetchedAt: idx?.meta.fetchedAt ?? "",
    count: idx?.meta.count ?? 0,
    refreshing: Boolean(state.refreshing),
    error: state.error,
  };
}

/** Check SAM.gov for a newer file now (downloads only if it changed). */
export async function refreshSamData(): Promise<SamDataStatus | null> {
  await getIndex({ wait: false });
  await refresh();
  return samDataStatus();
}

/** Start loading at server boot and keep checking hourly. */
export function startSamDataSync(): void {
  if (state.timer) return;
  void getIndex({ wait: false });
  state.timer = setInterval(() => void getIndex({ wait: false }), CHECK_EVERY_MS);
  state.timer.unref?.();
}
