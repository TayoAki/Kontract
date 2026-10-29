"use client";

import { OPEN_STAGES } from "@/lib/deal";
import { daysUntil } from "@/lib/format";
import { useApp } from "./state";
import { cx } from "./ui";
import { todaysFocus } from "./week";

function Dot({ on, label, title }: { on: boolean; label: string; title: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className={cx("size-1.5 rounded-full", on ? "bg-good" : "bg-ink-3")} aria-hidden />
      {label}
    </span>
  );
}

export function BottomBar() {
  const status = useApp((s) => s.status);
  const setView = useApp((s) => s.setView);
  const dueThisWeek = useApp(
    (s) =>
      Object.values(s.deals).filter((d) => {
        const days = daysUntil(d.opportunity.responseDeadline);
        return OPEN_STAGES.includes(d.stage) && days != null && days >= 0 && days <= 7;
      }).length,
  );
  const focus = todaysFocus();
  const account = useApp((s) => s.account);
  // The bar is a desktop status line; on a phone the bottom tabs take its place.
  const bar = "hidden h-7 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11px] whitespace-nowrap text-ink-3 md:flex";

  if (account?.role === "sub") {
    const plans = status?.subPlans;
    return (
      <footer className={cx(bar, "overflow-hidden")}>
        <Dot on label={account.plan === "daily" ? "Daily plan: every lead each morning" : `Free plan: ${plans?.freePerWeek ?? 10} leads a week`} title="Your lead plan" />
        <Dot on={Boolean(plans?.email && account.digest)} label={plans?.email ? (account.digest ? "Lead emails on" : "Lead emails off") : "Leads show here in the app"} title="Lead emails" />
      </footer>
    );
  }

  const off = status ? [!status.claude && "AI drafts", !status.places && "sub search", !status.firecrawl && "website reader"].filter(Boolean) : [];
  return (
    <footer className={cx(bar, "justify-between")}>
      <div className="flex min-w-0 items-center gap-4 overflow-hidden">
        {status ? (
          <>
            <Dot
              on={Boolean(status.samData?.count)}
              label={
                status.samData?.count
                  ? `${status.samData.count.toLocaleString()} federal notices${status.samData.refreshing ? " (updating)" : ", checked hourly"}`
                  : status.samData?.refreshing
                    ? "Downloading today's federal notices…"
                    : "Sample notices"
              }
              title="Open notices from SAM.gov's daily file"
            />
            {off.length > 0 && (
              <button type="button" onClick={() => setView("settings")} className="rounded hover:text-ink-2 hover:underline" title="See what's connected">
                Off on this site: {off.join(", ")}
              </button>
            )}
          </>
        ) : (
          <span>Connecting…</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span>
          {focus.day}: {focus.task.toLowerCase()}
        </span>
        {dueThisWeek > 0 && (
          <span className="font-medium text-warn">
            {dueThisWeek} bid{dueThisWeek === 1 ? "" : "s"} due this week
          </span>
        )}
      </div>
    </footer>
  );
}
