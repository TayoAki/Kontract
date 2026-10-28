"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { AlertsView } from "./AlertsView";
import { BottomBar } from "./BottomBar";
import { HomeView } from "./HomeView";
import { LeftRail } from "./LeftRail";
import { SettingsView } from "./SettingsView";
import { useApp } from "./state";
import { Workspace } from "./Workspace";

export function App() {
  const view = useApp((s) => s.view);
  const init = useApp((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-dvh flex-col overflow-clip bg-bg text-ink">
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <main className="flex min-w-0 flex-1 overflow-clip">
          {view === "home" && <HomeView />}
          {(view === "search" || view === "bids") && <Workspace mode={view} />}
          {view === "alerts" && <AlertsView />}
          {view === "settings" && <SettingsView />}
        </main>
      </div>
      <BottomBar />
      <Toast />
    </div>
  );
}

function Toast() {
  const toast = useApp((s) => s.toast);
  const say = useApp((s) => s.say);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => say(null), 3500);
    return () => clearTimeout(t);
  }, [toast, say]);
  if (!toast) return null;
  return (
    <div role="status" className="fixed bottom-10 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-sm text-bg shadow-lg">
      {toast}
      <button type="button" onClick={() => say(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
        <X className="size-4" />
      </button>
    </div>
  );
}
