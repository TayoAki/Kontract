"use client";

import { ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { applyMarkup, bidTotals, vsAnchor } from "@/lib/bid-math";
import { isServiceCode } from "@/lib/fit-score";
import { formatDate, money, pct, uid } from "@/lib/format";
import { awardKeywords } from "@/lib/rules";
import type { Deal, PastAward, PriceLine, PricingModel, PricingResults } from "@/lib/types";
import { useApp } from "../state";
import { Badge, Button, Card, Chip, cx, Empty, ErrorNote, Input, Label, Note, NumberInput, Section, Select, Stat } from "../ui";

export function defaultPricingQuery(deal: Deal) {
  const o = deal.opportunity;
  return {
    keywords: awardKeywords(o),
    naics: o.naicsCode ?? undefined,
    state: o.placeOfPerformance.state,
    servicesOnly: isServiceCode(o.pscCode) !== false,
    yearsBack: 6,
  };
}

/** Loads past awards for a deal and keeps them in the store, keyed by deal. */
export function usePastAwards(deal: Deal) {
  const results = useApp((s) => s.pricing[deal.id]);
  const setPricing = useApp((s) => s.setPricing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (query: ReturnType<typeof defaultPricingQuery>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, context: { agency: deal.opportunity.agency, state: deal.opportunity.placeOfPerformance.state } }),
        });
        const body = (await res.json()) as PricingResults & { error?: string };
        if (!res.ok) throw new Error(body.error || "Search failed");
        setPricing(deal.id, body);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [deal.id, deal.opportunity.agency, deal.opportunity.placeOfPerformance.state, setPricing],
  );
  return { results, busy, error, run };
}

function AwardRow({ a, onAnchor, anchored }: { a: PastAward; onAnchor: () => void; anchored: boolean }) {
  return (
    <div className={cx("grid gap-2 border-b border-line px-3 py-3 sm:grid-cols-[1fr_auto]", a.likelyRelated && "bg-good-soft/40")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-semibold text-ink">{a.recipient}</span>
          {a.likelyRelated && <Badge tone="good">Same agency &amp; state</Badge>}
        </div>
        <div className="mt-0.5 text-xs text-ink-2">
          {a.subAgency || a.agency}
          {a.state && ` · ${a.state}`} · {formatDate(a.startDate, { month: "short", year: "numeric", day: undefined })}
          {a.endDate && ` – ${formatDate(a.endDate, { month: "short", year: "numeric", day: undefined })}`}
          {a.years != null && ` (${a.years < 1 ? `${Math.max(1, Math.round(a.years * 12))} mo` : `${a.years.toFixed(1)} yrs`})`}
        </div>
        {a.description && <div className="mt-1 line-clamp-2 text-xs text-ink-3">{a.description}</div>}
      </div>
      <div className="flex items-center gap-4 sm:justify-end">
        <div className="text-right">
          <div className="text-sm font-semibold text-ink tabular-nums">{money(a.amount)}</div>
          <div className="text-[11px] text-ink-3 tabular-nums">{a.annualAmount != null && a.years != null && a.years >= 1 ? `${money(a.annualAmount)}/yr` : "total"}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={anchored ? "primary" : "secondary"} onClick={onAnchor} title="Compare your price to this award">
            {anchored ? "Anchor" : "Compare"}
          </Button>
          <a href={a.url} target="_blank" rel="noreferrer" aria-label="Open on USAspending" className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-panel-2 hover:text-ink">
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

function PastAwards({ deal }: { deal: Deal }) {
  const o = deal.opportunity;
  const base = defaultPricingQuery(deal);
  const [keywords, setKeywords] = useState(base.keywords.join(", "));
  const [sameState, setSameState] = useState(Boolean(base.state));
  const [sameNaics, setSameNaics] = useState(Boolean(base.naics));
  const [servicesOnly, setServicesOnly] = useState(base.servicesOnly);
  const [yearsBack, setYearsBack] = useState(6);
  const { results, busy, error, run } = usePastAwards(deal);
  const updateDeal = useApp((s) => s.updateDeal);

  const query = {
    keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
    naics: sameNaics ? base.naics : undefined,
    state: sameState ? base.state : undefined,
    servicesOnly,
    yearsBack,
  };

  useEffect(() => {
    // Search automatically the first time a deal's pricing is opened.
    if (!results) void run(defaultPricingQuery(deal));
  }, [deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAnchor = (anchor: PricingModel["anchor"]) => updateDeal(deal.id, (d) => ({ ...d, pricing: { ...d.pricing, anchor } }));
  const stats = results?.stats;

  return (
    <Section
      title="What the government paid before"
      subtitle="Every federal award is public on USAspending.gov. Find the last contract for this work and price against it."
      step={1}
    >
      <Card className="space-y-3 p-3">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(query);
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Keywords</span>
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Keywords, comma separated" />
          </label>
          <Select value={yearsBack} onChange={(e) => setYearsBack(Number(e.target.value))} aria-label="How far back" className="sm:w-32">
            {[3, 6, 10, 15].map((y) => (
              <option key={y} value={y}>
                Last {y} yrs
              </option>
            ))}
          </Select>
          <Button type="submit" variant="primary" busy={busy}>
            <Search className="size-4" /> Search
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {base.state && (
            <Chip active={sameState} onClick={() => setSameState((v) => !v)}>
              In {base.state} only
            </Chip>
          )}
          {base.naics && (
            <Chip active={sameNaics} onClick={() => setSameNaics((v) => !v)}>
              NAICS {base.naics}
            </Chip>
          )}
          <Chip active={servicesOnly} onClick={() => setServicesOnly((v) => !v)}>
            Services only
          </Chip>
        </div>
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}

      {stats && stats.count > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Similar awards" value={stats.count} hint={`Last ${results.query.yearsBack ?? 6} years`} />
          <Stat
            label="Typical per year"
            value={money(stats.medianAnnual, { compact: true })}
            hint={stats.annualCount < stats.count ? `From ${stats.annualCount} that ran a year+` : "Median, annualized"}
          />
          <Stat label="Typical range / yr" value={`${money(stats.lowAnnual, { compact: true })}–${money(stats.highAnnual, { compact: true })}`} hint="Middle half" />
          <Stat
            label="Typical award"
            value={money(stats.medianTotal, { compact: true })}
            hint={`Middle half ${money(stats.lowTotal, { compact: true })}–${money(stats.highTotal, { compact: true })}`}
          />
        </div>
      )}

      {results && results.awards.length === 0 && !busy && (
        <Empty title="No matching awards">
          Try a shorter keyword, or turn off {sameNaics ? "the NAICS filter" : sameState ? "the state filter" : "a filter"}.
        </Empty>
      )}

      {results && results.awards.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-2">
            <span className="text-xs text-ink-2">Newest first. Amounts are dollars obligated so far.</span>
            {stats?.medianAnnual != null || stats?.medianTotal != null ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAnchor({ annual: stats?.medianAnnual ?? null, total: stats?.medianTotal ?? 0, label: `Median of ${stats?.count} similar awards` })}
              >
                Compare to the median
              </Button>
            ) : null}
          </div>
          <div className="scroll-thin max-h-[440px] overflow-y-auto">
            {results.awards.slice(0, 60).map((a) => (
              <AwardRow
                key={a.id}
                a={a}
                anchored={deal.pricing.anchor?.label.startsWith(a.recipient) ?? false}
                onAnchor={() =>
                  setAnchor({
                    annual: a.years != null && a.years >= 1 ? a.annualAmount : null,
                    total: a.amount,
                    label: `${a.recipient} · ${a.subAgency || a.agency} · ${a.startDate?.slice(0, 4) ?? ""}`,
                  })
                }
              />
            ))}
          </div>
        </Card>
      )}
      {o.isSample && results && <Note>The notice is a sample, but these awards are real data from USAspending.gov.</Note>}
    </Section>
  );
}

function LineRow({ line, perLabel, onChange, onRemove }: { line: PriceLine; perLabel: string; onChange: (l: PriceLine) => void; onRemove: () => void }) {
  const profit = line.quantity * (line.price - line.subCost);
  const unit = line.unit || "unit";
  return (
    <div className="space-y-2 border-b border-line px-3 py-3">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Item</span>
          <Input value={line.description} onChange={(e) => onChange({ ...line, description: e.target.value })} className="h-8 font-medium" />
        </label>
        <label className="w-28 shrink-0">
          <span className="sr-only">Unit</span>
          <Input value={line.unit} onChange={(e) => onChange({ ...line, unit: e.target.value })} className="h-8" aria-label="Unit" placeholder="unit" />
        </label>
        <button type="button" onClick={onRemove} aria-label="Remove line" className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-panel-2 hover:text-bad">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label>
          <Label>Qty {perLabel}</Label>
          <NumberInput value={line.quantity} onChange={(quantity) => onChange({ ...line, quantity })} aria-label={`Quantity ${perLabel}`} />
        </label>
        <label>
          <Label>Sub cost / {unit}</Label>
          <NumberInput prefix="$" value={line.subCost} onChange={(subCost) => onChange({ ...line, subCost })} aria-label="Subcontractor cost per unit" />
        </label>
        <label>
          <Label>Your price / {unit}</Label>
          <NumberInput prefix="$" value={line.price} onChange={(price) => onChange({ ...line, price })} aria-label="Your price per unit" />
        </label>
        <div>
          <Label>Profit {perLabel}</Label>
          <div className={cx("flex h-8 items-center justify-end text-[13px] font-semibold tabular-nums", profit > 0 ? "text-good" : profit < 0 ? "text-bad" : "text-ink-3")}>
            {money(profit)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PriceBuilder({ deal }: { deal: Deal }) {
  const updateDeal = useApp((s) => s.updateDeal);
  const defaultMarkup = useApp((s) => s.profile?.defaultMarkupPct ?? 35);
  const [markup, setMarkup] = useState(defaultMarkup);
  const p = deal.pricing;
  const t = bidTotals(p);
  const diff = vsAnchor(p);
  const multi = p.periodLabel === "year";
  const perLabel = multi ? "/ yr" : "total";
  const set = (fn: (p: PricingModel) => PricingModel) => updateDeal(deal.id, (d) => ({ ...d, pricing: fn(d.pricing) }));

  return (
    <Section
      title="Build your price"
      subtitle="Enter what your subcontractor charges, then put your price on top."
      step={2}
      actions={
        <div className="flex items-center gap-1.5">
          <NumberInput value={markup} onChange={setMarkup} className="w-16" aria-label="Markup percent" />
          <span className="text-xs text-ink-2">%</span>
          <Button size="sm" onClick={() => set((m) => applyMarkup(m, markup))} disabled={!p.lines.some((l) => l.subCost > 0)}>
            Apply markup
          </Button>
        </div>
      }
    >
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-panel-2 px-3 py-2.5">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-panel p-0.5" role="radiogroup" aria-label="Contract length">
            {[
              [true, "Multi-year"],
              [false, "One-time job"],
            ].map(([isMulti, label]) => (
              <button
                key={String(label)}
                type="button"
                role="radio"
                aria-checked={multi === isMulti}
                onClick={() => set((m) => ({ ...m, periodLabel: isMulti ? "year" : "contract", periods: isMulti ? Math.max(m.periods, 2) : 1 }))}
                className={cx("h-7 rounded-md px-2.5 text-xs font-medium", multi === isMulti ? "bg-accent text-on-accent" : "text-ink-2 hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
          {multi && (
            <label className="flex items-center gap-2 text-xs text-ink-2">
              Runs
              <NumberInput value={p.periods} onChange={(n) => set((m) => ({ ...m, periods: Math.min(Math.max(Math.round(n) || 1, 1), 20) }))} className="w-14" aria-label="Years" />
              years (base + options)
            </label>
          )}
        </div>
        {p.lines.map((l) => (
          <LineRow
            key={l.id}
            line={l}
            perLabel={perLabel}
            onChange={(nl) => set((m) => ({ ...m, lines: m.lines.map((x) => (x.id === l.id ? nl : x)) }))}
            onRemove={() => set((m) => ({ ...m, lines: m.lines.filter((x) => x.id !== l.id) }))}
          />
        ))}
        <div className="px-3 py-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => set((m) => ({ ...m, lines: [...m.lines, { id: uid("line"), description: "New item", unit: "unit", quantity: 1, subCost: 0, price: 0 }] }))}
          >
            <Plus className="size-3.5" /> Add line
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label={`Sub cost ${multi ? "/ yr" : ""}`} value={money(t.subPerPeriod)} hint={multi ? `${money(t.subTotal)} over ${p.periods} yrs` : undefined} />
        <Stat label={`Your price ${multi ? "/ yr" : ""}`} value={money(t.pricePerPeriod)} hint={multi ? `${money(t.priceTotal)} contract value` : undefined} />
        <Stat
          label={`Profit ${multi ? "/ yr" : ""}`}
          value={money(t.profitPerPeriod)}
          tone={t.profitPerPeriod > 0 ? "good" : t.profitPerPeriod < 0 ? "bad" : undefined}
          hint={multi ? `${money(t.profitTotal)} over ${p.periods} yrs` : undefined}
        />
        <Stat label="Margin" value={pct(t.margin)} hint={t.markup != null ? `${pct(t.markup)} markup on sub` : undefined} />
      </div>

      {p.anchor && diff != null && (
        <Note tone={diff > 0.05 ? "warn" : "accent"}>
          {diff > 0.05
            ? `You're ${pct(diff)} above ${p.anchor.label}. The government usually picks the lowest price, so check your markup.`
            : diff < -0.25
              ? `You're ${pct(-diff)} below ${p.anchor.label}. That's very competitive, and you may have room to raise your price.`
              : `You're ${pct(Math.abs(diff))} ${diff < 0 ? "below" : "above"} ${p.anchor.label}.`}
        </Note>
      )}
    </Section>
  );
}

export function PricingTab({ deal }: { deal: Deal }) {
  return (
    <div className="space-y-10">
      <PastAwards key={deal.id} deal={deal} />
      <PriceBuilder key={`price-${deal.id}`} deal={deal} />
    </div>
  );
}
