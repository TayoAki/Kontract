"use client";

import { Bell, ClipboardList, FileSignature, FileText, Home, Search, Settings, Sparkles, Users } from "lucide-react";
import type { ComponentType } from "react";
import { OPEN_STAGES } from "@/lib/deal";
import { daysUntil } from "@/lib/format";
import { useApp, type View } from "./state";
import { Avatar, cx } from "./ui";

type Item = { view: View; label: string; icon: ComponentType<{ className?: string }> };

const SUB_ITEMS: Item[] = [
  { view: "leads", label: "My leads", icon: ClipboardList },
  { view: "quotes", label: "Quote requests", icon: FileSignature },
  { view: "prospects", label: "Find customers", icon: Sparkles },
  { view: "settings", label: "Settings", icon: Settings },
];

const ITEMS: Item[] = [
  { view: "home", label: "This week", icon: Home },
  { view: "search", label: "Find opportunities", icon: Search },
  { view: "alerts", label: "Deadlines", icon: Bell },
  { view: "bids", label: "My bids", icon: FileText },
  { view: "permits", label: "Permit leads", icon: ClipboardList },
  { view: "crm", label: "Sub bench", icon: Users },
  { view: "settings", label: "Settings", icon: Settings },
];

export function LeftRail() {
  const view = useApp((s) => s.view);
  const isSub = useApp((s) => s.account?.role === "sub");
  const setView = useApp((s) => s.setView);
  const company = useApp((s) => s.profile?.companyName || s.user?.name || s.user?.email);
  const dueSoon = useApp(
    (s) =>
      Object.values(s.deals).filter((d) => {
        const days = daysUntil(d.opportunity.responseDeadline);
        return OPEN_STAGES.includes(d.stage) && days != null && days >= 0 && days <= 7;
      }).length,
  );

  return (
    <nav aria-label="Main" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-3">
      <div className="mb-3 grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-on-accent" aria-label="Kontract">
        K
      </div>
      {(isSub ? SUB_ITEMS : ITEMS).map(({ view: v, label, icon: Icon }) => {
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
              "relative grid size-10 place-items-center rounded-lg transition-colors",
              active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-panel-2 hover:text-ink",
            )}
          >
            {active && <span className="absolute top-2 bottom-2 -left-2 w-[3px] rounded-r bg-accent" aria-hidden />}
            <Icon className="size-5" />
            {v === "alerts" && dueSoon > 0 && (
              <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] leading-4 font-semibold text-white">
                {dueSoon}
              </span>
            )}
          </button>
        );
      })}
      <button type="button" title="Company profile" aria-label="Company profile" onClick={() => setView("settings")} className="mt-auto rounded-full">
        <Avatar name={company || "You"} size={34} />
      </button>
    </nav>
  );
}
