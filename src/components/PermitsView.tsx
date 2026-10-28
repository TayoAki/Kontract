"use client";

import { ChevronDown, ChevronRight, ClipboardList, Loader2, PanelLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import type { Permit } from "@/lib/types";
import { PermitDetail } from "./PermitDetail";
import { relDay, useTradeLabel } from "./PermitMarket";
import { DEFAULT_PERMIT_QUERY, usePermits, useSelectedPermit } from "./permits-state";
import { useApp } from "./state";
import { Badge, Button, Chip, cx, Empty, ErrorNote, Input, Label, Select, Toggle } from "./ui";

const DAYS = [1, 3, 7, 14, 30];

function PermitItem({ p, active, onClick }: { p: Permit; active: boolean; onClick: () => void }) {
  const label = useTradeLabel();
  const shown = p.trades.slice(0, 3);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cx("block w-full border-b border-line px-3 py-2.5 text-left transition-colors", active ? "bg-accent-soft/70" : "hover:bg-panel-2")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-ink">{p.type.split(" · ")[0] || "Permit"}</span>
        {p.value ? <span className="shrink-0 text-xs font-medium text-ink-2 tabular-nums">{money(p.value, { compact: true })}</span> : null}
      </div>
      <div className="mt-0.5 truncate text-xs text-ink-3">
        {p.address}
        {p.city ? ` · ${p.city}` : ""}
        {p.zip ? ` ${p.zip}` : ""}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Badge>{relDay(p.issuedDate)}</Badge>
        {shown.map((t) => (
          <Badge key={t.trade} tone="accent">
            {label(t.trade)}
          </Badge>
        ))}
        {p.trades.length > shown.length && <Badge>+{p.trades.length - shown.length}</Badge>}
      </div>
    </button>
  );
}

function PermitList() {
  const meta = usePermits((s) => s.meta);
  const query = usePermits((s) => s.query);
  const setQuery = usePermits((s) => s.setQuery);
  const results = usePermits((s) => s.results);
  const loading = usePermits((s) => s.loading);
  const error = usePermits((s) => s.error);
  const selectedId = usePermits((s) => s.selectedId);
  const select = usePermits((s) => s.select);
  const setSidebarOpen = useApp((s) => s.setSidebarOpen);
  const [more, setMore] = useState(false);
  const [keyword, setKeyword] = useState(query.q ?? "");
  const [zip, setZip] = useState(query.zip ?? "");
  const cities = useMemo(() => meta?.sources.filter((s) => s.state === query.state) ?? [], [meta, query.state]);
  const byTrade = results?.byTrade ?? {};
  const trades = useMemo(() => [...(meta?.trades ?? [])].sort((a, b) => (byTrade[b.id] ?? 0) - (byTrade[a.id] ?? 0)), [meta, byTrade]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-line p-3">
        <div className="grid grid-cols-2 gap-2">
          <label>
            <Label>State</Label>
            <Select value={query.state ?? ""} onChange={(e) => setQuery({ state: e.target.value })} aria-label="State">
              {meta?.states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              )) ?? <option value={query.state}>{query.state}</option>}
            </Select>
          </label>
          <label>
            <Label>City or county</Label>
            <Select value={query.source ?? ""} onChange={(e) => setQuery({ source: e.target.value || undefined })} aria-label="City or county">
              <option value="">{cities.length > 1 ? `All ${cities.length}` : "All"}</option>
              {cities.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="grid grid-cols-5 gap-1 rounded-lg bg-panel-2 p-1" role="radiogroup" aria-label="Issued within">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={query.days === d}
              onClick={() => setQuery({ days: d })}
              className={cx("h-7 rounded-md text-xs font-medium transition-colors", query.days === d ? "bg-panel text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
            >
              {d === 1 ? "Today" : `${d}d`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Trade">
          <Chip active={!query.trade} onClick={() => setQuery({ trade: undefined })}>
            All trades
          </Chip>
          {trades
            .filter((t) => !results || byTrade[t.id] || query.trade === t.id)
            .map((t) => (
              <Chip key={t.id} active={query.trade === t.id} onClick={() => setQuery({ trade: query.trade === t.id ? undefined : t.id })}>
                {t.label}
                {results && <span className="text-ink-3 tabular-nums">{byTrade[t.id] ?? 0}</span>}
              </Chip>
            ))}
        </div>
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="flex h-8 w-full items-center justify-between rounded-lg bg-panel-2 px-2.5 text-xs text-ink-2 hover:text-ink"
        >
          <span className="truncate">
            {[query.leadsOnly ? "Leads only" : "All permits", query.residentialOnly && "Residential", query.minValue && `${money(query.minValue, { compact: true })}+`, query.zip, query.q && `“${query.q}”`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {more ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
        </button>
        {more && (
          <form
            className="space-y-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery({ q: keyword.trim() || undefined, zip: /^\d{5}$/.test(zip) ? zip : undefined });
            }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keyword, e.g. pool or addition" aria-label="Keyword" className="pl-8" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <Label>ZIP</Label>
                <Input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Any" inputMode="numeric" />
              </label>
              <label>
                <Label>Min. value</Label>
                <Select value={query.minValue ?? 0} onChange={(e) => setQuery({ minValue: Number(e.target.value) || undefined })}>
                  <option value={0}>Any</option>
                  {[10_000, 50_000, 100_000, 250_000, 500_000].map((v) => (
                    <option key={v} value={v}>
                      {money(v, { compact: true })}+
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <Toggle checked={Boolean(query.leadsOnly)} onChange={(v) => setQuery({ leadsOnly: v })}>
                Only permits that mean work for a trade
              </Toggle>
              <Toggle checked={Boolean(query.residentialOnly)} onChange={(v) => setQuery({ residentialOnly: v })}>
                Residential only
              </Toggle>
            </div>
            <div className="flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKeyword("");
                  setZip("");
                  setQuery({ ...DEFAULT_PERMIT_QUERY, state: query.state, source: query.source, days: query.days, trade: query.trade, q: undefined, zip: undefined, minValue: undefined });
                }}
              >
                Reset
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Apply
              </Button>
            </div>
          </form>
        )}
        <div className="text-xs text-ink-2" aria-live="polite">
          {loading || !results
            ? "Loading permits…"
            : `${results.total.toLocaleString()} ${query.leadsOnly ? "lead" : "permit"}${results.total === 1 ? "" : "s"}${query.leadsOnly ? ` from ${results.scanned.toLocaleString()} permits` : ""}`}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="p-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        {loading && !results && (
          <div className="flex items-start gap-2 px-3 py-3 text-xs text-ink-3">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            Pulling the latest permits from each city&apos;s open-data portal…
          </div>
        )}
        {results && results.permits.length === 0 && !loading && (
          <p className="px-3 py-6 text-center text-[13px] text-ink-2">No permits match. Try more days or another trade.</p>
        )}
        <div className={cx(loading && results && "opacity-60 transition-opacity")}>
          {results?.permits.map((p) => (
            <PermitItem
              key={p.id}
              p={p}
              active={p.id === selectedId}
              onClick={() => {
                select(p.id);
                setSidebarOpen(false);
              }}
            />
          ))}
        </div>
        {results && results.total > results.permits.length && (
          <p className="px-3 py-3 text-center text-[11px] text-ink-3">
            Showing the newest {results.permits.length} of {results.total.toLocaleString()}. Narrow by trade, city or ZIP to see the rest.
          </p>
        )}
      </div>
      <div className="border-t border-line px-3 py-2 text-[11px] text-ink-3">City and county open data · refreshed hourly</div>
    </div>
  );
}

export function PermitsView() {
  const loadMeta = usePermits((s) => s.loadMeta);
  const search = usePermits((s) => s.search);
  const hasResults = usePermits((s) => Boolean(s.results));
  const permit = useSelectedPermit();
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const setSidebarOpen = useApp((s) => s.setSidebarOpen);

  useEffect(() => {
    void loadMeta();
    if (!usePermits.getState().results) void search();
  }, [loadMeta, search]);

  return (
    <div className="relative flex min-w-0 flex-1 overflow-clip">
      <div
        className={cx(
          "z-30 w-[300px] shrink-0 border-r border-line bg-panel",
          "max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-xl max-lg:transition-transform",
          permit ? (sidebarOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full") : "max-lg:static max-lg:w-full max-lg:shadow-none",
        )}
      >
        <PermitList />
      </div>
      {sidebarOpen && permit && (
        <button type="button" aria-label="Close list" className="absolute inset-0 z-20 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={cx("flex min-w-0 flex-1", !permit && "max-lg:hidden")}>
        {permit ? (
          <PermitDetail
            permit={permit}
            listButton={
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Show list">
                <PanelLeft className="size-4" /> List
              </Button>
            }
          />
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <Empty icon={<ClipboardList className="size-8" />} title={hasResults ? "Pick a permit" : "Loading permits"}>
              Every permit is a homeowner or builder about to spend money. Open one to see which trades it&apos;s a lead for and who to sell it to.
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}
