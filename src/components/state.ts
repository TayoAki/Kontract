"use client";

import { create } from "zustand";
import { SIGNED_OUT_EVENT } from "@/lib/auth-client";
import { findContact, newContact } from "@/lib/crm";
import { newDeal } from "@/lib/deal";
import type {
  Breakdown,
  CompanyProfile,
  CrmContact,
  Deal,
  IntegrationStatus,
  Opportunity,
  OpportunityResults,
  OpportunitySearch,
  PricingResults,
} from "@/lib/types";

export type View = "home" | "search" | "bids" | "permits" | "crm" | "alerts" | "settings";
export type Tab = "overview" | "pricing" | "subs" | "proposal";

export const DEFAULT_FILTERS: OpportunitySearch = {
  q: "",
  state: "",
  naics: "",
  setAside: "",
  postedWithinDays: 0,
  minDaysToRespond: 5,
  servicesOnly: true,
  biddableOnly: true,
  sort: "fit",
};

const PAGE_SIZE = 100;
let searchSeq = 0;

function searchParams(f: OpportunitySearch, offset: number): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === "" || v === false || v === 0) continue;
    params.set(k, v === true ? "1" : String(v));
  }
  params.set("limit", String(PAGE_SIZE));
  if (offset) params.set("offset", String(offset));
  return params;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// Debounced saves, one timer per record ("deal:<id>", "crm:<id>"). Pending
// saves are flushed with keepalive when the page is hidden or closed.
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingSaves = new Map<string, { url: string; body: unknown }>();

function send(key: string, keepalive = false) {
  const p = pendingSaves.get(key);
  pendingSaves.delete(key);
  if (!p) return Promise.resolve();
  return api(p.url, { method: "PUT", body: JSON.stringify(p.body), keepalive });
}

function schedule(key: string, url: string, body: unknown) {
  clearTimeout(saveTimers.get(key));
  pendingSaves.set(key, { url, body });
  saveTimers.set(
    key,
    setTimeout(() => {
      saveTimers.delete(key);
      send(key).catch((err) => {
        useApp.setState({ toast: `Couldn't save: ${(err as Error).message}` });
      });
    }, 500),
  );
}

function cancelSave(key: string) {
  clearTimeout(saveTimers.get(key));
  saveTimers.delete(key);
  pendingSaves.delete(key);
}

/** Send every pending save now (before signing out). */
export async function flushSaves(): Promise<void> {
  const keys = [...pendingSaves.keys()];
  for (const key of keys) clearTimeout(saveTimers.get(key));
  await Promise.all(keys.map((key) => send(key).catch(() => undefined)));
}

const persistDeal = (deal: Deal) => schedule(`deal:${deal.id}`, "/api/deals", deal);
const persistContact = (c: CrmContact) => schedule(`crm:${c.id}`, "/api/crm", c);

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const key of [...pendingSaves.keys()]) {
      clearTimeout(saveTimers.get(key));
      void send(key, true).catch(() => undefined);
    }
  });
}

export interface SignedInUser {
  id: string;
  name: string;
  email: string;
}

interface AppState {
  user: SignedInUser | null;
  contacts: Record<string, CrmContact>;
  crmSelectedId: string | null;
  view: View;
  tab: Tab;
  sidebarOpen: boolean;
  status: IntegrationStatus | null;
  profile: CompanyProfile | null;
  deals: Record<string, Deal>;
  /** Working copies of opportunities you're looking at but haven't tracked. */
  scratch: Record<string, Deal>;
  loaded: boolean;

  filters: OpportunitySearch;
  results: Opportunity[];
  resultsTotal: number;
  resultsSource: OpportunityResults["source"] | null;
  resultsAsOf: string | null;
  resultsNotice: string | null;
  searching: boolean;
  loadingMore: boolean;
  searchError: string | null;

  selectedId: string | null;
  pricing: Record<string, PricingResults>;
  toast: string | null;

  /** Clear everything held in memory (on sign-in as a different account). */
  reset(user: SignedInUser): void;
  init(): Promise<void>;
  setView(v: View): void;
  setTab(t: Tab): void;
  setSidebarOpen(open: boolean): void;
  setFilters(patch: Partial<OpportunitySearch>): void;
  refreshStatus(): Promise<void>;
  search(): Promise<void>;
  loadMore(): Promise<void>;
  select(o: Opportunity | Deal): void;
  open(id: string, tab?: Tab): void;
  /** Change a deal. Tracks it (adds to My bids) unless `track: false`. */
  updateDeal(id: string, fn: (d: Deal) => Deal, opts?: { track?: boolean }): void;
  track(id: string): void;
  untrack(id: string): Promise<void>;
  setBreakdown(id: string, b: Breakdown, description?: string | null): void;
  setPricing(id: string, p: PricingResults): void;
  saveProfile(p: CompanyProfile): Promise<void>;
  /** Create or change a CRM contact (saved automatically). */
  upsertContact(c: CrmContact): void;
  /** Add a company to the CRM, or return the one already there. */
  addContact(fields: Partial<CrmContact> & { company: string }): { contact: CrmContact; existed: boolean };
  selectContact(id: string | null): void;
  removeContact(id: string): Promise<void>;
  say(msg: string | null): void;
}

type Data = Omit<AppState, { [K in keyof AppState]: AppState[K] extends (...args: never[]) => unknown ? K : never }[keyof AppState]>;

const INITIAL: Data = {
  user: null,
  contacts: {},
  crmSelectedId: null,
  view: "search",
  tab: "overview",
  sidebarOpen: false,
  status: null,
  profile: null,
  deals: {},
  scratch: {},
  loaded: false,

  filters: DEFAULT_FILTERS,
  results: [],
  resultsTotal: 0,
  resultsSource: null,
  resultsAsOf: null,
  resultsNotice: null,
  searching: false,
  loadingMore: false,
  searchError: null,

  selectedId: null,
  pricing: {},
  toast: null,
};

export const useApp = create<AppState>((set, get) => ({
  ...INITIAL,

  reset(user) {
    for (const key of [...saveTimers.keys()]) cancelSave(key);
    set({ ...INITIAL, user });
  },

  async init() {
    const [status, profile, deals, contacts] = await Promise.all([
      api<IntegrationStatus>("/api/status").catch(() => null),
      api<{ profile: CompanyProfile }>("/api/profile").then((r) => r.profile).catch(() => null),
      api<{ deals: Deal[] }>("/api/deals").then((r) => r.deals).catch(() => [] as Deal[]),
      api<{ contacts: CrmContact[] }>("/api/crm").then((r) => r.contacts).catch(() => [] as CrmContact[]),
    ]);
    set({
      status,
      profile,
      deals: Object.fromEntries(deals.map((d) => [d.id, d])),
      contacts: Object.fromEntries(contacts.map((c) => [c.id, c])),
      loaded: true,
    });
    await get().search();
  },

  setView(view) {
    set({ view, sidebarOpen: false });
    if (view === "bids") {
      const { deals, selectedId } = get();
      if (!selectedId || !deals[selectedId]) {
        const first = Object.values(deals).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        set({ selectedId: first?.id ?? null });
      }
    }
  },
  setTab: (tab) => set({ tab }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),

  async refreshStatus() {
    const status = await api<IntegrationStatus>("/api/status").catch(() => null);
    if (status) set({ status });
  },

  async search() {
    const seq = ++searchSeq;
    set({ searching: true, searchError: null });
    try {
      const r = await api<OpportunityResults>(`/api/opportunities?${searchParams(get().filters, 0)}`);
      if (seq !== searchSeq) return; // a newer search started
      set({
        results: r.results,
        resultsTotal: r.total,
        resultsSource: r.source,
        resultsAsOf: r.dataAsOf ?? null,
        resultsNotice: r.notice ?? null,
        searching: false,
      });
      const { selectedId, view } = get();
      const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
      if (wide && view === "search" && (!selectedId || !r.results.some((o) => o.id === selectedId)) && r.results[0]) {
        get().select(r.results[0]);
      }
      // The first search may have waited for the daily file; pick up its status.
      if (r.source === "bulk" && !get().status?.samData?.count) void get().refreshStatus();
    } catch (err) {
      if (seq === searchSeq) set({ searching: false, searchError: (err as Error).message });
    }
  },

  async loadMore() {
    const { results, resultsTotal, loadingMore, searching, filters } = get();
    if (loadingMore || searching || results.length >= resultsTotal) return;
    const seq = searchSeq;
    set({ loadingMore: true });
    try {
      const r = await api<OpportunityResults>(`/api/opportunities?${searchParams(filters, results.length)}`);
      if (seq !== searchSeq) return;
      const seen = new Set(get().results.map((o) => o.id));
      set({ results: [...get().results, ...r.results.filter((o) => !seen.has(o.id))], resultsTotal: r.total });
    } catch (err) {
      set({ toast: `Couldn't load more: ${(err as Error).message}` });
    } finally {
      set({ loadingMore: false });
    }
  },

  select(item) {
    const o = "opportunity" in item ? item.opportunity : item;
    const { deals, scratch } = get();
    if (!deals[o.id] && !scratch[o.id]) set({ scratch: { ...scratch, [o.id]: newDeal(o) } });
    set({ selectedId: o.id, sidebarOpen: false });
  },

  open(id, tab) {
    set({ view: "bids", selectedId: id, sidebarOpen: false, ...(tab ? { tab } : {}) });
  },

  updateDeal(id, fn, opts = {}) {
    const { deals, scratch } = get();
    const current = deals[id] ?? scratch[id];
    if (!current) return;
    const next = { ...fn(current), updatedAt: new Date().toISOString() };
    const tracked = Boolean(deals[id]) || opts.track !== false;
    if (tracked) {
      const { [id]: _, ...rest } = scratch;
      set({ deals: { ...deals, [id]: next }, scratch: rest });
      persistDeal(next);
    } else {
      set({ scratch: { ...scratch, [id]: next } });
    }
  },

  track(id) {
    get().updateDeal(id, (d) => d);
  },

  async untrack(id) {
    const { deals, scratch } = get();
    const deal = deals[id];
    if (!deal) return;
    cancelSave(`deal:${id}`);
    const { [id]: _, ...rest } = deals;
    set({ deals: rest, scratch: { ...scratch, [id]: deal } });
    await api(`/api/deals/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
  },

  setBreakdown(id, b, description) {
    get().updateDeal(
      id,
      (d) => {
        const hasPrices = d.pricing.lines.some((l) => l.subCost > 0 || l.price > 0);
        const fresh = newDeal(d.opportunity, b);
        return {
          ...d,
          breakdown: b,
          opportunity: description ? { ...d.opportunity, description } : d.opportunity,
          // Only replace the price lines if the user hasn't started pricing.
          pricing: hasPrices ? d.pricing : fresh.pricing,
        };
      },
      { track: false },
    );
  },

  setPricing(id, p) {
    set({ pricing: { ...get().pricing, [id]: p } });
  },

  async saveProfile(p) {
    const r = await api<{ profile: CompanyProfile }>("/api/profile", { method: "PUT", body: JSON.stringify(p) });
    set({ profile: r.profile, toast: "Company profile saved" });
  },

  upsertContact(c) {
    const next = { ...c, updatedAt: new Date().toISOString() };
    set({ contacts: { ...get().contacts, [c.id]: next } });
    persistContact(next);
  },

  addContact(fields) {
    const existing = findContact(Object.values(get().contacts), fields.company);
    if (existing) return { contact: existing, existed: true };
    const contact = newContact(fields);
    get().upsertContact(contact);
    return { contact, existed: false };
  },

  selectContact(id) {
    set({ crmSelectedId: id, sidebarOpen: false });
  },

  async removeContact(id) {
    cancelSave(`crm:${id}`);
    const { [id]: _, ...rest } = get().contacts;
    set({ contacts: rest, crmSelectedId: get().crmSelectedId === id ? null : get().crmSelectedId });
    await api(`/api/crm/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
  },

  say: (toast) => set({ toast }),
}));

export function useSelectedDeal(): Deal | null {
  return useApp((s) => (s.selectedId ? (s.deals[s.selectedId] ?? s.scratch[s.selectedId] ?? null) : null));
}

export function useIsTracked(id: string | undefined): boolean {
  return useApp((s) => Boolean(id && s.deals[id]));
}
