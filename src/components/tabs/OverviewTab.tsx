"use client";

import { ArrowRight, CalendarClock, ExternalLink, FileDown, Mail, MapPin, Phone, RefreshCw, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { isSmallBusinessSetAside } from "@/lib/fit-score";
import { daysUntil, formatDate, placeLabel } from "@/lib/format";
import { rulesBreakdown } from "@/lib/rules";
import type { Breakdown, Deal } from "@/lib/types";
import { useApp, useIsTracked } from "../state";
import { Avatar, Badge, Button, Card, cx, dueText, dueTone, ErrorNote, Note, Section } from "../ui";

export function useExplain(deal: Deal) {
  const status = useApp((s) => s.status);
  const setBreakdown = useApp((s) => s.setBreakdown);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function explain(refresh = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunity: deal.opportunity, refresh }),
      });
      const body = (await res.json()) as { breakdown?: Breakdown; description?: string | null; error?: string };
      if (!res.ok || !body.breakdown) throw new Error(body.error || "Couldn't get a breakdown");
      setBreakdown(deal.id, body.breakdown, body.description);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { explain, busy, error, claude: Boolean(status?.claude) };
}

function FactCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: React.ReactNode; tone?: string }) {
  return (
    <Card className="p-3.5">
      <div className={cx("mb-3 grid size-9 place-items-center rounded-lg", tone ?? "bg-accent-soft text-accent-ink")}>{icon}</div>
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-3">{sub}</div>}
    </Card>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className={cx("mb-1.5 text-xs font-semibold tracking-wide uppercase", tone === "warn" ? "text-warn" : "text-ink-3")}>{title}</div>
      <ul className="space-y-1 text-[13px] text-ink-2">
        {items.map((it) => (
          <li key={it} className="flex gap-2">
            <span className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", tone === "warn" ? "bg-warn" : "bg-line-strong")} aria-hidden />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DescriptionBlock({ deal }: { deal: Deal }) {
  const o = deal.opportunity;
  const updateDeal = useApp((s) => s.updateDeal);
  const status = useApp((s) => s.status);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!o.descriptionUrl) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/opportunities/description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: o.descriptionUrl }),
      });
      const body = (await res.json()) as { description?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Couldn't load the description");
      updateDeal(deal.id, (d) => ({ ...d, opportunity: { ...d.opportunity, description: body.description || "(SAM.gov has no description for this notice. Check the attachments.)" } }), { track: false });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!o.description) {
    return (
      <div className="space-y-2">
        {error && <ErrorNote>{error}</ErrorNote>}
        {o.descriptionUrl && status?.sam ? (
          <Button onClick={load} busy={busy}>
            Load the full description
          </Button>
        ) : (
          <p className="text-[13px] text-ink-2">No description loaded. Open the notice on SAM.gov to read it.</p>
        )}
      </div>
    );
  }
  const long = o.description.length > 900;
  return (
    <div>
      <div className={cx("relative text-[13px] leading-relaxed whitespace-pre-line text-ink-2", !expanded && long && "max-h-56 overflow-hidden")}>
        {o.description}
        {!expanded && long && <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />}
      </div>
      {long && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-[13px] font-medium text-accent hover:underline">
          {expanded ? "Show less" : "Show the whole notice"}
        </button>
      )}
    </div>
  );
}

export function OverviewTab({ deal }: { deal: Deal }) {
  const o = deal.opportunity;
  const tracked = useIsTracked(deal.id);
  const track = useApp((s) => s.track);
  const untrack = useApp((s) => s.untrack);
  const setTab = useApp((s) => s.setTab);
  const { explain, busy, error, claude } = useExplain(deal);
  const b = deal.breakdown ?? rulesBreakdown(o);
  const days = daysUntil(o.responseDeadline);
  const poc = o.contacts[0];
  const sb = isSmallBusinessSetAside(o);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {o.isSample && <Badge tone="warn">Sample notice</Badge>}
            {o.type && <Badge tone="accent">{o.type}</Badge>}
            {o.setAside && <Badge tone={sb ? "good" : "neutral"}>{o.setAside.replace(/\s*\(FAR 19\.5\)/, "")}</Badge>}
          </div>
          <div className="flex gap-2">
            <Button variant={tracked ? "secondary" : "primary"} size="sm" onClick={() => (tracked ? void untrack(deal.id) : track(deal.id))}>
              <Star className={cx("size-3.5", tracked && "fill-current text-warn")} /> {tracked ? "Tracking" : "Track bid"}
            </Button>
            <a
              href={o.samUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-line-strong bg-panel px-2.5 text-xs font-medium text-ink hover:bg-panel-2"
            >
              SAM.gov <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>
        <h1 className="text-xl leading-tight font-semibold text-balance text-ink sm:text-2xl">{o.title}</h1>
        <p className="text-[13px] text-ink-2">
          {[o.agency, o.office].filter(Boolean).join(" › ")}
          {o.solicitationNumber && <span className="text-ink-3"> · {o.solicitationNumber}</span>}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <FactCard
          icon={<CalendarClock className="size-5" />}
          label="Respond by"
          value={formatDate(o.responseDeadline)}
          sub={<Badge tone={dueTone(days)}>{dueText(days)}</Badge>}
          tone={dueTone(days) === "bad" ? "bg-bad-soft text-bad" : dueTone(days) === "warn" ? "bg-warn-soft text-warn" : undefined}
        />
        <FactCard
          icon={<MapPin className="size-5" />}
          label="Where the work is"
          value={placeLabel(o.placeOfPerformance)}
          sub="Your subcontractor should be local to here"
        />
        <FactCard
          icon={<ShieldCheck className="size-5" />}
          label="Who can bid"
          value={sb ? "Small businesses" : o.setAside ? o.setAside : "Anyone"}
          sub={[o.naicsCode && `NAICS ${o.naicsCode}`, o.pscCode && `PSC ${o.pscCode}`].filter(Boolean).join(" · ") || undefined}
        />
      </div>

      <Section
        title="In plain English"
        subtitle={b.source === "claude" ? "Claude's read of the notice" : "Quick read from the title and description"}
        actions={
          claude ? (
            <Button size="sm" variant={b.source === "claude" ? "ghost" : "primary"} busy={busy} onClick={() => void explain(b.source === "claude")}>
              {b.source === "claude" ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
              {b.source === "claude" ? "Redo" : "Explain with Claude"}
            </Button>
          ) : undefined
        }
      >
        {error && <ErrorNote>{error}</ErrorNote>}
        <Card className="space-y-5 p-4">
          <p className="text-[15px] leading-relaxed text-ink">{b.plainEnglish}</p>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {[
              ["Who does the work", b.whoDoesTheWork],
              ["How it's priced", b.pricingStructure],
              ["How long", b.contractLength],
              ["Difficulty", b.difficulty === "easy" ? "Good first bid" : b.difficulty === "moderate" ? "Doable with prep" : "Hard for a first bid"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-ink-3">{k}</dt>
                <dd className="text-[13px] font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-5 sm:grid-cols-2">
            <List title="Requirements" items={b.keyRequirements} />
            <List title="Watch out for" items={b.redFlags} tone="warn" />
          </div>
          <List title="Ask your subcontractor" items={b.questionsForSubs} />
        </Card>
        {!claude && <Note>Add ANTHROPIC_API_KEY to get Claude&apos;s full read of each notice, including what&apos;s buried in the description.</Note>}
      </Section>

      <Section title="What the notice says" subtitle={`${o.attachments.length} attachment${o.attachments.length === 1 ? "" : "s"}`}>
        <DescriptionBlock deal={deal} />
        {o.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {o.attachments.map((a, i) => {
              const isUrl = /^https?:\/\//.test(a);
              const name = isUrl ? `Attachment ${i + 1}` : a;
              return (
                <li key={`${a}-${i}`}>
                  {isUrl ? (
                    <a href={a} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink-2 hover:text-ink">
                      <FileDown className="size-3.5" /> {name}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink-2">
                      <FileDown className="size-3.5" /> {name}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <Avatar name={poc?.name || o.office || o.agency} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-3">Point of contact</div>
          <div className="text-sm font-semibold text-ink">
            {poc ? poc.name : "Not listed"}
            {poc?.title && <span className="font-normal text-ink-2"> · {poc.title}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
            {poc?.email && (
              <a href={`mailto:${poc.email}`} className="inline-flex items-center gap-1 hover:text-accent">
                <Mail className="size-3.5" /> {poc.email}
              </a>
            )}
            {poc?.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> {poc.phone}
              </span>
            )}
          </div>
        </div>
        <Button variant="primary" onClick={() => setTab("subs")}>
          Find a subcontractor <ArrowRight className="size-4" />
        </Button>
      </Card>
    </div>
  );
}
