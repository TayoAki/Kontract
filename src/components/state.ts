"use client";

import { create } from "zustand";
import { newDeal } from "@/lib/deal";
import type {
  Breakdown,
  CompanyProfile,
  Deal,
  IntegrationStatus,
  Opportunity,
  OpportunitySearch,
  PricingResults,
} from "@/lib/types";

export type View = "home" | "search" | "bids" | "alerts" | "settings";
export type Tab = "overview" | "pricing" | "subs" | "proposal";

export const DEFAULT_FILTERS: OpportunitySearch = {
  q: "",
  state: "",
  naics: "",
  setAside: "",
  postedWithinDays: 30,
  minDaysToRespond: 5,
  servicesOnly: true,
  biddableOnly: true,
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// Debounced saves, one timer per deal. Pending saves are flushed with
// keepalive when the page is hidden or closed.
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingSaves = new Map<string, Deal>();

function sendDeal(deal: Deal, keepalive = false) {
  pendingSaves.delete(deal.id);
  return api("/api/deals", { method: "PUT", body: JSON.stringify(deal), keepalive });
}

function persistDeal(deal: Deal) {
  clearTimeout(saveTimers.get(deal.id));
  pendingSaves.set(deal.id, deal);
  saveTimers.set(
    deal.id,
    setTimeout(() => {
      saveTimers.delete(deal.id);
      sendDeal(deal).catch((err) => {
        useApp.setState({ toast: `Couldn't save: ${(err as Error).message}` });
      });
    }, 500),
  );
}

function cancelSave(id: string) {
  clearTimeout(saveTimers.get(id));
  saveTimers.delete(id);
  pendingSaves.delete(id);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const deal of [...pendingSaves.values()]) {
      cancelSave(deal.id);
      void sendDeal(deal, true).catch(() => undefined);
    }
  });
}

interface AppState {
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
  resultsSource: "sam" | "sample" | null;
  resultsNotice: string | null;
  searching: boolean;
  searchError: string | null;

  selectedId: string | null;
  pricing: Record<string, PricingResults>;
  toast: string | null;

  init(): Promise<void>;
  setView(v: View): void;
  setTab(t: Tab): void;
  setSidebarOpen(open: boolean): void;
  setFilters(patch: Partial<OpportunitySearch>): void;
  search(): Promise<void>;
  select(o: Opportunity | Deal): void;
  open(id: string, tab?: Tab): void;
  /** Change a deal. Tracks it (adds to My bids) unless `track: false`. */
  updateDeal(id: string, fn: (d: Deal) => Deal, opts?: { track?: boolean }): void;
  track(id: string): void;
  untrack(id: string): Promise<void>;
  setBreakdown(id: string, b: Breakdown, description?: string | null): void;
  setPricing(id: string, p: PricingResults): void;
  saveProfile(p: CompanyProfile): Promise<void>;
  say(msg: string | null): void;
}

export const useApp = create<AppState>((set, get) => ({
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
  resultsSource: null,
  resultsNotice: null,
  searching: false,
  searchError: null,

  selectedId: null,
  pricing: {},
  toast: null,

  async init() {
    const [status, profile, deals] = await Promise.all([
      api<IntegrationStatus>("/api/status").catch(() => null),
      api<{ profile: CompanyProfile }>("/api/profile").then((r) => r.profile).catch(() => null),
      api<{ deals: Deal[] }>("/api/deals").then((r) => r.deals).catch(() => [] as Deal[]),
    ]);
    set({ status, profile, deals: Object.fromEntries(deals.map((d) => [d.id, d])), loaded: true });
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

  async search() {
    const f = get().filters;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined || v === "" || v === false) continue;
      params.set(k, v === true ? "1" : String(v));
    }
    set({ searching: true, searchError: null });
    try {
      const r = await api<{ results: Opportunity[]; source: "sam" | "sample"; notice?: string }>(`/api/opportunities?${params}`);
      set({ results: r.results, resultsSource: r.source, resultsNotice: r.notice ?? null, searching: false });
      const { selectedId, view } = get();
      const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
      if (wide && view === "search" && (!selectedId || !r.results.some((o) => o.id === selectedId)) && r.results[0]) {
        get().select(r.results[0]);
      }
    } catch (err) {
      set({ searching: false, searchError: (err as Error).message });
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
    cancelSave(id);
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

  say: (toast) => set({ toast }),
}));

export function useSelectedDeal(): Deal | null {
  return useApp((s) => (s.selectedId ? (s.deals[s.selectedId] ?? s.scratch[s.selectedId] ?? null) : null));
}

export function useIsTracked(id: string | undefined): boolean {
  return useApp((s) => Boolean(id && s.deals[id]));
}
