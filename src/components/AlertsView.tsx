"use client";

import { Bell } from "lucide-react";
import { useMemo } from "react";
import { OPEN_STAGES, stageLabel } from "@/lib/deal";
import { daysUntil, formatDate } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { useApp } from "./state";
import { Avatar, Badge, Button, dueText, dueTone, Empty } from "./ui";

function Row({ deal }: { deal: Deal }) {
  const open = useApp((s) => s.open);
  const days = daysUntil(deal.opportunity.responseDeadline);
  const noQuote = !deal.subs.some((s) => s.quote);
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <Avatar name={deal.opportunity.agency || "?"} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">{deal.opportunity.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          <Badge tone="accent">{stageLabel(deal.stage)}</Badge>
          {noQuote && days != null && days <= 7 && <Badge tone="warn">No sub quote yet</Badge>}
          {!deal.proposal && days != null && days <= 3 && <Badge tone="warn">No proposal draft</Badge>}
          <span>Due {formatDate(deal.opportunity.responseDeadline)}</span>
        </div>
      </div>
      <Badge tone={dueTone(days)}>{dueText(days)}</Badge>
      <Button size="sm" onClick={() => open(deal.id, noQuote ? "subs" : "proposal")}>
        Open
      </Button>
    </li>
  );
}

export function AlertsView() {
  const dealMap = useApp((s) => s.deals);
  const deals = useMemo(() => Object.values(dealMap).filter((d) => OPEN_STAGES.includes(d.stage)), [dealMap]);
  const groups: [string, Deal[]][] = [
    ["Deadline passed", []],
    ["Due in the next 3 days", []],
    ["Due this week", []],
    ["Later", []],
  ];
  for (const d of [...deals].sort((a, b) => (a.opportunity.responseDeadline ?? "9").localeCompare(b.opportunity.responseDeadline ?? "9"))) {
    const days = daysUntil(d.opportunity.responseDeadline);
    const i = days == null ? 3 : days < 0 ? 0 : days <= 3 ? 1 : days <= 7 ? 2 : 3;
    groups[i]![1].push(d);
  }

  return (
    <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <header>
          <h1 className="text-2xl font-semibold text-ink">Deadlines</h1>
          <p className="mt-1 text-[13px] text-ink-2">Open bids by response date. Get your sub&apos;s quote early, because they fall through the cracks.</p>
        </header>
        {deals.length === 0 ? (
          <Empty icon={<Bell className="size-8" />} title="No open bids">
            Track an opportunity and its deadline shows up here.
          </Empty>
        ) : (
          groups
            .filter(([, list]) => list.length > 0)
            .map(([title, list]) => (
              <section key={title}>
                <h2 className="mb-2 text-[13px] font-medium text-ink">{title}</h2>
                <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
                  {list.map((d) => (
                    <Row key={d.id} deal={d} />
                  ))}
                </ul>
              </section>
            ))
        )}
      </div>
    </div>
  );
}
