"use client";

import { create } from "zustand";
import type { Trade } from "@/lib/permit-trades";
import type { Permit, PermitContractor, PermitQuery, PermitResults, PermitSourceInfo, TradeId } from "@/lib/types";
import { api } from "./state";

export interface PermitMeta {
  states: { code: string; name: string; sources: number }[];
  sources: PermitSourceInfo[];
  trades: Trade[];
}

type Results = PermitResults & { contractors: PermitContractor[]; tradeContractors: Partial<Record<TradeId, PermitContractor[]>> };

export const DEFAULT_PERMIT_QUERY: PermitQuery = { state: "TX", days: 7, leadsOnly: true };

interface PermitsState {
  meta: PermitMeta | null;
  query: PermitQuery;
  results: Results | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  /** The trade you're selling leads to (drives clients and the pitch). */
  pitchTrade: TradeId | null;
  /** Monthly price and refund window used in the pitch and revenue math. */
  price: number;
  guaranteeDays: number;

  loadMeta(): Promise<void>;
  setQuery(patch: Partial<PermitQuery>, run?: boolean): void;
  search(): Promise<void>;
  select(id: string | null): void;
  setPitchTrade(t: TradeId | null): void;
  setOffer(patch: { price?: number; guaranteeDays?: number }): void;
}

let seq = 0;

function params(q: PermitQuery): string {
  const p = new URLSearchParams();
  if (q.source) p.set("source", q.source);
  else if (q.state) p.set("state", q.state);
  p.set("days", String(q.days));
  if (q.trade) p.set("trade", q.trade);
  if (q.minValue) p.set("minValue", String(q.minValue));
  if (q.residentialOnly) p.set("residentialOnly", "1");
  if (q.leadsOnly) p.set("leadsOnly", "1");
  if (q.zip) p.set("zip", q.zip);
  if (q.q) p.set("q", q.q);
  return p.toString();
}

export const usePermits = create<PermitsState>((set, get) => ({
  meta: null,
  query: DEFAULT_PERMIT_QUERY,
  results: null,
  loading: false,
  error: null,
  selectedId: null,
  pitchTrade: null,
  price: 99,
  guaranteeDays: 30,

  async loadMeta() {
    if (get().meta) return;
    try {
      set({ meta: await api<PermitMeta>("/api/permits/sources") });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  setQuery(patch, run = true) {
    const query = { ...get().query, ...patch };
    // A city belongs to one state; changing the state clears it.
    if (patch.state !== undefined && patch.state !== get().query.state) query.source = undefined;
    set({ query, ...(patch.trade !== undefined ? { pitchTrade: patch.trade ?? null } : {}) });
    if (run) void get().search();
  },

  async search() {
    const mine = ++seq;
    set({ loading: true, error: null });
    try {
      const results = await api<Results>(`/api/permits?${params(get().query)}`);
      if (mine !== seq) return;
      const { selectedId } = get();
      const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
      const keep = selectedId && results.permits.some((p) => p.id === selectedId);
      set({ results, loading: false, selectedId: keep ? selectedId : wide ? (results.permits[0]?.id ?? null) : null });
    } catch (err) {
      if (mine === seq) set({ loading: false, error: (err as Error).message });
    }
  },

  select(id) {
    set({ selectedId: id });
  },
  setPitchTrade: (pitchTrade) => set({ pitchTrade }),
  setOffer: (patch) => set(patch),
}));

export function useSelectedPermit(): Permit | null {
  return usePermits((s) => (s.selectedId ? (s.results?.permits.find((p) => p.id === s.selectedId) ?? null) : null));
}

/** "Austin, TX" for one city, or "Texas" for the whole state. */
export function marketName(q: PermitQuery, meta: PermitMeta | null): string {
  const source = q.source ? meta?.sources.find((s) => s.id === q.source) : undefined;
  if (source) return source.name.replace(/\s*\(.*\)$/, "");
  return meta?.states.find((s) => s.code === q.state)?.name ?? q.state ?? "your area";
}
