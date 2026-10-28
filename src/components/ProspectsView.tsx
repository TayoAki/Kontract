"use client";

import { Building2, Check, Copy, ExternalLink, Globe, Link2, Loader2, Mail, Search, Sparkles, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import { SIGNAL_KINDS } from "@/lib/prospect-rules";
import type { BusinessProfile, Prospect, ProspectRun, ProspectStatus, SignalKind } from "@/lib/types";
import { SIGNED_OUT_EVENT } from "@/lib/auth-client";
import { api, useApp } from "./state";
import { Badge, Button, Card, Chip, cx, Empty, ErrorNote, Input, Label, Note, Select } from "./ui";

const STATUS: { id: ProspectStatus; label: string }[] = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "replied", label: "Replied" },
  { id: "won", label: "Won" },
  { id: "dismissed", label: "Not a fit" },
];

const KIND_TONE: Record<SignalKind, "good" | "accent" | "neutral" | "warn"> = { funding: "good", hiring: "accent", linkedin: "accent", x: "neutral", community: "warn", news: "neutral" };
const kindLabel = (k: SignalKind) => SIGNAL_KINDS.find((s) => s.id === k)?.label ?? k;

type Progress = { kind: "step" | "search" | "fetch"; text: string };

function ProspectCard({ p, onStatus }: { p: Prospect; onStatus: (s: ProspectStatus) => void }) {
  const say = useApp((s) => s.say);
  const [open, setOpen] = useState(false);
  const email = p.people.find((x) => x.email)?.email;
  return (
    <Card className={cx("p-3.5", p.status === "dismissed" && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[14px] font-semibold text-ink">{p.company}</span>
            <Badge tone={KIND_TONE[p.kind]}>{kindLabel(p.kind)}</Badge>
            {p.sample && <Badge tone="warn">Sample</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
            {p.location && <span>{p.location}</span>}
            {p.signalDate && <span>{p.signalDate}</span>}
            {p.website && (
              <a href={p.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                <Globe className="size-3" /> Website
              </a>
            )}
          </div>
        </div>
        <Select value={p.status} onChange={(e) => onStatus(e.target.value as ProspectStatus)} aria-label="Status" className="h-8 w-auto text-xs">
          {STATUS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      <p className="mt-2 text-[13px] text-ink">
        {p.signal}{" "}
        <a href={p.signalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
          Source <ExternalLink className="size-3" />
        </a>
      </p>
      <p className="mt-1 text-[13px] text-ink-2">
        <span className="font-medium text-ink-2">Why they fit:</span> {p.whyFit}
      </p>
      {p.funding && (p.funding.amount || p.funding.round) && (
        <p className="mt-1 text-xs text-ink-2">
          Funding: {[p.funding.amount, p.funding.round, p.funding.date && `on ${p.funding.date}`].filter(Boolean).join(" · ")}
        </p>
      )}
      {p.hiring?.length ? <p className="mt-1 text-xs text-ink-2">Hiring: {p.hiring.join(", ")}</p> : null}
      {p.people.length > 0 && (
        <ul className="mt-2 space-y-1">
          {p.people.map((x) => (
            <li key={x.name} className="flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
              <Users className="size-3 text-ink-3" />
              <span className="font-medium text-ink">{x.name}</span>
              {x.title && <span>{x.title}</span>}
              {x.linkedin && (
                <a href={x.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-accent">
                  <Link2 className="size-3" /> LinkedIn
                </a>
              )}
              {x.email && (
                <a href={`mailto:${x.email}`} className="inline-flex items-center gap-0.5 hover:text-accent">
                  <Mail className="size-3" /> {x.email}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          <Mail className="size-3.5" /> {open ? "Hide email" : "First email"}
        </Button>
      </div>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-line bg-panel-2 p-3">
          <div className="text-[13px] font-medium text-ink">{p.outreach.subject}</div>
          <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{p.outreach.body}</pre>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              onClick={() =>
                void navigator.clipboard
                  .writeText(`Subject: ${p.outreach.subject}\n\n${p.outreach.body}`)
                  .then(() => say("Email copied"))
                  .catch(() => say("Couldn't copy"))
              }
            >
              <Copy className="size-3.5" /> Copy
            </Button>
            {email && (
              <a
                href={`mailto:${email}?subject=${encodeURIComponent(p.outreach.subject)}&body=${encodeURIComponent(p.outreach.body)}`}
                onClick={() => p.status === "new" && onStatus("contacted")}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line-strong bg-panel px-2.5 text-xs font-medium text-ink hover:bg-panel-2"
              >
                <Mail className="size-3.5" /> Open in email
              </a>
            )}
            <Button size="sm" variant="ghost" onClick={() => onStatus("contacted")} disabled={p.status !== "new"}>
              <Check className="size-3.5" /> Mark contacted
            </Button>
          </div>
          <p className="text-[11px] text-ink-3">Nothing is sent automatically. Read it, fix the [placeholders], and send it yourself.</p>
        </div>
      )}
    </Card>
  );
}

export function ProspectsView() {
  const account = useApp((s) => s.account);
  const claude = useApp((s) => s.status?.claude);
  const [website, setWebsite] = useState(account?.website ?? "");
  const [kinds, setKinds] = useState<SignalKind[]>(["funding", "hiring", "linkedin", "x", "community"]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [lastRun, setLastRun] = useState<ProspectRun | null>(null);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SignalKind | "all">("all");
  const [showDismissed, setShowDismissed] = useState(false);

  const load = useCallback(() => {
    api<{ prospects: Prospect[]; lastRun: ProspectRun | null; nextRunAt: string | null }>("/api/prospects")
      .then((r) => {
        setProspects(r.prospects);
        setLastRun(r.lastRun);
        setProfile(r.lastRun?.profile ?? null);
        setNextRunAt(r.nextRunAt);
      })
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (account?.website && !website) setWebsite(account.website);
  }, [account?.website]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setProgress([]);
    try {
      const res = await fetch("/api/prospects/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website, kinds }) });
      if (res.status === 401) window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const raw = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!raw) continue;
          const ev = JSON.parse(raw) as { type: string; text?: string; query?: string; url?: string; profile?: BusinessProfile; prospects?: Prospect[]; message?: string; run?: ProspectRun };
          if (ev.type === "step") setProgress((p) => [...p, { kind: "step", text: ev.text! }]);
          else if (ev.type === "search") setProgress((p) => [...p, { kind: "search", text: ev.query! }]);
          else if (ev.type === "fetch") setProgress((p) => [...p, { kind: "fetch", text: ev.url! }]);
          else if (ev.type === "profile") setProfile(ev.profile!);
          else if (ev.type === "prospects") setProspects((cur) => [...ev.prospects!, ...cur]);
          else if (ev.type === "error") setError(ev.message!);
          else if (ev.type === "done") setLastRun(ev.run!);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
      load();
    }
  }

  async function setStatus(p: Prospect, status: ProspectStatus) {
    setProspects((cur) => cur.map((x) => (x.id === p.id ? { ...x, status } : x)));
    await api("/api/prospects", { method: "PUT", body: JSON.stringify({ id: p.id, status }) }).catch(() => undefined);
  }

  const shown = useMemo(
    () => prospects.filter((p) => (filter === "all" || p.kind === filter) && (showDismissed || p.status !== "dismissed")),
    [prospects, filter, showDismissed],
  );
  const counts = useMemo(() => {
    const c: Partial<Record<SignalKind, number>> = {};
    for (const p of prospects) if (p.status !== "dismissed") c[p.kind] = (c[p.kind] ?? 0) + 1;
    return c;
  }, [prospects]);

  return (
    <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink">
            <Sparkles className="size-6 text-accent" /> Find customers
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Enter your website. AI reads it to learn what you sell and who buys it, searches the web for companies with a reason to hire you now (they just raised money, they&apos;re hiring, they posted about a move), and drafts a first email for each.
          </p>
        </header>

        <Card className="p-4">
          <form onSubmit={run} className="space-y-3">
            <label className="block">
              <Label>Your website</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
                  <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourcompany.com" className="pl-8" inputMode="url" required />
                </div>
                <Button type="submit" variant="primary" busy={running} disabled={Boolean(nextRunAt && claude)}>
                  <Search className="size-4" /> Find customers
                </Button>
              </div>
            </label>
            <div>
              <Label>Look for</Label>
              <div className="flex flex-wrap gap-1.5">
                {SIGNAL_KINDS.map((k) => (
                  <Chip key={k.id} active={kinds.includes(k.id)} onClick={() => setKinds((cur) => (cur.includes(k.id) ? cur.filter((x) => x !== k.id) : [...cur, k.id]))}>
                    {k.label}
                  </Chip>
                ))}
              </div>
            </div>
            {nextRunAt && claude && (
              <Note>
                Next search available {formatDate(nextRunAt, { month: "short", day: "numeric", year: undefined, hour: "numeric", minute: "2-digit" })}.
                {account?.plan === "free" ? " Free accounts get one a week; the daily plan gets one a day." : ""}
              </Note>
            )}
            {!claude && <Note tone="warn">Claude isn&apos;t set up on this server (ANTHROPIC_API_KEY), so a run shows labeled samples.</Note>}
            <p className="text-[11px] text-ink-3">
              Every prospect links to the page it came from. Emails are only shown when they&apos;re printed on a page the search read. Nothing is sent for you.
            </p>
          </form>
        </Card>

        {(running || progress.length > 0) && (
          <Card className="p-3.5">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
              {running ? <Loader2 className="size-4 animate-spin text-accent" /> : <Check className="size-4 text-good" />}
              {running ? "Working… this takes a minute or two" : "Done"}
            </div>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-ink-2">
              {progress.map((p, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  {p.kind === "search" ? <Search className="mt-0.5 size-3 shrink-0 text-ink-3" /> : p.kind === "fetch" ? <Globe className="mt-0.5 size-3 shrink-0 text-ink-3" /> : <Sparkles className="mt-0.5 size-3 shrink-0 text-accent" />}
                  <span className="break-all">{p.kind === "search" ? `Searched: ${p.text}` : p.kind === "fetch" ? `Read ${p.text}` : p.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        {profile && (
          <Card className="space-y-2 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Building2 className="size-4 text-ink-3" /> What we learned about you
            </div>
            <p className="text-[13px] text-ink-2">{profile.summary}</p>
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <div className="font-medium text-ink-2">Services</div>
                <div className="text-ink-3">{profile.services.join(", ")}</div>
              </div>
              <div>
                <div className="font-medium text-ink-2">Who buys</div>
                <div className="text-ink-3">{profile.idealCustomers.join(", ")}</div>
              </div>
              <div>
                <div className="font-medium text-ink-2">Area</div>
                <div className="text-ink-3">{profile.serviceArea}</div>
              </div>
              <div>
                <div className="font-medium text-ink-2">Buying signals</div>
                <div className="text-ink-3">{profile.buyingSignals.join(", ")}</div>
              </div>
            </div>
            {lastRun?.finishedAt && (
              <p className="text-[11px] text-ink-3">
                Last search {formatDate(lastRun.finishedAt, { month: "short", day: "numeric", year: undefined, hour: "numeric", minute: "2-digit" })} · {lastRun.searches} searches · {lastRun.found} new prospects
              </p>
            )}
          </Card>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">Prospects</h2>
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} /> Show &ldquo;not a fit&rdquo;
            </label>
          </div>
          {prospects.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </Chip>
              {SIGNAL_KINDS.filter((k) => counts[k.id]).map((k) => (
                <Chip key={k.id} active={filter === k.id} onClick={() => setFilter(k.id)}>
                  {k.label} <span className="text-ink-3">{counts[k.id]}</span>
                </Chip>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <Empty icon={<Users className="size-8" />} title={prospects.length ? "Nothing in this filter" : "No prospects yet"}>
              {prospects.length ? (
                <button type="button" onClick={() => setFilter("all")} className="inline-flex items-center gap-1 text-accent">
                  <X className="size-3" /> Clear the filter
                </button>
              ) : (
                "Run a search to find companies with a reason to hire you now."
              )}
            </Empty>
          ) : (
            shown.map((p) => <ProspectCard key={p.id} p={p} onStatus={(s) => void setStatus(p, s)} />)
          )}
        </section>
      </div>
    </div>
  );
}
