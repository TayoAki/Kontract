"use client";

import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { benchSummary, CRM_STAGES } from "@/lib/crm";
import { formatDate } from "@/lib/format";
import type { FeedHealthStatus, SignalStrength, TradeId } from "@/lib/types";
import { marketName, usePermits } from "./permits-state";
import { useApp } from "./state";
import { Badge, Button, cx } from "./ui";

/** "Today", "Yesterday", "Oct 26". */
export function relDay(iso: string, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const diff = Math.round((today - new Date(y, m - 1, d).getTime()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return formatDate(`${iso}T12:00:00`, { year: undefined });
}

export function useTradeLabel() {
  const work = usePermits((s) => s.meta?.work);
  return (id: string) => work?.find((t) => t.id === id)?.label ?? id;
}

export const STRENGTH_LABEL: Record<SignalStrength, string> = { strong: "Strong", likely: "Likely", possible: "Possible" };
export const strengthTone = (s: SignalStrength) => (s === "strong" ? "good" : s === "likely" ? "accent" : "neutral");

const HEALTH_DOT: Record<FeedHealthStatus, string> = { ok: "bg-good", stale: "bg-warn", empty: "bg-warn", failing: "bg-bad", unknown: "bg-ink-3" };
export const HEALTH_LABEL: Record<FeedHealthStatus, string> = { ok: "Healthy", stale: "Stale", empty: "Empty", failing: "Failing", unknown: "Not checked" };

export function HealthDot({ status }: { status: FeedHealthStatus }) {
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", HEALTH_DOT[status])} aria-label={HEALTH_LABEL[status]} />;
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
      <div className="h-full rounded-full bg-accent" style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

/** Right panel: leads by trade, your bench here, and the feeds behind it. */
export function PermitMarket() {
  const meta = usePermits((s) => s.meta);
  const query = usePermits((s) => s.query);
  const results = usePermits((s) => s.results);
  const setQuery = usePermits((s) => s.setQuery);
  const contacts = useApp((s) => s.contacts);
  const setView = useApp((s) => s.setView);
  const label = useTradeLabel();
  const bench = useMemo(() => benchSummary(Object.values(contacts).filter((c) => !query.state || c.state === query.state)), [contacts, query.state]);
  const rows = Object.entries(results?.byTrade ?? {}).sort((a, b) => b[1] - a[1]) as [TradeId, number][];
  const max = rows[0]?.[1] ?? 0;
  const market = marketName(query, meta);
  const feeds = (meta?.feeds ?? []).filter((f) => (query.market ? f.market === query.market : f.state === query.state));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Leads by trade</h3>
        <p className="mb-2 text-xs text-ink-3">
          {market}, last {query.days === 1 ? "day" : `${query.days} days`}. One lead per address.
        </p>
        {rows.length === 0 ? (
          <p className="text-xs text-ink-3">{results ? "No leads in this window." : "Loading…"}</p>
        ) : (
          <ul className="space-y-1">
            {rows.map(([trade, n]) => (
              <li key={trade}>
                <button
                  type="button"
                  onClick={() => setQuery({ trade: query.trade === trade ? undefined : trade })}
                  className={cx("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-panel-2", query.trade === trade && "bg-accent-soft")}
                >
                  <span className="w-28 shrink-0 truncate text-ink-2">{label(trade)}</span>
                  <Bar value={n} max={max} />
                  <span className="w-10 shrink-0 text-right font-medium text-ink tabular-nums">{n.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {results && (
          <p className="mt-2 text-[11px] text-ink-3">
            {results.scanned.toLocaleString()} permits at {results.addresses.toLocaleString()} addresses.
          </p>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-ink">Your bench{query.state ? ` in ${query.state}` : ""}</h3>
          <button type="button" onClick={() => setView("crm")} className="text-xs text-accent hover:underline">
            Open
          </button>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
          {CRM_STAGES.filter((s) => s.id !== "not-a-fit").map((s) => (
            <div key={s.id} className="rounded-lg border border-line px-1 py-1.5">
              <div className="truncate text-[10px] text-ink-3">{s.label}</div>
              <div className={cx("text-sm font-semibold tabular-nums", s.id === "active" ? "text-good" : "text-ink")}>{bench.byStage[s.id]}</div>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-3">Subs you add from permits land here as Found.</p>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-ink">Where these come from</h3>
          <Button size="sm" variant="ghost" onClick={() => setView("sources")}>
            All sources
          </Button>
        </div>
        <ul className="mt-1 space-y-2">
          {feeds.map((f) => {
            const count = results?.sources.find((s) => s.id === f.id);
            return (
              <li key={f.id} className="text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <HealthDot status={f.health.status} />
                    <span className="truncate text-ink-2" title={f.name}>
                      {f.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {count && <span className="text-ink tabular-nums">{count.count.toLocaleString()}</span>}
                    <a href={f.datasetUrl} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-accent" aria-label={`${f.name} dataset`}>
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </div>
                {count?.error && <div className="mt-0.5 pl-3.5 text-warn">{count.error.charAt(0).toUpperCase() + count.error.slice(1)}</div>}
                {f.health.status !== "ok" && !count?.error && <div className="mt-0.5 pl-3.5 text-ink-3">{f.health.detail}</div>}
              </li>
            );
          })}
        </ul>
        {feeds.some((f) => f.gaps.length) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {[...new Set(feeds.flatMap((f) => f.gaps))].slice(0, 3).map((g) => (
              <Badge key={g} className="whitespace-normal">
                {g}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
