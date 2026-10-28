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
  const dueThisWeek = useApp(
    (s) =>
      Object.values(s.deals).filter((d) => {
        const days = daysUntil(d.opportunity.responseDeadline);
        return OPEN_STAGES.includes(d.stage) && days != null && days >= 0 && days <= 7;
      }).length,
  );
  const focus = todaysFocus();
  const account = useApp((s) => s.account);

  if (account?.role === "sub") {
    const plans = status?.subPlans;
    return (
      <footer className="flex h-7 shrink-0 items-center gap-4 overflow-hidden border-t border-line bg-panel px-3 text-[11px] whitespace-nowrap text-ink-3">
        <Dot on label={account.plan === "daily" ? "Daily plan: every lead each morning" : `Free plan: ${plans?.freePerWeek ?? 10} leads a week`} title="Your lead plan" />
        <Dot on={Boolean(plans?.email && account.digest)} label={plans?.email ? (account.digest ? "Email digests on" : "Email digests off") : "Email digests not set up"} title="Lead emails" />
        <Dot on={Boolean(status?.claude)} label={status?.claude ? "AI customer finder on" : "AI customer finder needs a Claude key"} title="Find customers" />
      </footer>
    );
  }

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-line bg-panel px-3 text-[11px] text-ink-3">
      <div className="flex min-w-0 items-center gap-4 overflow-hidden whitespace-nowrap">
        {status ? (
          <>
            <Dot
              on={Boolean(status.samData?.count)}
              label={
                status.samData?.count
                  ? `SAM.gov · ${status.samData.count.toLocaleString()} notices${status.samData.refreshing ? " (updating)" : ""}`
                  : status.samData?.refreshing
                    ? "SAM.gov downloading…"
                    : "SAM.gov sample data"
              }
              title="Contract opportunities from SAM.gov's daily file"
            />
            <Dot on label="USAspending live" title="Past award pricing (no key needed)" />
            <Dot on={status.claude} label={status.claude ? `Claude · ${status.model}` : "Claude off (templates)"} title="AI breakdowns and drafts" />
            <Dot
              on={Boolean(status.places)}
              label={status.places === "google" ? "Google Places" : status.places === "apify" ? "Apify Maps" : "Sub search sample"}
              title="Subcontractor search"
            />
          </>
        ) : (
          <span>Connecting…</span>
        )}
      </div>
      <div className="hidden items-center gap-3 whitespace-nowrap sm:flex">
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
