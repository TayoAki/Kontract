"use client";

import { ArrowRight, Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { bidTotals } from "@/lib/bid-math";
import { STAGES } from "@/lib/deal";
import { daysUntil, formatDate, money, pct } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { useApp } from "./state";
import { Avatar, Badge, Button, Card, cx, dueText, dueTone, Empty, Stat } from "./ui";
import { todaysFocus, WEEK } from "./week";

function DealCard({ deal }: { deal: Deal }) {
  const open = useApp((s) => s.open);
  const days = daysUntil(deal.opportunity.responseDeadline);
  const t = bidTotals(deal.pricing);
  return (
    <button type="button" onClick={() => open(deal.id)} className="w-full rounded-lg border border-line bg-panel p-2.5 text-left transition-colors hover:border-line-strong hover:bg-panel-2">
      <div className="flex gap-2">
        <Avatar name={deal.opportunity.agency || "?"} size={22} />
        <div className="line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug font-medium text-ink">{deal.opportunity.title}</div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {(deal.stage === "found" || deal.stage === "sourcing" || deal.stage === "quoted") && <Badge tone={dueTone(days)}>{dueText(days)}</Badge>}
        {t.priceTotal > 0 && <Badge>{money(t.priceTotal, { compact: true })}</Badge>}
        {deal.subs.length > 0 && <Badge>{deal.subs.length} subs</Badge>}
      </div>
    </button>
  );
}

const START_DISMISSED = "kontract:start-dismissed";

/** The four steps to a first bid, for new accounts. Hidden once done or dismissed. */
function StartHere({ deals }: { deals: Deal[] }) {
  const profile = useApp((s) => s.profile);
  const setView = useApp((s) => s.setView);
  const open = useApp((s) => s.open);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(START_DISMISSED) === "1";
    } catch {
      return false;
    }
  });
  const withSubs = deals.find((d) => d.subs.length > 0) ?? deals[0];
  const steps = [
    { done: Boolean(profile?.companyName && profile.uei), title: "Add your company details", detail: "Name, UEI and CAGE from SAM.gov. They fill in every scope and proposal.", action: "Open settings", go: () => setView("settings") },
    { done: deals.length > 0, title: "Pick a bid you understand", detail: "Start with services you know (cleaning, grounds, pest control) in your state, with 2+ weeks to respond.", action: "Find opportunities", go: () => setView("search") },
    { done: deals.some((d) => d.subs.some((s) => s.quote || s.quoteTotal)), title: "Get a quote from a local sub", detail: "Fill in the scope of work, shortlist 3 companies, and send each a quote link.", action: withSubs ? "Open the bid" : "Find a bid first", go: () => (withSubs ? open(withSubs.id, "subs") : setView("search")) },
    { done: deals.some((d) => d.submittedAt), title: "Price it and send the proposal", detail: "Your price on top of the sub's, then the proposal from the Proposal tab.", action: "My bids", go: () => setView("bids") },
  ];
  const next = steps.findIndex((s) => !s.done);
  if (dismissed || next === -1) return null;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Start here: your first bid</h2>
          <p className="text-xs text-ink-2">Four steps. Most people finish the first three in an afternoon.</p>
        </div>
        <button
          type="button"
          className="text-xs text-ink-3 hover:text-ink"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(START_DISMISSED, "1");
            } catch {
              // Private mode: it just comes back next time.
            }
          }}
        >
          Hide
        </button>
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-4">
        {steps.map((st, i) => (
          <li key={st.title} className={cx("flex flex-col rounded-lg border p-3", i === next ? "border-accent bg-accent-soft/40" : "border-line")}>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <span className={cx("grid size-5 shrink-0 place-items-center rounded-full text-[11px]", st.done ? "bg-good text-white" : i === next ? "bg-accent text-on-accent" : "bg-panel-2 text-ink-3")}>
                {st.done ? <Check className="size-3" /> : i + 1}
              </span>
              {st.title}
            </div>
            <p className="mt-1 flex-1 text-xs leading-snug text-ink-2">{st.detail}</p>
            {i === next && (
              <Button size="sm" variant="primary" className="mt-2 self-start" onClick={st.go}>
                {st.action} <ArrowRight className="size-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function HomeView() {
  const dealMap = useApp((s) => s.deals);
  const deals = useMemo(() => Object.values(dealMap), [dealMap]);
  const setView = useApp((s) => s.setView);
  const loaded = useApp((s) => s.loaded);
  const today = todaysFocus();
  const now = new Date();
  const month = now.toISOString().slice(0, 7);

  const submittedThisMonth = deals.filter((d) => d.submittedAt?.startsWith(month)).length;
  const won = deals.filter((d) => d.stage === "won");
  const decided = deals.filter((d) => d.stage === "won" || d.stage === "lost").length;
  const valueSubmitted = deals.filter((d) => ["submitted", "won", "lost"].includes(d.stage)).reduce((s, d) => s + bidTotals(d.pricing).priceTotal, 0);
  const profitWon = won.reduce((s, d) => s + bidTotals(d.pricing).profitTotal, 0);
  const open = deals.filter((d) => ["found", "sourcing", "quoted"].includes(d.stage)).length;

  return (
    <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
        <header>
          <h1 className="text-2xl font-semibold text-ink">This week</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {formatDate(now.toISOString(), { weekday: "long", month: "long", day: "numeric" })}. A few focused hours a day keeps the pipeline full.
          </p>
        </header>

        <StartHere deals={deals} />

        <div className="grid gap-2 sm:grid-cols-5">
          {WEEK.map((d) => {
            const isToday = d.day === today.day;
            return (
              <Card key={d.day} className={cx("flex flex-col p-3", isToday && "border-accent ring-1 ring-accent/30")}>
                <div className={cx("text-[11px] font-semibold tracking-wide uppercase", isToday ? "text-accent" : "text-ink-3")}>
                  {d.day}
                  {isToday && " · today"}
                </div>
                <div className="mt-1 text-[13px] font-semibold text-ink">{d.task}</div>
                <p className="mt-1 flex-1 text-xs leading-snug text-ink-2">{d.detail}</p>
                {isToday && (
                  <Button size="sm" variant="primary" className="mt-3 self-start" onClick={() => setView(d.action.view)}>
                    {d.action.label} <ArrowRight className="size-3.5" />
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Open bids" value={open} hint="Found, sourcing or quoted" />
          <Stat label="Submitted this month" value={submittedThisMonth} hint="More bids, more wins" />
          <Stat label="Won" value={won.length} tone={won.length ? "good" : undefined} />
          <Stat label="Win rate" value={decided ? pct(won.length / decided) : "—"} hint={decided ? `${won.length} of ${decided} decided` : "No results yet"} />
          <Stat label="Value submitted" value={money(valueSubmitted, { compact: true })} />
          <Stat label="Profit from wins" value={money(profitWon, { compact: true })} tone={profitWon > 0 ? "good" : undefined} hint="Over the full contracts" />
        </div>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Pipeline</h2>
              <p className="text-[13px] text-ink-2">Every bid you&apos;re tracking, by stage.</p>
            </div>
            <Button size="sm" onClick={() => setView("search")}>
              <Search className="size-3.5" /> Find more
            </Button>
          </div>
          {loaded && deals.length === 0 ? (
            <Empty
              title="Nothing in the pipeline yet"
              action={
                <Button variant="primary" onClick={() => setView("search")}>
                  Find your first opportunity
                </Button>
              }
            >
              Look for service contracts you understand, with a small-business set-aside and at least a week to respond.
            </Empty>
          ) : (
            <div className="scroll-thin -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              <div className="grid min-w-[900px] grid-cols-6 gap-2">
                {STAGES.map((s) => {
                  const list = deals
                    .filter((d) => d.stage === s.id)
                    .sort((a, b) => (a.opportunity.responseDeadline ?? "9").localeCompare(b.opportunity.responseDeadline ?? "9"));
                  return (
                    <div key={s.id} className="rounded-xl bg-panel-2 p-2">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-xs font-semibold text-ink">{s.label}</span>
                        <span className="text-[11px] text-ink-3">{list.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {list.map((d) => (
                          <DealCard key={d.id} deal={d} />
                        ))}
                        {list.length === 0 && <p className="px-1 py-3 text-[11px] text-ink-3">{s.hint}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
