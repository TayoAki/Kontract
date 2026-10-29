"use client";

import { Bell, ClipboardList, FileSignature, FileText, Home, Search, Settings, Sparkles, Users } from "lucide-react";
import type { ComponentType } from "react";
import { OPEN_STAGES } from "@/lib/deal";
import { daysUntil } from "@/lib/format";
import { useApp, type View } from "./state";
import { Avatar, cx } from "./ui";

/** `short` shows under the icon; `label` is the full name for screen readers and tooltips. */
type Item = { view: View; label: string; short: string; icon: ComponentType<{ className?: string }> };

const SUB_ITEMS: Item[] = [
  { view: "leads", label: "My leads", short: "Leads", icon: ClipboardList },
  { view: "quotes", label: "Quote requests", short: "Quotes", icon: FileSignature },
  { view: "prospects", label: "Find customers", short: "Customers", icon: Sparkles },
  { view: "settings", label: "Settings", short: "Settings", icon: Settings },
];

const ITEMS: Item[] = [
  { view: "home", label: "This week", short: "Home", icon: Home },
  { view: "search", label: "Find opportunities", short: "Find", icon: Search },
  { view: "alerts", label: "Deadlines", short: "Due", icon: Bell },
  { view: "bids", label: "My bids", short: "Bids", icon: FileText },
  { view: "permits", label: "Permit leads", short: "Permits", icon: ClipboardList },
  { view: "crm", label: "Sub bench", short: "Bench", icon: Users },
  { view: "settings", label: "Settings", short: "Settings", icon: Settings },
];

function useNav() {
  const view = useApp((s) => s.view);
  const isSub = useApp((s) => s.account?.role === "sub");
  const setView = useApp((s) => s.setView);
  const dueSoon = useApp(
    (s) =>
      Object.values(s.deals).filter((d) => {
        const days = daysUntil(d.opportunity.responseDeadline);
        return OPEN_STAGES.includes(d.stage) && days != null && days >= 0 && days <= 7;
      }).length,
  );
  return { view, setView, dueSoon, items: isSub ? SUB_ITEMS : ITEMS };
}

function DueCount({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span className={cx("absolute grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[11px] leading-4 font-semibold text-white", className)} aria-label={`${n} due this week`}>
      {n}
    </span>
  );
}

/** Desktop and tablet: a rail down the left. */
export function LeftRail() {
  const { view, setView, dueSoon, items } = useNav();
  const company = useApp((s) => s.profile?.companyName || s.user?.name || s.user?.email);

  return (
    <nav aria-label="Main" className="hidden w-16 shrink-0 flex-col items-center gap-0.5 border-r border-line bg-panel py-3 md:flex">
      <div className="mb-3 grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-on-accent" aria-label="Kontract">
        K
      </div>
      {items.map(({ view: v, label, short, icon: Icon }) => {
        const active = view === v;
        return (
          <button
            key={v}
            type="button"
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            onClick={() => setView(v)}
            className={cx(
              "relative flex h-12 w-14 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
              active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-panel-2 hover:text-ink",
            )}
          >
            {active && <span className="absolute top-2 bottom-2 -left-2 w-[3px] rounded-r bg-accent" aria-hidden />}
            <Icon className="size-5" />
            <span className="text-[11px] leading-none font-medium">{short}</span>
            {v === "alerts" && <DueCount n={dueSoon} className="top-0.5 right-1.5" />}
          </button>
        );
      })}
      <button type="button" title="Company profile" aria-label="Company profile" onClick={() => setView("settings")} className="mt-auto rounded-full">
        <Avatar name={company || "You"} size={34} />
      </button>
    </nav>
  );
}

/** Phone: the same places as tabs along the bottom, within thumb reach. */
export function BottomNav() {
  const { view, setView, dueSoon, items } = useNav();
  return (
    <nav aria-label="Main" className="flex shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ view: v, label, short, icon: Icon }) => {
        const active = view === v;
        return (
          <button
            key={v}
            type="button"
            aria-label={label}
            aria-current={active ? "page" : undefined}
            onClick={() => setView(v)}
            className={cx("relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1", active ? "text-accent-ink" : "text-ink-2")}
          >
            {active && <span className="absolute inset-x-3 top-0 h-[3px] rounded-b bg-accent" aria-hidden />}
            <Icon className="size-5" />
            <span className="max-w-full truncate px-0.5 text-[11px] leading-none font-medium">{short}</span>
            {v === "alerts" && <DueCount n={dueSoon} className="top-1.5 left-1/2 ml-1" />}
          </button>
        );
      })}
    </nav>
  );
}
