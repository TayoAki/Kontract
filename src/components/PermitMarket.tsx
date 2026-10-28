"use client";

import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { crmSummary } from "@/lib/crm";
import { formatDate, money } from "@/lib/format";
import type { TradeId } from "@/lib/types";
import { marketName, usePermits } from "./permits-state";
import { useApp } from "./state";
import { cx, Label, NumberInput, Select } from "./ui";

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
  const trades = usePermits((s) => s.meta?.trades);
  return (id: TradeId) => trades?.find((t) => t.id === id)?.label ?? id;
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
      <div className="h-full rounded-full bg-accent" style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

/** Right panel: the market at a glance, its feeds, and what selling leads here could earn. */
export function PermitMarket() {
  const meta = usePermits((s) => s.meta);
  const query = usePermits((s) => s.query);
  const results = usePermits((s) => s.results);
  const setQuery = usePermits((s) => s.setQuery);
  const price = usePermits((s) => s.price);
  const guaranteeDays = usePermits((s) => s.guaranteeDays);
  const setOffer = usePermits((s) => s.setOffer);
  const contacts = useApp((s) => s.contacts);
  const [goal, setGoal] = useState(10);
  const label = useTradeLabel();
  const inState = useMemo(() => Object.values(contacts).filter((c) => !query.state || c.state === query.state), [contacts, query.state]);
  const crm = crmSummary(inState);
  const rows = Object.entries(results?.byTrade ?? {}).sort((a, b) => b[1] - a[1]) as [TradeId, number][];
  const max = rows[0]?.[1] ?? 0;
  const market = marketName(query, meta);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Leads by trade</h3>
        <p className="mb-2 text-xs text-ink-3">
          {market}, last {query.days === 1 ? "day" : `${query.days} days`}. Pick one to see its permits.
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
      </div>

      <div>
        <h3 className="text-[13px] font-semibold text-ink">What this could pay</h3>
        <p className="mb-2 text-xs text-ink-3">Sell each trade in each city its own daily list.</p>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <Label>Price / month</Label>
            <NumberInput value={price} onChange={(n) => setOffer({ price: n })} prefix="$" aria-label="Monthly price" />
          </label>
          <label>
            <Label>Refund window</Label>
            <Select value={guaranteeDays} onChange={(e) => setOffer({ guaranteeDays: Number(e.target.value) })} className="h-8">
              {[14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="mt-3 rounded-lg bg-panel-2 px-3 py-2.5 text-[13px]">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-ink-2">
              <input
                type="number"
                min={1}
                max={500}
                value={goal}
                onChange={(e) => setGoal(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                className="h-7 w-14 rounded-md border border-line-strong bg-panel px-1.5 text-right text-ink tabular-nums"
                aria-label="Number of clients"
              />
              clients × {money(price)}
            </label>
            <span className="font-semibold text-ink tabular-nums">{money(goal * price)}/mo</span>
          </div>
          <div className="mt-1 text-xs text-ink-3">
            {money(goal * price * 12)} a year{goal >= 5 ? `, or about ${Math.ceil(goal / 5)} per trade across 5 trades` : ""}.
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-line px-2 py-1.5">
            <div className="text-[11px] text-ink-3">Prospects</div>
            <div className="text-sm font-semibold text-ink tabular-nums">{crm.byStage.prospect + crm.byStage.contacted}</div>
          </div>
          <div className="rounded-lg border border-line px-2 py-1.5">
            <div className="text-[11px] text-ink-3">Trials</div>
            <div className="text-sm font-semibold text-ink tabular-nums">{crm.byStage.trial}</div>
          </div>
          <div className="rounded-lg border border-line px-2 py-1.5">
            <div className="text-[11px] text-ink-3">Paying</div>
            <div className="text-sm font-semibold text-good tabular-nums">{money(crm.mrr)}</div>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-ink-3">Your CRM{query.state ? ` in ${query.state}` : ""}.</p>
      </div>

      <div>
        <h3 className="text-[13px] font-semibold text-ink">Where these come from</h3>
        <p className="mb-2 text-xs text-ink-3">Public building-permit feeds, free and updated daily.</p>
        <ul className="space-y-1.5">
          {(results?.sources ?? []).map((s) => {
            const info = meta?.sources.find((x) => x.id === s.id);
            return (
              <li key={s.id} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate text-ink-2">{s.name}</div>
                  {s.error && <div className="text-warn">{s.error.charAt(0).toUpperCase() + s.error.slice(1)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-ink tabular-nums">{s.count.toLocaleString()}</span>
                  {info && (
                    <a href={info.datasetUrl} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-accent" aria-label={`${s.name} dataset`}>
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
