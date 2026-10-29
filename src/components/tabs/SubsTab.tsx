"use client";

import type { Editor } from "@tiptap/react";
import { Check, ClipboardList, Copy, ExternalLink, Eye, FileDown, Globe, Link2, Loader2, MapPin, MessageSquareText, Phone, Plus, Printer, Search, Sparkles, Square, Star, Trash2, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { companyKey, crmStageLabel } from "@/lib/crm";
import { formatDate, money, placeLabel, uid } from "@/lib/format";
import { formatPhone } from "@/lib/lead-share";
import { findPlaceholders } from "@/lib/placeholders";
import { workById, workForJob } from "@/lib/permit-trades";
import { recipients } from "@/lib/pricing-stats";
import { rulesBreakdown } from "@/lib/rules";
import { sowTemplate } from "@/lib/templates";
import type { Deal, PermitContractor, SubStatus, Subcontractor, Vetting, WorkId } from "@/lib/types";
import { copyDoc, downloadWord, printHtml, slug } from "../doc-actions";
import { DocEditor } from "../DocEditor";
import { Markdown } from "../Markdown";
import { contractorDetail, Insured } from "../PermitDetail";
import { api, useApp } from "../state";
import { useDraft } from "../useDraft";
import { Avatar, Badge, Button, Card, Chip, cx, Empty, ErrorNote, Input, Note, NumberInput, Section, Select, TextArea } from "../ui";
import { WebsiteFacts } from "../WebsiteFacts";
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

export { slug };

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
  const [editor, setEditor] = useState<Editor | null>(null);
  const [exporting, setExporting] = useState(false);
  const onReady = useCallback((e: Editor | null) => setEditor(e), []);
  const save = useCallback((md: string) => updateDeal(deal.id, (d) => ({ ...d, sow: md })), [deal.id, updateDeal]);
  const text = draft.busy ? draft.text : (deal.sow ?? "");

  async function generate() {
    if (deal.sow && !window.confirm("Replace your scope of work with a new draft? Your edits will be lost.")) return;
    const out = await draft.run("sow", deal);
    if (out) updateDeal(deal.id, (d) => ({ ...d, sow: out, stage: d.stage === "found" ? "sourcing" : d.stage }));
  }

  async function word() {
    if (!editor) return;
    setExporting(true);
    try {
      await downloadWord(editor, `scope-of-work-${slug(deal.opportunity.title)}.docx`, `Scope of work: ${deal.opportunity.title}`);
    } catch (err) {
      say(`Couldn't make the Word file: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Section
      step={1}
      title="Scope of work to send subs"
      subtitle="What local companies read before they quote. Edit it here. No government contacts or pricing in it."
      actions={
        <>
          {draft.busy ? (
            <Button size="sm" onClick={draft.stop}>
              <Square className="size-3.5" /> Stop
            </Button>
          ) : (
            <Button size="sm" variant={deal.sow ? "ghost" : "primary"} onClick={() => void generate()}>
              <Sparkles className="size-3.5" /> {deal.sow ? "Rewrite" : claude ? "Write it with Claude" : "Fill in a template"}
            </Button>
          )}
          {deal.sow && !draft.busy && (
            <>
              <Button size="sm" disabled={!editor} onClick={() => editor && void copyDoc(editor).then((ok) => say(ok ? "Copied. Paste it into your email." : "Couldn't copy. Select the text and copy it instead."))}>
                <Copy className="size-3.5" /> Copy for email
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void word()} busy={exporting} disabled={!editor} title="Download as Word to attach">
                <FileDown className="size-3.5" /> Word
              </Button>
              <Button size="sm" variant="ghost" disabled={!editor} onClick={() => editor && !printHtml(editor.getHTML(), `Scope of work: ${deal.opportunity.title}`) && say("Allow pop-ups to print or save as PDF.")} aria-label="Print or save as PDF" title="Print or save as PDF">
                <Printer className="size-3.5" /> PDF
              </Button>
            </>
          )}
        </>
      }
    >
      {draft.error && <ErrorNote>{draft.error}</ErrorNote>}
      {!text && !draft.busy ? (
        <Empty title="No scope of work yet">Fill one in from the notice, edit it, then send it with each quote link.</Empty>
      ) : !draft.busy ? (
        <DocEditor markdown={deal.sow ?? ""} onChange={save} onReady={onReady} label="Scope of work" />
      ) : (
        <Card className="scroll-thin max-h-[480px] overflow-y-auto px-5 py-4 text-[13.5px] text-ink">
          {!text && (
            <div className="flex items-center gap-2 text-ink-3">
              <Loader2 className="size-4 animate-spin" /> Writing…
            </div>
          )}
          <Markdown source={text} />
        </Card>
      )}
      {deal.sow && !draft.busy && <p className="text-xs text-ink-3">Subs see this on their quote link, so edits here change what they read.</p>}
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
              <Phone className="size-3" /> {formatPhone(f.phone)}
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
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={names.has(w.name.toLowerCase())}
                  aria-label={names.has(w.name.toLowerCase()) ? `${w.name} is on your shortlist` : `Add ${w.name} to the shortlist`}
                  onClick={() => onAdd({ name: w.name, source: "usaspending", notes: `${w.awards} past federal award(s), ${money(w.total)}` })}
                >
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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    void run("outreach", deal, sub.id);
    // Run once when opened.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A native modal: Esc closes it and the page behind can't be tabbed into. Focus goes back to the button that opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => opener?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={`Outreach for ${sub.name}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-xl border border-line bg-panel p-0 text-ink shadow-2xl backdrop:bg-black/30"
    >
      <div className="flex max-h-[85dvh] flex-col">
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
    </dialog>
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
    if (sub.lineQuotes && Object.keys(sub.lineQuotes).length) {
      const lq = sub.lineQuotes;
      updateDeal(deal.id, (d) => ({
        ...d,
        stage: d.stage === "found" || d.stage === "sourcing" ? "quoted" : d.stage,
        pricing: {
          ...d.pricing,
          lines: d.pricing.lines.map((l) => (lq[l.id] == null ? l : { ...l, subCost: lq[l.id]!, price: l.price > 0 ? l.price : Math.round(lq[l.id]! * (1 + markup / 100) * 100) / 100 })),
        },
      }));
      say(`Using ${sub.name}'s prices as your sub cost`);
      return;
    }
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
            {sub.source === "permits" && <Badge tone="accent">Pulling permits nearby</Badge>}
            {sub.license && <Badge>Lic. {sub.license}</Badge>}
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
                {formatPhone(sub.phone)}
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

      {sub.website && sub.source !== "sample" && (
        <WebsiteFacts
          website={sub.website}
          have={{ email: sub.email, phone: sub.phone, license: sub.license }}
          onUse={({ email, phone, license }) => patch({ ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(license ? { license } : {}), vetting: { ...sub.vetting, hasWebsite: true, ...(email && !/@(gmail|yahoo|hotmail|outlook|aol)\./i.test(email) ? { proEmail: true } : {}) } })}
        />
      )}

      <QuoteLink deal={deal} sub={sub} />

      {sub.lineQuotes && Object.keys(sub.lineQuotes).length > 0 && (
        <div className="mt-3 rounded-lg border border-line px-2.5 py-2 text-xs">
          <div className="mb-1 font-medium text-ink-2">
            Their online quote{sub.quoteTotal != null ? `: ${money(sub.quoteTotal, { cents: true })} ${deal.pricing.periodLabel === "year" ? "per year" : "for the job"}` : ""}
          </div>
          <ul className="space-y-0.5">
            {deal.pricing.lines.map((l) =>
              sub.lineQuotes![l.id] == null ? null : (
                <li key={l.id} className="flex justify-between gap-2 text-ink-2">
                  <span className="truncate">{l.description}</span>
                  <span className="shrink-0 text-ink tabular-nums">
                    {money(sub.lineQuotes![l.id]!, { cents: true })}/{l.unit}
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-panel-2 px-2.5 py-2">
        <span className="text-xs font-medium text-ink-2">Quote</span>
        <NumberInput prefix="$" value={sub.quote ?? 0} onChange={(quote) => patch({ quote: quote || undefined })} className="w-28" aria-label="Quote amount" />
        <span className="text-xs text-ink-2">per</span>
        <Input value={sub.quoteBasis ?? unit} onChange={(e) => patch({ quoteBasis: e.target.value })} className="h-8 w-28 text-xs" aria-label="Quote basis" />
        <Button size="sm" disabled={!sub.quote && !sub.lineQuotes} onClick={applyQuote} className="ml-auto">
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
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remove ${sub.name} from the shortlist`}
            title="Remove from the shortlist (they stay on your bench)"
            onClick={() => {
              const hasWork = sub.quote || sub.quoteTotal || sub.notes?.trim();
              if (hasWork && !window.confirm(`Remove ${sub.name}? Their quote and notes on this bid go with them.`)) return;
              updateDeal(deal.id, (d) => ({ ...d, subs: d.subs.filter((s) => s.id !== sub.id) }));
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {outreach && <OutreachModal deal={deal} sub={sub} onClose={() => setOutreach(false)} />}
    </Card>
  );
}

const QUOTE_STATUS: Record<string, string> = { sent: "Link ready, not opened yet", viewed: "Opened, no quote yet", submitted: "Quote received" };

/** Send the sub a link to quote online; their prices land in this bid. */
function QuoteLink({ deal, sub }: { deal: Deal; sub: Subcontractor }) {
  const requestQuote = useApp((s) => s.requestQuote);
  const req = useApp((s) => (sub.quoteToken ? s.quoteRequests[sub.quoteToken] : undefined));
  const profile = useApp((s) => s.profile);
  const say = useApp((s) => s.say);
  const setView = useApp((s) => s.setView);
  const [busy, setBusy] = useState(false);
  const url = sub.quoteToken && typeof window !== "undefined" ? `${window.location.origin}/q/${sub.quoteToken}` : null;
  // The sub sees your company name at the top of the page; blank reads as "A contractor".
  const noCompany = !profile?.companyName?.trim();
  // Blanks left in the scope would reach the sub as written.
  const blanks = useMemo(() => (profile ? findPlaceholders(deal.sow?.trim() || sowTemplate(deal, profile)) : []), [deal, profile]);

  async function create(): Promise<string | null> {
    setBusy(true);
    try {
      const r = await requestQuote(deal.id, sub.id);
      return `${window.location.origin}/q/${r.token}`;
    } catch (err) {
      say(`Couldn't make the link: ${(err as Error).message}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    // Refresh the snapshot so the sub sees the latest scope and lines.
    const link = await create();
    if (link) copyText(link, say);
  }

  const mail = url
    ? `mailto:${sub.email ?? ""}?subject=${encodeURIComponent(`Quote request: ${deal.opportunity.title}`)}&body=${encodeURIComponent(
        `Hi ${sub.name} team,\n\nWe have work for you to quote: ${deal.opportunity.title} in ${placeLabel(deal.opportunity.placeOfPerformance)}. The scope and line items are here, and you can send your prices online in a few minutes:\n\n${url}\n\nThanks,\n${profile?.contactName || "[your name]"}\n${profile?.companyName || ""}`,
      )}`
    : null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line-strong px-2.5 py-2">
      <Link2 className="size-3.5 text-ink-3" />
      <span className="text-xs text-ink-2">
        {req ? QUOTE_STATUS[req.status] : url ? "Quote link made" : "Let them quote online"}
        {req?.submittedAt && ` · ${formatDate(req.submittedAt, { month: "short", day: "numeric", year: undefined, hour: "numeric", minute: "2-digit" })}`}
      </span>
      <div className="ml-auto flex flex-wrap gap-1.5">
        {url && (
          <a href={`${url}?preview=1`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center pointer-coarse:h-10 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-2 hover:bg-panel-2 hover:text-ink">
            <Eye className="size-3.5" /> Preview
          </a>
        )}
        <Button size="sm" onClick={() => void copy()} busy={busy}>
          <Copy className="size-3.5" /> {url ? "Copy link" : "Get quote link"}
        </Button>
        {mail && (
          <a href={mail} className="inline-flex h-7 items-center pointer-coarse:h-10 gap-1.5 rounded-lg border border-line-strong bg-panel px-2.5 text-xs font-medium text-ink hover:bg-panel-2">
            Email it
          </a>
        )}
      </div>
      {noCompany && (
        <p className="basis-full text-xs text-warn">
          Your company name is blank, so the sub sees &ldquo;A contractor&rdquo;.{" "}
          <button type="button" onClick={() => setView("settings")} className="font-medium underline underline-offset-2">
            Add it in Settings
          </button>
        </p>
      )}
      {blanks.length > 0 && (
        <p className="basis-full text-xs text-warn">
          The scope still has {blanks.length === 1 ? "a blank" : `${blanks.length} blanks`} the sub will see: {blanks.slice(0, 3).join(", ")}
          {blanks.length > 3 ? "…" : ""}. Fill {blanks.length === 1 ? "it" : "them"} in under step 1.
        </p>
      )}
    </div>
  );
}

interface Nearby {
  markets: { id: string; name: string }[];
  work: WorkId[];
  contractors: PermitContractor[];
  days: number;
  widenedFrom?: string;
  gaps: string[];
}

/** Businesses pulling permits for this kind of work near the job: licensed, local, and busy right now. */
function PermitSubs({ deal, onAdd }: { deal: Deal; onAdd: (f: Found & { trade?: string }) => void }) {
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o);
  const suggested = useMemo(() => workForJob({ naicsCode: o.naicsCode, title: o.title, terms: b.subcontractorSearchTerms }), [o.naicsCode, o.title, b.subcontractorSearchTerms]);
  const [work, setWork] = useState<WorkId | null>(suggested[0] ?? null);
  const [data, setData] = useState<Nearby | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = o.placeOfPerformance.state;
  const names = new Set(deal.subs.map((s) => companyKey(s.name)));

  useEffect(() => {
    if (!state || !work) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    const p = new URLSearchParams({ state, work, ...(o.placeOfPerformance.city ? { city: o.placeOfPerformance.city } : {}) });
    api<Nearby>(`/api/permits/contractors?${p}`)
      .then((r) => !cancelled && setData(r))
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [state, work, o.placeOfPerformance.city]);

  if (!state) return null;
  const label = work ? workById(work) : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <ClipboardList className="size-4 text-ink-3" />
          {label ? `Pulling ${label.label.toLowerCase()} permits near the job` : "Businesses pulling permits near the job"}
        </h3>
        {suggested.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {suggested.map((w) => (
              <Chip key={w} active={w === work} onClick={() => setWork(w)}>
                {workById(w).label}
              </Chip>
            ))}
          </div>
        )}
      </div>
      {!work ? (
        <p className="text-xs text-ink-3">Permits don&apos;t name contractors for this kind of work (janitorial, for example). Use the business search above.</p>
      ) : busy && !data ? (
        <p className="flex items-center gap-2 text-xs text-ink-3">
          <Loader2 className="size-3.5 animate-spin" /> Reading the last 30 days of permits…
        </p>
      ) : error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : data && data.markets.length === 0 ? (
        <p className="text-xs text-ink-3">We don&apos;t collect building permits in {state} yet.</p>
      ) : data && data.contractors.length === 0 ? (
        <p className="text-xs text-ink-3">
          Nobody pulled {label?.label.toLowerCase()} permits in {data.widenedFrom ?? data.markets.map((m) => m.name).join(", ")}
          {data.widenedFrom ? ` or the rest of ${state}` : ""} in the last {data.days} days.
          {data.gaps.length > 0 ? ` ${data.widenedFrom ?? "The city"}'s feed: ${data.gaps.join("; ").toLowerCase()}.` : ""} Use the business search above.
        </p>
      ) : data ? (
        <>
          <p className="text-xs text-ink-3">
            {data.widenedFrom && `Nobody in ${data.widenedFrom}'s permits for this work${data.gaps.length ? ` (its feed: ${data.gaps[0]!.toLowerCase()})` : ""}, so these are from elsewhere in ${state}. `}
            From {data.markets.length === 1 ? data.markets[0]!.name : `${data.markets.length} cities and counties in ${state}`} permit records, last {data.days} days. They&apos;re licensed to pull permits and working {data.widenedFrom || data.markets.length > 1 ? "in the state" : "nearby"} right now.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.contractors.slice(0, 8).map((c) => {
              const added = names.has(c.key);
              return (
                <Card key={c.key} className="flex items-start gap-2.5 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-ink">{c.name}</span>
                      {c.license && <Badge>Lic. {c.license}</Badge>}
                      <Insured until={c.insuredUntil} />
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-3">{contractorDetail(c)}</div>
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="mt-1 inline-flex items-center gap-1 text-xs text-ink-2 hover:text-accent">
                        <Phone className="size-3" /> {formatPhone(c.phone)}
                      </a>
                    )}
                  </div>
                  <Button size="sm" variant={added ? "ghost" : "secondary"} disabled={added} onClick={() => onAdd({ name: c.name, phone: c.phone, license: c.license, category: label?.label, source: "permits", trade: work })}>
                    {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} {added ? "Added" : "Shortlist"}
                  </Button>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Subs already on your bench who do this kind of work in this state. */
function BenchSubs({ deal, onAdd }: { deal: Deal; onAdd: (f: Found & { trade?: string; crmId?: string }) => void }) {
  const contacts = useApp((s) => s.contacts);
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o);
  const work = useMemo(() => workForJob({ naicsCode: o.naicsCode, title: o.title, terms: b.subcontractorSearchTerms }), [o.naicsCode, o.title, b.subcontractorSearchTerms]);
  const names = new Set(deal.subs.map((s) => companyKey(s.name)));
  const matches = Object.values(contacts)
    .filter((c) => c.stage !== "not-a-fit" && (!o.placeOfPerformance.state || !c.state || c.state === o.placeOfPerformance.state))
    .filter((c) => !work.length || (c.trade && work.includes(c.trade as WorkId)))
    .sort((a, b) => (a.stage === "active" ? -1 : 0) - (b.stage === "active" ? -1 : 0))
    .slice(0, 6);
  if (matches.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Users className="size-4 text-ink-3" /> From your bench
      </h3>
      <div className="flex flex-wrap gap-2">
        {matches.map((c) => {
          const added = names.has(companyKey(c.company));
          return (
            <Button
              key={c.id}
              size="sm"
              variant={added ? "ghost" : "secondary"}
              disabled={added}
              onClick={() => onAdd({ name: c.company, phone: c.phone, email: c.email, website: c.website, license: c.license, source: "bench", trade: c.trade, crmId: c.id })}
              title={crmStageLabel(c.stage)}
            >
              {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} {c.company}
              <span className="text-ink-3">· {crmStageLabel(c.stage)}</span>
            </Button>
          );
        })}
      </div>
    </div>
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
  const addContact = useApp((s) => s.addContact);
  const o = deal.opportunity;
  const b = deal.breakdown ?? rulesBreakdown(o);
  const jobWork = workForJob({ naicsCode: o.naicsCode, title: o.title, terms: b.subcontractorSearchTerms })[0];
  // Everyone you shortlist (except sample listings) goes on your bench too.
  const add = ({ trade, crmId, ...f }: Found & { trade?: string; crmId?: string }) => {
    if (deal.subs.some((s) => companyKey(s.name) === companyKey(f.name))) return;
    const linked =
      crmId ??
      (f.source === "sample"
        ? undefined
        : addContact({
            company: f.name,
            phone: f.phone,
            email: f.email,
            website: f.website,
            address: f.address,
            license: f.license,
            trade: trade ?? jobWork,
            city: o.placeOfPerformance.city,
            state: o.placeOfPerformance.state,
            source: f.source === "permits" ? "permits" : f.source === "manual" ? "manual" : "places",
          }).contact.id);
    updateDeal(deal.id, (d) => ({ ...d, stage: d.stage === "found" ? "sourcing" : d.stage, subs: [...d.subs, { ...toSub(f), crmId: linked }] }));
  };
  const quoted = deal.subs.filter((s) => s.quote).length;

  return (
    <div className="space-y-10">
      <ScopeOfWork key={`sow-${deal.id}`} deal={deal} />
      <FindCompanies key={`find-${deal.id}`} deal={deal} onAdd={add} />
      <div className="space-y-6">
        <BenchSubs deal={deal} onAdd={add} />
        <PermitSubs key={`permits-${deal.id}`} deal={deal} onAdd={add} />
      </div>
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
