"use client";

import { FileText, PanelLeft, Search as SearchIcon } from "lucide-react";
import { Detail } from "./Detail";
import { Sidebar } from "./Sidebar";
import { useApp, useIsTracked, useSelectedDeal } from "./state";
import { Button, cx, Empty } from "./ui";

export function Workspace({ mode }: { mode: "search" | "bids" }) {
  const deal = useSelectedDeal();
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const setSidebarOpen = useApp((s) => s.setSidebarOpen);
  const setView = useApp((s) => s.setView);
  const hasDeals = useApp((s) => Object.keys(s.deals).length > 0);
  const tracked = useIsTracked(deal?.id);
  const showDetail = deal && (mode === "search" || tracked);

  return (
    <div className="relative flex min-w-0 flex-1 overflow-clip">
      {/* Sidebar: fixed column on desktop, drawer on smaller screens */}
      <div
        className={cx(
          "z-30 w-[300px] shrink-0 border-r border-line bg-panel",
          "max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-xl max-lg:transition-transform",
          showDetail ? (sidebarOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full") : "max-lg:static max-lg:w-full max-lg:shadow-none",
        )}
      >
        <Sidebar mode={mode} />
      </div>
      {sidebarOpen && showDetail && (
        <button type="button" aria-label="Close list" className="absolute inset-0 z-20 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={cx("min-w-0 flex-1", !showDetail && "max-lg:hidden")}>
        {showDetail ? (
          <Detail
            deal={deal}
            listButton={
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Show list">
                <PanelLeft className="size-4" /> List
              </Button>
            }
          />
        ) : (
          <div className="grid h-full place-items-center p-6">
            {mode === "bids" && !hasDeals ? (
              <Empty
                icon={<FileText className="size-8" />}
                title="No bids tracked yet"
                action={
                  <Button variant="primary" onClick={() => setView("search")}>
                    <SearchIcon className="size-4" /> Find opportunities
                  </Button>
                }
              >
                Open an opportunity and press Track, or just start pricing it. It shows up here automatically.
              </Empty>
            ) : (
              <Empty icon={<SearchIcon className="size-8" />} title="Pick an opportunity">
                Choose one from the list to see what they&apos;re asking for, what it paid before, and who can do the work.
              </Empty>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
