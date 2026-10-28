"use client";

import { Check, Copy, Download, ExternalLink, Globe, Loader2, MapPin, MessageSquareText, Phone, Plus, Search, Sparkles, Square, Star, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { money, placeLabel, uid } from "@/lib/format";
import { recipients } from "@/lib/pricing-stats";
import { rulesBreakdown } from "@/lib/rules";
import type { Deal, SubStatus, Subcontractor, Vetting } from "@/lib/types";
import { Markdown } from "../Markdown";
import { useApp } from "../state";
import { useDraft } from "../useDraft";
import { Avatar, Badge, Button, Card, Chip, cx, Empty, ErrorNote, Input, Note, NumberInput, Section, Select, TextArea } from "../ui";
import { defaultPricingQuery, usePastAwards } from "./PricingTab";

type Found = Omit<Subcontractor, "id" | "status" | "vetting">;

export const VETTING: { key: keyof Vetting; label: string }[] = [
  { key: "respondsFast", label: "Responds fast" },
  { key: "goodReviews", label: "Good reviews" },
  { key: "hasWebsite", label: "Real website" },
  { key: "proEmail", label: "Professional email" },
  { key: "okWithNet30", label: "OK with net-30" },
  { key: "pastPerformance", label: "Has similar past jobs" },
];

const STATUS: [SubStatus, string][] = [
  ["new", "Not contacted"],
  ["contacted", "Contacted"],
  ["quoted", "Quote received"],
  ["selected", "Selected"],
  ["declined", "Declined / no reply"],
];

export function copyText(text: string, say: (m: string) => void) {
  void navigator.clipboard.writeText(text).then(
    () => say("Copied to clipboard"),
    () => say("Couldn't copy. Select the text and copy it manually."),
  );
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function toSub(f: Found): Subcontractor {
  return {
    ...f,
    id: uid("sub"),
    status: "new",
    vetting: {
      hasWebsite: Boolean(f.website) || undefined,
      goodReviews: f.rating != null && f.rating >= 4.3 && (f.reviewCount ?? 0) >= 15 ? true : undefined,
    },
  };
}

// ---- 1. Scope of work ----

function ScopeOfWork({ deal }: { deal: Deal }) {
  const updateDeal = useApp((s) => s.updateDeal);
  const say = useApp((s) => s.say);
  const claude = useApp((s) => Boolean(s.status?.claude));
  const draft = useDraft();
  const [editing, setEditing] = useState(false);
  const text = draft.busy ? draft.text : (deal.sow ?? "");

  async function generate() {
    setEditing(false);
    const out = await draft.run("sow", deal);
    if (out) updateDeal(deal.id, (d) => ({ ...d, sow: out, stage: d.stage === "found" ? "sourcing" : d.stage }));
  }

  return (
    <Section
      step={1}
      title="Scope of work to send subs"
      subtitle="What you email local companies so they can quote. No government contacts or pricing in it."
      actions={
        <>
          {draft.busy ? (
            <Button size="sm" onClick={draft.stop}>
              <Square className="size-3.5" /> Stop
            </Button>
          ) : (
            <Button size="sm" variant={deal.sow ? "secondary" : "primary"} onClick={() => void generate()}>
              <Sparkles className="size-3.5" /> {deal.sow ? "Rewrite" : claude ? "Write it with Claude" : "Fill in a template"}
            </Button>
          )}
          {deal.sow && !draft.busy && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
                {editing ? "Preview" : "Edit"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => copyText(deal.sow!, say)} aria-label="Copy scope of work">
                <Copy className="size-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => downloadText(`scope-of-work-${slug(deal.opportunity.title)}.md`, deal.sow!)} aria-label="Download scope of work">
                <Download className="size-3.5" />
              </Button>
            </>
          )}
        </>
      }
    >
      {draft.error && <ErrorNote>{draft.error}</ErrorNote>}
      {!text && !draft.busy ? (
        <Empty title="No scope of work yet">Generate one, then email it to every company on your shortlist.</Empty>
      ) : editing && !draft.busy ? (
        <TextArea
          value={deal.sow ?? ""}
          onChange={(e) => updateDeal(deal.id, (d) => ({ ...d, sow: e.target.value }))}
          rows={18}
          aria-label="Scope of work"
          className="font-mono text-[13px]"
        />
      ) : (
        <Card className="scroll-thin max-h-[480px] overflow-y-auto px-5 py-4 text-[13.5px] text-ink">
          {draft.busy && !text && (
            <div className="flex items-center gap-2 text-ink-3">
              <Loader2 className="size-4 animate-spin" /> Writing…
            </div>
          )}
          <Markdown source={text} />
        </Card>
      )}
    </Section>
  );
}

// ---- 2. Find companies ----

function FoundCard({ f, added, onAdd }: { f: Found; added: boolean; onAdd: () => void }) {
  return (
    <Card className="flex gap-3 p-3">
      <Avatar name={f.name.replace(/^Sample:\s*/, "")} size={36} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-snug font-semibold text-ink">{f.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
          {f.rating != null && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3 fill-current text-warn" /> {f.rating.toFixed(1)}
              {f.reviewCount != null && <span className="text-ink-3">({f.reviewCount})</span>}
            </span>
          )}
          {f.category && <span className="truncate">{f.category}</span>}
        </div>
        {f.address && <div className="mt-0.5 truncate text-xs text-ink-3">{f.address}</div>}
        <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
          {f.phone && (
            <a href={`tel:${f.phone}`} className="inline-flex items-center gap-1 text-ink-2 hover:text-accent">
              <Phone className="size-3" /> {f.phone}
            </a>
          )}
          {f.website && (
            <a href={f.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:text-accent">
              <Globe className="size-3" /> Website
            </a>
          )}
          {f.mapsUrl && (
            <a href={f.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:text-accent">
              <MapPin className="size-3" /> Map
            </a>
          )}
        </div>
      </div>
      <Button size="sm" variant={added ? "ghost" : "secondary"} onClick={onAdd} disabled={added} className="self-start">
        {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} {added ? "Added" : "Shortlist"}
      </Button>
    </Card>
  );
}

function FindCompanies({ deal, onAdd }: { deal: Deal; onAdd: (f: Found) => void }) {
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o);
  const [query, setQuery] = useState(b.subcontractorSearchTerms[0] ?? "");
  const [location, setLocation] = useState(placeLabel(o.placeOfPerformance).replace("—", ""));
  const [found, setFound] = useState<Found[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = useApp((s) => s.status?.places);
  const past = usePastAwards(deal);
  const winners = past.results ? recipients(past.results.awards).slice(0, 8) : null;
  const names = new Set(deal.subs.map((s) => s.name.toLowerCase()));

  async function search(q = query) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/subcontractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, location }),
      });
      const body = (await res.json()) as { results?: Found[]; notice?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Search failed");
      setFound(body.results ?? []);
      setNotice(body.notice ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      step={2}
      title="Find local companies"
      subtitle="Call and email several. You want the hungry ones who answer fast and already know this work."
    >
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What kind of company" aria-label="What kind of company" className="sm:flex-[1.4]" />
        <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" aria-label="Location" className="sm:flex-1" />
        <Button type="submit" variant="primary" busy={busy}>
          <Search className="size-4" /> Search
        </Button>
      </form>
      {b.subcontractorSearchTerms.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {b.subcontractorSearchTerms.map((t) => (
            <Chip
              key={t}
              active={t === query}
              onClick={() => {
                setQuery(t);
                void search(t);
              }}
            >
              {t}
            </Chip>
          ))}
        </div>
      )}
      {busy && provider === "apify" && <Note>Apify scrapes Google Maps live. This can take a minute or two.</Note>}
      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && <Note tone="warn">{notice}</Note>}
      {found && found.length === 0 && <Empty title="No businesses found">Try a different phrase or a nearby bigger city.</Empty>}
      {found && found.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {found.map((f) => (
            <FoundCard key={`${f.name}-${f.address}`} f={f} added={names.has(f.name.toLowerCase())} onAdd={() => onAdd(f)} />
          ))}
        </div>
      )}

      <div className="pt-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold text-ink">Companies that already won this work</div>
            <div className="text-xs text-ink-2">Past federal winners from USAspending. They know the job and may sub for you.</div>
          </div>
          {!winners && (
            <Button size="sm" busy={past.busy} onClick={() => void past.run(defaultPricingQuery(deal))}>
              Look them up
            </Button>
          )}
        </div>
        {past.error && <ErrorNote>{past.error}</ErrorNote>}
        {winners && winners.length === 0 && <p className="text-xs text-ink-3">No past winners found for this search. Adjust it on the Past pricing tab.</p>}
        {winners && winners.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
            {winners.map((w) => (
              <li key={w.name} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={w.name} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">{w.name}</div>
                  <div className="text-xs text-ink-3">
                    {w.awards} award{w.awards === 1 ? "" : "s"} · {money(w.total, { compact: true })}
                    {w.states.length > 0 && ` · ${w.states.join(", ")}`}
                  </div>
                </div>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${w.name} ${w.states[0] ?? ""} contact`)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Search the web for ${w.name}`}
                  className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-panel-2 hover:text-ink"
                >
                  <ExternalLink className="size-3.5" />
                </a>
                <Button size="sm" variant="ghost" disabled={names.has(w.name.toLowerCase())} onClick={() => onAdd({ name: w.name, source: "usaspending", notes: `${w.awards} past federal award(s), ${money(w.total)}` })}>
                  {names.has(w.name.toLowerCase()) ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

// ---- 3. Shortlist ----

function OutreachModal({ deal, sub, onClose }: { deal: Deal; sub: Subcontractor; onClose: () => void }) {
  const draft = useDraft();
  const say = useApp((s) => s.say);
  const { run } = draft;
  useEffect(() => {
    void run("outreach", deal, sub.id);
    // Run once when opened.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={`Outreach for ${sub.name}`} onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-ink">Email &amp; call script</div>
            <div className="text-xs text-ink-2">{sub.name}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={!draft.text || draft.busy} onClick={() => copyText(draft.text, say)}>
              <Copy className="size-3.5" /> Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 py-4 text-[13.5px] text-ink">
          {draft.error && <ErrorNote>{draft.error}</ErrorNote>}
          {draft.busy && !draft.text && (
            <div className="flex items-center gap-2 text-ink-3">
              <Loader2 className="size-4 animate-spin" /> Writing…
            </div>
          )}
          <Markdown source={draft.text} />
        </div>
      </div>
    </div>
  );
}

function SubCard({ deal, sub }: { deal: Deal; sub: Subcontractor }) {
  const updateDeal = useApp((s) => s.updateDeal);
  const markup = useApp((s) => s.profile?.defaultMarkupPct ?? 35);
  const say = useApp((s) => s.say);
  const [outreach, setOutreach] = useState(false);
  const score = VETTING.filter((v) => sub.vetting[v.key]).length;
  const unit = deal.pricing.lines[0]?.unit ?? "unit";

  const patch = (p: Partial<Subcontractor>) =>
    updateDeal(deal.id, (d) => ({ ...d, subs: d.subs.map((s) => (s.id === sub.id ? { ...s, ...p } : s)) }));

  function applyQuote() {
    if (!sub.quote) return;
    updateDeal(deal.id, (d) => {
      const [first, ...rest] = d.pricing.lines;
      const line = first ?? { id: uid("line"), description: "Work as described", unit: "unit", quantity: 1, subCost: 0, price: 0 };
      const price = line.price > 0 ? line.price : Math.round(sub.quote! * (1 + markup / 100) * 100) / 100;
      return {
        ...d,
        stage: d.stage === "found" || d.stage === "sourcing" ? "quoted" : d.stage,
        subs: d.subs.map((s) => (s.id === sub.id && (s.status === "new" || s.status === "contacted") ? { ...s, status: "quoted" } : s)),
        pricing: { ...d.pricing, lines: [{ ...line, subCost: sub.quote! }, ...rest] },
      };
    });
    say(`Using ${money(sub.quote, { cents: true })} per ${unit} as your sub cost`);
  }

  return (
    <Card className={cx("p-3.5", sub.status === "selected" && "border-good ring-1 ring-good/30", sub.status === "declined" && "opacity-60")}>
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={sub.name.replace(/^Sample:\s*/, "")} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-ink">{sub.name}</span>
            {sub.source === "usaspending" && <Badge tone="accent">Past federal winner</Badge>}
            {sub.source === "sample" && <Badge>Sample</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-2">
            {sub.rating != null && (
              <span className="inline-flex items-center gap-0.5">
                <Star className="size-3 fill-current text-warn" /> {sub.rating.toFixed(1)} ({sub.reviewCount ?? 0})
              </span>
            )}
            {sub.phone && (
              <a href={`tel:${sub.phone}`} className="hover:text-accent">
                {sub.phone}
              </a>
            )}
            {sub.website && (
              <a href={sub.website} target="_blank" rel="noreferrer" className="hover:text-accent">
                Website
              </a>
            )}
          </div>
        </div>
        <Select value={sub.status} onChange={(e) => patch({ status: e.target.value as SubStatus })} aria-label="Status" className="h-8 w-auto text-xs">
          {STATUS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-panel-2 px-2.5 py-2">
        <span className="text-xs font-medium text-ink-2">Quote</span>
        <NumberInput prefix="$" value={sub.quote ?? 0} onChange={(quote) => patch({ quote: quote || undefined })} className="w-28" aria-label="Quote amount" />
        <span className="text-xs text-ink-2">per</span>
        <Input value={sub.quoteBasis ?? unit} onChange={(e) => patch({ quoteBasis: e.target.value })} className="h-8 w-28 text-xs" aria-label="Quote basis" />
        <Button size="sm" disabled={!sub.quote} onClick={applyQuote} className="ml-auto">
          Use in price
        </Button>
      </div>

      <div className="mt-3">
        <div className={cx("mb-1.5 text-xs font-medium", score >= 5 ? "text-good" : score >= 3 ? "text-warn" : "text-ink-3")}>
          Hunger check {score}/6 <span className="font-normal text-ink-3">· hungry subs answer fast and want the work</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VETTING.map((v) => (
            <Chip key={v.key} active={Boolean(sub.vetting[v.key])} onClick={() => patch({ vetting: { ...sub.vetting, [v.key]: !sub.vetting[v.key] } })}>
              {sub.vetting[v.key] && <Check className="size-3" />}
              {v.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <TextArea value={sub.notes ?? ""} onChange={(e) => patch({ notes: e.target.value })} placeholder="Notes: who you spoke with, how fast they replied, past jobs…" rows={2} className="flex-1 text-[13px]" aria-label="Notes" />
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => setOutreach(true)}>
            <MessageSquareText className="size-3.5" /> Email &amp; script
          </Button>
          <Button size="sm" variant="ghost" aria-label="Remove from shortlist" onClick={() => updateDeal(deal.id, (d) => ({ ...d, subs: d.subs.filter((s) => s.id !== sub.id) }))}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {outreach && <OutreachModal deal={deal} sub={sub} onClose={() => setOutreach(false)} />}
    </Card>
  );
}

function AddManually({ onAdd }: { onAdd: (f: Found) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add a company manually
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd({ name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined, source: "manual" });
        setName("");
        setPhone("");
        setEmail("");
        setOpen(false);
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" aria-label="Company name" autoFocus />
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" aria-label="Phone" />
      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" type="email" />
      <Button type="submit" variant="primary">
        Add
      </Button>
    </form>
  );
}

export function SubsTab({ deal }: { deal: Deal }) {
  const updateDeal = useApp((s) => s.updateDeal);
  const add = (f: Found) =>
    updateDeal(deal.id, (d) =>
      d.subs.some((s) => s.name.toLowerCase() === f.name.toLowerCase())
        ? d
        : { ...d, stage: d.stage === "found" ? "sourcing" : d.stage, subs: [...d.subs, toSub(f)] },
    );
  const quoted = deal.subs.filter((s) => s.quote).length;

  return (
    <div className="space-y-10">
      <ScopeOfWork key={`sow-${deal.id}`} deal={deal} />
      <FindCompanies key={`find-${deal.id}`} deal={deal} onAdd={add} />
      <Section
        step={3}
        title="Your shortlist and quotes"
        subtitle={deal.subs.length ? `${deal.subs.length} compan${deal.subs.length === 1 ? "y" : "ies"} · ${quoted} quote${quoted === 1 ? "" : "s"} in. Aim for at least three.` : "Companies you add show up here."}
        actions={<AddManually onAdd={add} />}
      >
        {deal.subs.length === 0 ? (
          <Empty title="No subcontractors yet">Shortlist companies from the search above, or add one you already know.</Empty>
        ) : (
          <div className="space-y-2">
            {deal.subs.map((s) => (
              <SubCard key={s.id} deal={deal} sub={s} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
