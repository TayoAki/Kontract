"use client";

import { BarChart3, FileSignature, Info, Users } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { formatDate } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { RightPanel } from "./RightPanel";
import { useApp, type Tab } from "./state";
import { OverviewTab } from "./tabs/OverviewTab";
import { PricingTab } from "./tabs/PricingTab";
import { ProposalTab } from "./tabs/ProposalTab";
import { SubsTab } from "./tabs/SubsTab";
import { cx } from "./ui";

const TABS: { id: Tab; label: string; short: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", short: "Overview", icon: Info },
  { id: "pricing", label: "Past pricing", short: "Pricing", icon: BarChart3 },
  { id: "subs", label: "Subcontractors", short: "Subs", icon: Users },
  { id: "proposal", label: "Proposal", short: "Proposal", icon: FileSignature },
];

export function Detail({ deal, listButton }: { deal: Deal; listButton?: ReactNode }) {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const counts: Partial<Record<Tab, string>> = {
    subs: deal.subs.length ? String(deal.subs.length) : undefined,
    proposal: deal.proposal ? "✓" : undefined,
  };

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
          {listButton}
          <div role="tablist" aria-label="Opportunity" className="flex min-w-0 flex-1 overflow-hidden rounded-lg border border-line">
            {TABS.map(({ id, label, short, icon: Icon }, i) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cx(
                  "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-[13px] font-medium transition-colors",
                  i > 0 && "border-l border-line",
                  tab === id && "max-sm:flex-[2.4]",
                  tab === id ? "bg-panel-2 text-ink shadow-[inset_0_-2px_0_var(--accent)]" : "text-ink-2 hover:bg-panel-2/60 hover:text-ink",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate max-md:hidden">{label}</span>
                {/* On phones only the active tab shows its name; the rest are icons. */}
                <span className={cx("truncate md:hidden", tab !== id && "max-sm:sr-only")}>{short}</span>
                {counts[id] && <span className="rounded bg-accent-soft px-1 text-[11px] leading-4 text-accent-ink">{counts[id]}</span>}
              </button>
            ))}
          </div>
        </div>
        {/* Overview carries the title itself; the other tabs keep it in view so you know which bid you're pricing. */}
        {tab !== "overview" && (
          <div className="flex min-w-0 items-baseline gap-2 border-b border-line bg-panel px-4 py-1.5 text-[13px] sm:px-6">
            <span className="min-w-0 truncate font-medium text-ink" title={deal.opportunity.title}>
              {deal.opportunity.title}
            </span>
            {deal.opportunity.responseDeadline && <span className="shrink-0 text-ink-2">Due {formatDate(deal.opportunity.responseDeadline)}</span>}
          </div>
        )}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
            {tab === "overview" && <OverviewTab deal={deal} />}
            {tab === "pricing" && <PricingTab deal={deal} />}
            {tab === "subs" && <SubsTab deal={deal} />}
            {tab === "proposal" && <ProposalTab deal={deal} />}
            <div className="mt-10 border-t border-line pt-6 xl:hidden">
              <RightPanel deal={deal} />
            </div>
          </div>
        </div>
      </div>
      <aside aria-label="Bid snapshot" className="scroll-thin hidden w-[320px] shrink-0 overflow-y-auto border-l border-line bg-panel xl:block">
        <div className="p-4">
          <RightPanel deal={deal} />
        </div>
      </aside>
    </div>
  );
}
