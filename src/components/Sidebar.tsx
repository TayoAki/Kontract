"use client";

import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { STAGES, stageLabel } from "@/lib/deal";
import { fitScore } from "@/lib/fit-score";
import { daysUntil, formatDate, placeLabel } from "@/lib/format";
import type { Deal, Opportunity, OpportunitySearch, OpportunitySort, Stage } from "@/lib/types";
import { DEFAULT_FILTERS, useApp } from "./state";
import { Avatar, Badge, Button, Chip, cx, dueText, dueTone, ErrorNote, Input, Label, Note, Select, Toggle } from "./ui";

export const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA WA WV WI WY GU VI".split(" ");

export const SET_ASIDES: [string, string][] = [
  ["", "Any"],
  ["SBA", "Total small business"],
  ["SBP", "Partial small business"],
  ["8A", "8(a)"],
  ["HZC", "HUBZone"],
  ["SDVOSBC", "Service-disabled veteran-owned"],
  ["WOSB", "Women-owned (WOSB)"],
  ["EDWOSB", "Economically disadvantaged WOSB"],
];

function fitTone(score: number) {
  return score >= 75 ? "good" : score >= 50 ? "warn" : "bad";
}

function Item({ o, deal, active, onClick }: { o: Opportunity; deal?: Deal; active: boolean; onClick: () => void }) {
  const fit = fitScore(o, undefined, deal?.details?.noticeId === o.id ? deal.details : undefined);
  const days = daysUntil(o.responseDeadline);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cx(
        "flex w-full gap-3 border-b border-line px-3 py-2.5 text-left transition-colors",
        active ? "bg-accent-soft/70" : "hover:bg-panel-2",
      )}
    >
      <Avatar name={o.agency || o.office || "?"} size={30} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[13px] leading-snug font-medium text-ink">{o.title}</div>
        <div className="mt-0.5 truncate text-xs text-ink-3">
          {o.agency || o.office} · {placeLabel(o.placeOfPerformance)}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge tone={dueTone(days)}>{dueText(days)}</Badge>
          <Badge tone={fitTone(fit.score)} title={fit.verdict}>
            Fit {fit.score}
          </Badge>
          {o.source === "sled" && <Badge title={o.portal}>{o.level === "state" ? "State" : "Local"}</Badge>}
          {deal && <Badge tone="accent">{stageLabel(deal.stage)}</Badge>}
          {o.isSample && <Badge>Sample</Badge>}
        </div>
      </div>
    </button>
  );
}

function FilterPanel() {
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const search = useApp((s) => s.search);
  return (
    <div className="space-y-3 border-b border-line bg-panel-2 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <Label>State</Label>
          <Select value={filters.state ?? ""} onChange={(e) => setFilters({ state: e.target.value })}>
            <option value="">Anywhere</option>
            {US_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </label>
        <label>
          <Label>NAICS</Label>
          <Input value={filters.naics ?? ""} onChange={(e) => setFilters({ naics: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="e.g. 561730" inputMode="numeric" />
        </label>
      </div>
      <label className="block">
        <Label>Source</Label>
        <Select value={filters.level ?? ""} onChange={(e) => setFilters({ level: e.target.value as OpportunitySearch["level"] })}>
          <option value="">Federal, state and local</option>
          <option value="federal">Federal only (SAM.gov)</option>
          <option value="sled">State and local only</option>
        </Select>
      </label>
      <label className="block">
        <Label>Set-aside</Label>
        <Select value={filters.setAside ?? ""} onChange={(e) => setFilters({ setAside: e.target.value })}>
          {SET_ASIDES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <Label>Posted within</Label>
          <Select value={filters.postedWithinDays ?? 0} onChange={(e) => setFilters({ postedWithinDays: Number(e.target.value) })}>
            <option value={0}>Any time</option>
            {[3, 7, 14, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Label>Time to respond</Label>
          <Select value={filters.minDaysToRespond ?? 0} onChange={(e) => setFilters({ minDaysToRespond: Number(e.target.value) })}>
            <option value={0}>Any</option>
            {[5, 7, 10, 14].map((d) => (
              <option key={d} value={d}>
                {d}+ days
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <Toggle checked={Boolean(filters.servicesOnly)} onChange={(v) => setFilters({ servicesOnly: v })}>
          Services only (no products)
        </Toggle>
        <Toggle checked={Boolean(filters.biddableOnly)} onChange={(v) => setFilters({ biddableOnly: v })}>
          Open for bids only
        </Toggle>
      </div>
      <div className="flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFilters({ ...DEFAULT_FILTERS, q: filters.q });
            void search();
          }}
        >
          Reset
        </Button>
        <Button variant="primary" size="sm" onClick={() => void search()}>
          Apply filters
        </Button>
      </div>
    </div>
  );
}

function filterSummary(f: OpportunitySearch): string {
  const parts: string[] = [];
  if (f.level === "federal") parts.push("Federal");
  if (f.level === "sled") parts.push("State & local");
  if (f.servicesOnly) parts.push("Services");
  if (f.biddableOnly) parts.push("Open bids");
  if (f.state) parts.push(f.state);
  if (f.naics) parts.push(`NAICS ${f.naics}`);
  if (f.setAside) parts.push(SET_ASIDES.find(([v]) => v === f.setAside)?.[1] ?? f.setAside);
  if (f.minDaysToRespond) parts.push(`${f.minDaysToRespond}+ days`);
  if (f.postedWithinDays) parts.push(`Posted ≤${f.postedWithinDays}d`);
  return parts.join(" · ") || "All notices";
}

export function Sidebar({ mode }: { mode: "search" | "bids" }) {
  const setView = useApp((s) => s.setView);
  const deals = useApp((s) => s.deals);
  const results = useApp((s) => s.results);
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const search = useApp((s) => s.search);
  const searching = useApp((s) => s.searching);
  const searchError = useApp((s) => s.searchError);
  const notice = useApp((s) => s.resultsNotice);
  const total = useApp((s) => s.resultsTotal);
  const source = useApp((s) => s.resultsSource);
  const asOf = useApp((s) => s.resultsAsOf);
  const sledTotal = useApp((s) => s.resultsSled);
  const loadingMore = useApp((s) => s.loadingMore);
  const loadMore = useApp((s) => s.loadMore);
  const selectedId = useApp((s) => s.selectedId);
  const select = useApp((s) => s.select);
  const [showFilters, setShowFilters] = useState(false);
  const [stage, setStage] = useState<Stage | "all">("all");

  const bidList = useMemo(() => {
    const list = Object.values(deals).sort((a, b) => (a.opportunity.responseDeadline ?? "9").localeCompare(b.opportunity.responseDeadline ?? "9"));
    return stage === "all" ? list : list.filter((d) => d.stage === stage);
  }, [deals, stage]);
  const dealCount = Object.keys(deals).length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-panel-2 p-1" role="tablist" aria-label="List">
          {(["search", "bids"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setView(m)}
              className={cx(
                "h-7 rounded-md text-xs font-medium transition-colors",
                mode === m ? "bg-panel text-ink shadow-sm" : "text-ink-2 hover:text-ink",
              )}
            >
              {m === "search" ? "Opportunities" : `My bids${dealCount ? ` (${dealCount})` : ""}`}
            </button>
          ))}
        </div>

        {mode === "search" && (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input
                value={filters.q ?? ""}
                onChange={(e) => setFilters({ q: e.target.value })}
                placeholder="Keyword, e.g. janitorial"
                aria-label="Search opportunities"
                className="pl-8"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className="flex h-8 w-full items-center justify-between rounded-lg bg-panel-2 px-2.5 text-xs text-ink-2 hover:text-ink"
            >
              <span className="truncate">{filterSummary(filters)}</span>
              {showFilters ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
            </button>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="truncate text-xs text-ink-2" aria-live="polite">
                {searching || (!source && !searchError) ? "Searching…" : `${total.toLocaleString()} ${source === "sample" ? "sample " : ""}notice${total === 1 ? "" : "s"}`}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-ink-3">
                Sort
                <Select
                  value={filters.sort ?? "fit"}
                  onChange={(e) => {
                    setFilters({ sort: e.target.value as OpportunitySort });
                    void search();
                  }}
                  className="h-7 w-auto pr-7 pl-2 text-xs"
                >
                  <option value="fit">Best fit</option>
                  <option value="deadline">Due soonest</option>
                  <option value="newest">Newest</option>
                </Select>
              </label>
            </div>
          </form>
        )}

        {mode === "bids" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip active={stage === "all"} onClick={() => setStage("all")}>
              All
            </Chip>
            {STAGES.map((s) => (
              <Chip key={s.id} active={stage === s.id} onClick={() => setStage(s.id)}>
                {s.label}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {mode === "search" && showFilters && <FilterPanel />}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {mode === "search" && (
          <>
            {(notice || searchError) && (
              <div className="space-y-2 p-3">
                {searchError && <ErrorNote>{searchError}</ErrorNote>}
                {notice && <Note tone={source === "sample" ? "warn" : "accent"}>{notice}</Note>}
              </div>
            )}
            {searching && (
              <div className="flex items-start gap-2 px-3 py-3 text-xs text-ink-3">
                <Loader2 className="size-4 shrink-0 animate-spin" />
                {source ? "Searching…" : "Loading SAM.gov's daily file of open notices. The first load downloads it and takes about 30 seconds."}
              </div>
            )}
            {!searching && results.length === 0 && !searchError && (
              <p className="px-3 py-6 text-center text-[13px] text-ink-2">No matches. Try a broader keyword or fewer filters.</p>
            )}
            {results.map((o) => (
              <Item key={o.id} o={o} deal={deals[o.id]} active={o.id === selectedId} onClick={() => select(o)} />
            ))}
            {!searching && results.length < total && (
              <div className="p-3">
                <Button className="w-full" onClick={() => void loadMore()} busy={loadingMore}>
                  Show more ({(total - results.length).toLocaleString()} left)
                </Button>
              </div>
            )}
          </>
        )}
        {mode === "bids" &&
          (bidList.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-2">{dealCount ? "Nothing in this stage." : "Bids you track show up here."}</p>
          ) : (
            bidList.map((d) => <Item key={d.id} o={d.opportunity} deal={d} active={d.id === selectedId} onClick={() => select(d)} />)
          ))}
      </div>
      <div className="border-t border-line px-3 py-2 text-[11px] text-ink-3">
        {mode === "search"
          ? source === "bulk" && asOf
            ? `SAM.gov daily file · ${formatDate(asOf, { hour: "numeric", minute: "2-digit" })}${sledTotal ? ` · ${sledTotal} state & local` : ""}`
            : `${results.length} shown`
          : `${bidList.length} bid${bidList.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
