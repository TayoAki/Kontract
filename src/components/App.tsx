"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { authClient, SIGNED_OUT_EVENT } from "@/lib/auth-client";
import { AuthScreen, type JoinParams } from "./AuthScreen";
import { AlertsView } from "./AlertsView";
import { BottomBar } from "./BottomBar";
import { CrmView } from "./CrmView";
import { HomeView } from "./HomeView";
import { BottomNav, LeftRail } from "./LeftRail";
import { takePendingAccount } from "./pending-account";
import { PermitsView } from "./PermitsView";
import { SettingsView } from "./SettingsView";
import { SourcesView } from "./SourcesView";
import { api, useApp } from "./state";
import { SubLeadsView, SubQuotesView, SubSettingsView } from "./SubViews";
import { ProspectsView } from "./ProspectsView";
import { Workspace } from "./Workspace";

export function App({ join }: { join?: JoinParams } = {}) {
  const { data: session, isPending, refetch } = authClient.useSession();

  // Any API call that comes back 401 means the session ended.
  useEffect(() => {
    const onSignedOut = () => void refetch();
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [refetch]);

  if (isPending && !session) {
    return (
      <div className="grid h-dvh place-items-center bg-bg">
        <div className="grid size-10 animate-pulse place-items-center rounded-lg bg-accent text-base font-bold text-on-accent">K</div>
      </div>
    );
  }
  if (!session) return <AuthScreen onSignedIn={() => void refetch()} join={join} />;
  // Keyed by user so nothing from a previous account survives a switch.
  return <SignedInApp key={session.user.id} user={{ id: session.user.id, name: session.user.name, email: session.user.email }} />;
}

function SignedInApp({ user }: { user: { id: string; name: string; email: string } }) {
  const view = useApp((s) => s.view);
  const init = useApp((s) => s.init);
  const role = useApp((s) => s.account?.role);

  // Runs once per account (this component is keyed by user id). Saves what
  // was picked at sign-up (role, trade, area, invite) before loading.
  useEffect(() => {
    useApp.getState().reset(user);
    const pending = takePendingAccount();
    void (pending ? api("/api/account", { method: "PUT", body: JSON.stringify(pending) }).catch(() => undefined) : Promise.resolve()).then(() => init());
  }, [init]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick up quotes subs send through their links: every minute, and when you come back to the tab.
  useEffect(() => {
    const sync = () => void useApp.getState().syncQuotes();
    const t = setInterval(sync, 60_000);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-clip bg-bg text-ink">
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <main className="flex min-w-0 flex-1 overflow-clip">
          {view === "home" && <HomeView />}
          {(view === "search" || view === "bids") && <Workspace mode={view} />}
          {view === "permits" && <PermitsView />}
          {view === "crm" && <CrmView />}
          {view === "sources" && <SourcesView />}
          {view === "leads" && <SubLeadsView />}
          {view === "quotes" && <SubQuotesView />}
          {view === "prospects" && <ProspectsView />}
          {view === "alerts" && <AlertsView />}
          {view === "settings" && (role === "sub" ? <SubSettingsView /> : <SettingsView />)}
        </main>
      </div>
      <BottomBar />
      <BottomNav />
      <Toast />
    </div>
  );
}

function Toast() {
  const toast = useApp((s) => s.toast);
  const action = useApp((s) => s.toastAction);
  const say = useApp((s) => s.say);
  useEffect(() => {
    if (!toast) return;
    // Long enough to read; longer when there's something to do (Undo).
    const t = setTimeout(() => say(null), action ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast, action, say]);
  if (!toast) return null;
  return (
    <div role="status" className="fixed bottom-20 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink shadow-lg md:bottom-10">
      <span className="min-w-0">{toast}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.run();
            say(null);
          }}
          className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs font-medium shadow-xs hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {action.label}
        </button>
      )}
      <button type="button" onClick={() => say(null)} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-panel-2 hover:text-ink">
        <X className="size-4" />
      </button>
    </div>
  );
}
