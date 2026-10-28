"use client";

import { Check, ChevronRight, Star } from "lucide-react";
import { bidTotals, vsAnchor } from "@/lib/bid-math";
import { STAGES } from "@/lib/deal";
import { fitScore } from "@/lib/fit-score";
import { formatDate, money, pct } from "@/lib/format";
import type { Deal, Stage } from "@/lib/types";
import { useApp, useIsTracked, type Tab } from "./state";
import { Button, Card, cx, LevelIcon, Select } from "./ui";

function ScoreRing({ score }: { score: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "var(--good)" : score >= 50 ? "var(--warn)" : "var(--bad)";
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`Fit score ${score} out of 100`}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="33" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--ink)">
        {score}
      </text>
    </svg>
  );
}

function Heading({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-2">
      <h3 className="text-[13px] font-semibold text-ink">{children}</h3>
      {sub && <p className="text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

function PriceChart({ low, high, median, yours, anchor, perYear }: { low: number; high: number; median: number; yours: number; anchor?: number | null; perYear: boolean }) {
  const max = Math.max(high * 1.3, yours * 1.1, (anchor ?? 0) * 1.1, 1);
  const x = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const yourTone = yours <= 0 ? "bg-ink-3" : yours > high ? "bg-warn" : "bg-good";
  return (
    <div>
      <div className="relative h-9" aria-hidden>
        <div className="absolute inset-x-0 top-4 h-1 rounded-full bg-line" />
        <div className="absolute top-3 h-3 rounded-full bg-accent-soft ring-1 ring-accent/30" style={{ left: x(low), width: `calc(${x(high)} - ${x(low)})` }} />
        <div className="absolute top-2 h-5 w-0.5 bg-accent" style={{ left: x(median) }} />
        {anchor ? <div className="absolute top-2 h-5 w-0.5 border-l-2 border-dashed border-ink-2" style={{ left: x(anchor) }} /> : null}
        {yours > 0 && <div className={cx("absolute top-[9px] size-3.5 -translate-x-1/2 rounded-full ring-2 ring-panel", yourTone)} style={{ left: x(yours) }} />}
      </div>
      <dl className="mt-1 grid grid-cols-3 gap-1 text-[11px]">
        <div>
          <dt className="text-ink-3">Typical</dt>
          <dd className="font-medium text-ink tabular-nums">{money(median, { compact: true })}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Middle half</dt>
          <dd className="font-medium text-ink tabular-nums">
            {money(low, { compact: true })}–{money(high, { compact: true })}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-ink-3">You</dt>
          <dd className="font-medium text-ink tabular-nums">{yours > 0 ? money(yours, { compact: true }) : "—"}</dd>
        </div>
      </dl>
      <p className="mt-1 text-[11px] text-ink-3">{perYear ? "Per year" : "Whole award"}. The band is the middle half of past awards; the line is the median.</p>
    </div>
  );
}

export function RightPanel({ deal }: { deal: Deal }) {
  const tracked = useIsTracked(deal.id);
  const track = useApp((s) => s.track);
  const updateDeal = useApp((s) => s.updateDeal);
  const setTab = useApp((s) => s.setTab);
  const pricing = useApp((s) => s.pricing[deal.id]);
  const fit = fitScore(deal.opportunity);
  const t = bidTotals(deal.pricing);
  const multi = deal.pricing.periodLabel === "year";
  const diff = vsAnchor(deal.pricing);
  const done = deal.stage === "submitted" || deal.stage === "won" || deal.stage === "lost";

  const steps: { label: string; done: boolean; tab: Tab }[] = [
    { label: "Read what they're asking for", done: Boolean(deal.breakdown), tab: "overview" },
    { label: "Check what it paid before", done: Boolean(deal.pricing.anchor || pricing), tab: "pricing" },
    { label: "Send the scope to 3+ subs", done: Boolean(deal.sow) && deal.subs.length >= 3, tab: "subs" },
    { label: "Get a quote you trust", done: deal.subs.some((s) => s.quote), tab: "subs" },
    { label: "Put your price on top", done: t.pricePerPeriod > 0, tab: "pricing" },
    { label: "Draft the proposal", done: Boolean(deal.proposal), tab: "proposal" },
    { label: `Submit by ${formatDate(deal.opportunity.responseDeadline, { year: undefined })}`, done, tab: "proposal" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Bid snapshot</h2>
          <p className="text-xs text-ink-3">{tracked ? "Saved to My bids" : "Not tracked yet"}</p>
        </div>
        {tracked ? (
          <Select
            value={deal.stage}
            onChange={(e) => updateDeal(deal.id, (d) => ({ ...d, stage: e.target.value as Stage }))}
            aria-label="Stage"
            className="h-8 w-auto text-xs"
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        ) : (
          <Button size="sm" variant="primary" onClick={() => track(deal.id)}>
            <Star className="size-3.5" /> Track
          </Button>
        )}
      </div>

      <Card className="p-3.5">
        <div className="flex items-center gap-3">
          <ScoreRing score={fit.score} />
          <div>
            <div className="text-sm font-semibold text-ink">{fit.verdict}</div>
            <div className="text-xs text-ink-3">How winnable this is for a sub-out bid</div>
          </div>
        </div>
        <ul className="mt-3 space-y-2">
          {fit.criteria.map((c) => (
            <li key={c.key} className="flex gap-2" title={c.detail}>
              <LevelIcon level={c.level} className="mt-px" />
              <div className="min-w-0">
                <div className="text-[12.5px] leading-tight font-medium text-ink">{c.label}</div>
                <div className="text-[11px] leading-snug text-ink-3">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div>
        <Heading sub={multi ? `${deal.pricing.periods}-year contract` : "One-time job"}>Your bid</Heading>
        <Card className="divide-y divide-line">
          {[
            ["Sub cost", t.subPerPeriod, t.subTotal],
            ["Your price", t.pricePerPeriod, t.priceTotal],
            ["Profit", t.profitPerPeriod, t.profitTotal],
          ].map(([label, per, total], i) => (
            <div key={label} className="flex items-baseline justify-between px-3 py-2">
              <span className="text-xs text-ink-2">{label}</span>
              <span className="text-right">
                <span className={cx("text-[13px] font-semibold tabular-nums", i === 2 && (per as number) > 0 ? "text-good" : i === 2 && (per as number) < 0 ? "text-bad" : "text-ink")}>
                  {money(per as number)}
                  {multi && <span className="font-normal text-ink-3">/yr</span>}
                </span>
                {multi && <span className="block text-[11px] text-ink-3 tabular-nums">{money(total as number)} total</span>}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-ink-2">Margin</span>
            <span className="font-medium text-ink tabular-nums">{pct(t.margin)}</span>
          </div>
        </Card>
        {t.pricePerPeriod === 0 && (
          <button type="button" onClick={() => setTab("pricing")} className="mt-1.5 text-xs font-medium text-accent hover:underline">
            Add your sub&apos;s quote →
          </button>
        )}
      </div>

      <div>
        <Heading sub="From USAspending.gov">Price vs. past awards</Heading>
        <Card className="p-3">
          {pricing && pricing.stats.count > 0 && pricing.stats.medianAnnual != null ? (
            <>
              <PriceChart
                low={(multi ? pricing.stats.lowAnnual : pricing.stats.lowTotal) ?? 0}
                high={(multi ? pricing.stats.highAnnual : pricing.stats.highTotal) ?? 0}
                median={(multi ? pricing.stats.medianAnnual : pricing.stats.medianTotal) ?? 0}
                yours={multi ? t.pricePerPeriod : t.priceTotal}
                anchor={multi ? deal.pricing.anchor?.annual : deal.pricing.anchor?.total}
                perYear={multi}
              />
              {diff != null && deal.pricing.anchor && (
                <p className="mt-2 text-xs text-ink-2">
                  {pct(Math.abs(diff))} {diff < 0 ? "below" : "above"} {deal.pricing.anchor.label}
                </p>
              )}
            </>
          ) : (
            <button type="button" onClick={() => setTab("pricing")} className="flex w-full items-center justify-between text-left text-xs text-ink-2 hover:text-ink">
              {pricing ? "No similar awards found yet" : "Look up what the government paid before"}
              <ChevronRight className="size-4" />
            </button>
          )}
        </Card>
      </div>

      <div>
        <Heading>Next steps</Heading>
        <ul className="space-y-0.5">
          {steps.map((s) => (
            <li key={s.label}>
              <button type="button" onClick={() => setTab(s.tab)} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-panel-2">
                <span
                  className={cx(
                    "grid size-4 shrink-0 place-items-center rounded-full border",
                    s.done ? "border-good bg-good text-white" : "border-line-strong bg-panel",
                  )}
                  aria-hidden
                >
                  {s.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className={cx("text-[12.5px]", s.done ? "text-ink-3 line-through" : "text-ink")}>{s.label}</span>
                <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
