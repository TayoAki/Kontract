"use client";

import { ArrowLeft, Database, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import type { FeedHealthStatus } from "@/lib/types";
import { HEALTH_LABEL, HealthDot } from "./PermitMarket";
import { usePermits } from "./permits-state";
import { api, useApp } from "./state";
import { Badge, Button, Card, cx, Empty, Stat } from "./ui";

const CADENCE: Record<string, string> = { "several-daily": "Several times a day", daily: "Daily", weekly: "Weekly" };
const TONE: Record<FeedHealthStatus, "good" | "warn" | "bad" | "neutral"> = { ok: "good", stale: "warn", empty: "warn", failing: "bad", unknown: "neutral" };

/** The source register: every permit feed, what it covers and leaves out, and whether it's healthy. */
export function SourcesView() {
  const meta = usePermits((s) => s.meta);
  const loadMeta = usePermits((s) => s.loadMeta);
  const setView = useApp((s) => s.setView);
  const say = useApp((s) => s.say);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void loadMeta(true);
  }, [loadMeta]);

  const byStatus = useMemo(() => {
    const counts: Record<FeedHealthStatus, number> = { ok: 0, stale: 0, empty: 0, failing: 0, unknown: 0 };
    for (const f of [...(meta?.feeds ?? []), ...(meta?.bidFeeds ?? [])]) counts[f.health.status] += 1;
    return counts;
  }, [meta]);

  const lastCheck = useMemo(
    () => (meta?.feeds ?? []).map((f) => f.health.checkedAt).filter(Boolean).sort().at(-1),
    [meta],
  );

  async function checkNow() {
    setChecking(true);
    try {
      await api("/api/permits/check", { method: "POST" });
      await loadMeta(true);
      say("Checked every feed");
    } catch (err) {
      say(`Check failed: ${(err as Error).message}`);
    } finally {
      setChecking(false);
    }
  }

  if (!meta) return <div className="grid flex-1 place-items-center text-sm text-ink-3">Loading the source register…</div>;

  return (
    <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setView("permits")} aria-label="Back to permit leads">
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-ink">Data sources</h1>
              <p className="text-[13px] text-ink-2">Every permit and bid feed we collect, what it leaves out, and whether it&apos;s healthy right now.</p>
            </div>
          </div>
          <Button onClick={() => void checkNow()} busy={checking}>
            <RefreshCw className="size-4" /> Check all now
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Feeds" value={meta.feeds.length + meta.bidFeeds.length} hint={`${meta.feeds.length} permit, ${meta.bidFeeds.length} bid`} />
          <Stat label="Healthy" value={byStatus.ok} tone="good" />
          <Stat label="Need a look" value={byStatus.stale + byStatus.empty + byStatus.failing} tone={byStatus.failing ? "bad" : undefined} hint={byStatus.failing ? `${byStatus.failing} failing` : undefined} />
          <Stat label="Last check" value={lastCheck ? formatDate(lastCheck, { month: "short", day: "numeric", year: undefined, hour: "numeric", minute: "2-digit" }) : "—"} hint="Every 6 hours" />
        </div>

        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold text-ink-2">State and local bids</h2>
          <Card className="p-3">
            <ul className="divide-y divide-line">
              {meta.bidFeeds.map((f) => (
                <li key={f.id} className="grid gap-2 py-2.5 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <HealthDot status={f.health.status} />
                      <span className="text-[13px] text-ink">{f.name}</span>
                      <a href={f.datasetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-mono text-[11px] text-ink-3 hover:text-accent">
                        {f.dataset} <ExternalLink className="size-3" />
                      </a>
                    </div>
                    <div className="text-xs text-ink-2">{f.health.detail}</div>
                    {f.gaps.length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-3">
                        {f.gaps.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start gap-1 sm:flex-col sm:items-end">
                    <Badge tone={TONE[f.health.status]}>{HEALTH_LABEL[f.health.status]}</Badge>
                    <Badge>
                      {f.state} · {f.level === "state" ? "State" : "Local"}
                    </Badge>
                    <span className="text-[11px] text-ink-3">Verified {formatDate(`${f.lastVerified}T12:00:00`)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <h2 className="pt-2 text-[15px] font-semibold text-ink">Building permits</h2>
        {meta.states.map((st) => {
          const markets = meta.markets.filter((m) => m.state === st.code);
          return (
            <section key={st.code} className="space-y-2">
              <h2 className="text-[13px] font-semibold text-ink-2">{st.name}</h2>
              {markets.map((m) => (
                <Card key={m.id} className="p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-[14px] font-medium text-ink">{m.name}</div>
                    <span className="text-xs text-ink-3">
                      {m.feeds.length} feed{m.feeds.length === 1 ? "" : "s"} · {m.kind}
                    </span>
                  </div>
                  <ul className="mt-2 divide-y divide-line">
                    {m.feeds.map((id) => {
                      const f = meta.feeds.find((x) => x.id === id);
                      if (!f) return null;
                      return (
                        <li key={f.id} className="grid gap-2 py-2.5 sm:grid-cols-[1fr_auto]">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <HealthDot status={f.health.status} />
                              <span className="text-[13px] text-ink">{f.name}</span>
                              <a href={f.datasetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-mono text-[11px] text-ink-3 hover:text-accent">
                                {f.dataset} <ExternalLink className="size-3" />
                              </a>
                            </div>
                            <div className="text-xs text-ink-2">{f.health.detail}</div>
                            {f.gaps.length > 0 && (
                              <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-3">
                                {f.gaps.map((g) => (
                                  <li key={g}>{g}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="flex flex-wrap items-start gap-1 sm:flex-col sm:items-end">
                            <Badge tone={TONE[f.health.status]}>{HEALTH_LABEL[f.health.status]}</Badge>
                            <Badge>{CADENCE[f.cadence]}</Badge>
                            <span className={cx("text-[11px] text-ink-3")}>Verified {formatDate(`${f.lastVerified}T12:00:00`)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </section>
          );
        })}
        {meta.feeds.length === 0 && <Empty icon={<Database className="size-8" />} title="No feeds" />}
      </div>
    </div>
  );
}
