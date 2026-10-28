"use client";

import { Check, Copy, ExternalLink, Globe, Mail, MapPin, Phone, Plus, Search, Send, ShieldCheck, Star, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { crmStageLabel, findContact, followUpIn, logActivity } from "@/lib/crm";
import { formatDate, money } from "@/lib/format";
import { subInvite } from "@/lib/permit-pitch";
import type { CrmContact, Permit, PermitContractor, TradeId } from "@/lib/types";
import { PermitMarket, relDay, STRENGTH_LABEL, strengthTone, useTradeLabel } from "./PermitMarket";
import { marketName, usePermits } from "./permits-state";
import { useApp } from "./state";
import { Badge, Button, Card, cx, Empty, ErrorNote, Input, Note, Section, TextArea } from "./ui";

/** A local business you could put on your bench. */
interface Candidate {
  name: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  mapsUrl?: string;
  license?: string;
  insuredUntil?: string;
  /** e.g. "3 jobs, latest Oct 26". */
  detail?: string;
  source: "permits" | "places";
}

export function contractorDetail(c: PermitContractor): string {
  const latest = relDay(c.latest).replace(/^(Today|Yesterday)$/, (d) => d.toLowerCase());
  return `${c.jobs} job${c.jobs === 1 ? "" : "s"} (${c.permits} permit${c.permits === 1 ? "" : "s"}), latest ${latest}${c.types.length ? ` · ${c.types.join(", ")}` : ""}`;
}

function fromContractor(c: PermitContractor): Candidate {
  return { name: c.name, phone: c.phone, license: c.license, insuredUntil: c.insuredUntil, detail: contractorDetail(c), source: "permits" };
}

/** The join link a sub signs up through, credited to you. */
export function useJoinUrl(trade: string, market?: string): string {
  const userId = useApp((s) => s.user?.id);
  if (typeof window === "undefined") return "";
  const p = new URLSearchParams({ ref: userId ?? "", trade, ...(market ? { market } : {}) });
  return `${window.location.origin}/join?${p}`;
}

function useAddToBench(permit: Permit, trade: TradeId) {
  const addContact = useApp((s) => s.addContact);
  const say = useApp((s) => s.say);
  return (c: Candidate, quiet = false): CrmContact => {
    const { contact, existed } = addContact({
      company: c.name,
      phone: c.phone,
      email: c.email,
      website: c.website,
      address: c.address,
      license: c.license,
      insuredUntil: c.insuredUntil,
      trade,
      city: permit.city,
      state: permit.state,
      market: permit.market,
      source: c.source,
      notes: c.detail,
    });
    if (!quiet) say(existed ? `${contact.company} is already on your bench (${crmStageLabel(contact.stage)})` : `Added ${contact.company} to your bench`);
    return contact;
  };
}

export function Insured({ until }: { until?: string }) {
  if (!until) return null;
  const ok = until >= new Date().toISOString().slice(0, 10);
  return (
    <Badge tone={ok ? "good" : "warn"} title="Liability insurance on file with the city">
      <ShieldCheck className="size-3" /> {ok ? `Insured to ${formatDate(`${until}T12:00:00`, { year: undefined })}` : "Insurance expired"}
    </Badge>
  );
}

function CandidateRow({ c, onBench, onAdd, onInvite, inviting }: { c: Candidate; onBench?: CrmContact; onAdd: () => void; onInvite: () => void; inviting: boolean }) {
  return (
    <Card className={cx("flex flex-wrap items-start gap-3 p-3", inviting && "border-accent ring-2 ring-accent/20")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-medium text-ink">{c.name}</span>
          {c.rating != null && (
            <span className="inline-flex items-center gap-0.5 text-xs text-ink-2">
              <Star className="size-3 fill-current text-warn" aria-hidden />
              {c.rating.toFixed(1)}
              {c.reviewCount != null && <span className="text-ink-3">({c.reviewCount})</span>}
            </span>
          )}
          {c.license && <Badge title="License number on the permit">Lic. {c.license}</Badge>}
          <Insured until={c.insuredUntil} />
          {onBench && <Badge tone="accent">{crmStageLabel(onBench.stage)}</Badge>}
        </div>
        {(c.detail || c.address) && <div className="mt-0.5 truncate text-xs text-ink-3">{c.detail ?? c.address}</div>}
        <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
          {c.phone && (
            <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-ink-2 hover:text-accent">
              <Phone className="size-3" /> {c.phone}
            </a>
          )}
          {c.website && (
            <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:text-accent">
              <Globe className="size-3" /> Website
            </a>
          )}
          {c.mapsUrl && (
            <a href={c.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:text-accent">
              <MapPin className="size-3" /> Map
            </a>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button size="sm" variant={inviting ? "primary" : "ghost"} onClick={onInvite}>
          <Send className="size-3.5" /> Invite
        </Button>
        <Button size="sm" variant={onBench ? "ghost" : "secondary"} onClick={onAdd} disabled={Boolean(onBench)}>
          {onBench ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} {onBench ? "On bench" : "Add to bench"}
        </Button>
      </div>
    </Card>
  );
}

function Recruit({ permit, trade, recipient, setRecipient }: { permit: Permit; trade: TradeId; recipient: Candidate | null; setRecipient: (c: Candidate) => void }) {
  const meta = usePermits((s) => s.meta);
  const pulling = usePermits((s) => s.results?.tradeContractors[trade]) ?? [];
  const contacts = useApp((s) => s.contacts);
  const provider = useApp((s) => s.status?.places);
  const info = meta?.work.find((t) => t.id === trade);
  const location = [permit.city, permit.state].filter(Boolean).join(", ");
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = useAddToBench(permit, trade);
  const list = Object.values(contacts);

  async function search() {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/subcontractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: info.search, location }),
      });
      const body = (await res.json()) as { results?: Omit<Candidate, "source">[]; notice?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Search failed");
      setFound((body.results ?? []).map((r) => ({ ...r, source: "places" as const })));
      setNotice(body.notice ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const row = (c: Candidate) => (
    <CandidateRow key={`${c.source}:${c.name}`} c={c} onBench={findContact(list, c.name)} onAdd={() => add(c)} onInvite={() => setRecipient(c)} inviting={recipient?.name === c.name} />
  );

  return (
    <Section
      step={2}
      title={`Recruit ${info?.plural ?? "subs"} for your bench`}
      subtitle={`Local ${info?.plural ?? "companies"} who'd want this lead are the same ones you'd hire as subs. Offer them free leads; send them your jobs to quote.`}
    >
      {pulling.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-ink-2">Pulling {info?.label.toLowerCase()} permits in {meta?.markets.find((m) => m.id === permit.market)?.name ?? location} now</h3>
          {pulling.slice(0, 6).map((c) => row(fromContractor(c)))}
        </div>
      ) : (
        <p className="text-xs text-ink-3">Nobody pulled {info?.label.toLowerCase() ?? "these"} permits here in this window, or the city doesn&apos;t name contractors. Try Google Maps.</p>
      )}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-ink-2">On Google Maps near {location}</h3>
          <Button size="sm" onClick={() => void search()} busy={busy}>
            <Search className="size-3.5" /> {found ? "Search again" : `Find ${info?.plural ?? "companies"}`}
          </Button>
        </div>
        {provider == null && !found && <p className="text-xs text-ink-3">Shows sample listings until GOOGLE_PLACES_API_KEY or APIFY_API_TOKEN is set.</p>}
        {error && <ErrorNote>{error}</ErrorNote>}
        {notice && <Note tone="warn">{notice}</Note>}
        {found && found.length === 0 && <p className="text-[13px] text-ink-2">No businesses found. Try a nearby city.</p>}
        {found?.map(row)}
      </div>
    </Section>
  );
}

function Invite({ permit, trade, recipient }: { permit: Permit; trade: TradeId; recipient: Candidate | null }) {
  const profile = useApp((s) => s.profile);
  const plans = useApp((s) => s.status?.subPlans);
  const contacts = useApp((s) => s.contacts);
  const upsertContact = useApp((s) => s.upsertContact);
  const say = useApp((s) => s.say);
  const meta = usePermits((s) => s.meta);
  const add = useAddToBench(permit, trade);
  const joinUrl = useJoinUrl(trade, permit.market);
  const market = marketName({ market: permit.market, days: 7 }, meta) || permit.city;
  const generated = useMemo(
    () =>
      subInvite({
        work: trade,
        marketName: market,
        permit,
        company: recipient?.name,
        profile: profile ?? undefined,
        joinUrl,
        freePerWeek: plans?.freePerWeek ?? 10,
        dailyPrice: plans?.dailyPrice ?? 99,
      }),
    [trade, market, permit, recipient, profile, joinUrl, plans],
  );
  const [subject, setSubject] = useState(generated.subject);
  const [body, setBody] = useState(generated.body);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setSubject(generated.subject);
    setBody(generated.body);
  }, [generated]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      say("Couldn't copy. Select the text and copy it instead.");
    }
  }

  function logSent() {
    if (!recipient) return;
    const contact = findContact(Object.values(contacts), recipient.name) ?? add(recipient, true);
    const current = useApp.getState().contacts[contact.id] ?? contact;
    upsertContact({ ...logActivity(current, "email", `Sent the bench invite: "${subject}"`), nextFollowUp: current.nextFollowUp ?? followUpIn(2) });
    say(`Logged. Follow up with ${recipient.name} in 2 days.`);
  }

  return (
    <Section
      step={3}
      title="Invite them"
      subtitle="Lead with a real permit, give them free leads, and tell them you have work to quote."
      actions={
        <>
          <Button size="sm" onClick={() => void copy()}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
          </Button>
          {recipient?.email && (
            <a
              href={`mailto:${recipient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line-strong bg-panel px-2.5 text-xs font-medium text-ink hover:bg-panel-2"
            >
              <Mail className="size-3.5" /> Email
            </a>
          )}
          <Button size="sm" variant="primary" onClick={logSent} disabled={!recipient} title={recipient ? undefined : "Pick a company above first"}>
            <Send className="size-3.5" /> Log as sent
          </Button>
        </>
      }
    >
      <Card className="space-y-2 p-3">
        <div className="flex items-center gap-2 text-xs text-ink-2">
          <UserRound className="size-3.5" />
          {recipient ? (
            <span>
              To <span className="font-medium text-ink">{recipient.name}</span>
              {recipient.phone ? ` · ${recipient.phone}` : ""}
            </span>
          ) : (
            <span>Press Invite on a company above to address it to them.</span>
          )}
        </div>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
        <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={15} aria-label="Message" className="text-[13px]" />
        {(!profile?.contactName || !profile?.companyName) && (
          <p className="text-[11px] text-ink-3">Fill in your name and company in Settings to replace the [placeholders].</p>
        )}
      </Card>
    </Section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-ink">{children}</dd>
    </div>
  );
}

export function PermitDetail({ permit, listButton }: { permit: Permit; listButton?: ReactNode }) {
  const queryTrade = usePermits((s) => s.query.trade);
  const pitchTrade = usePermits((s) => s.pitchTrade);
  const setPitchTrade = usePermits((s) => s.setPitchTrade);
  const meta = usePermits((s) => s.meta);
  const label = useTradeLabel();
  const [recipient, setRecipient] = useState<Candidate | null>(null);
  const tagged = permit.trades.map((t) => t.trade);
  const trade: TradeId | null =
    pitchTrade && tagged.includes(pitchTrade as TradeId) ? (pitchTrade as TradeId) : queryTrade && tagged.includes(queryTrade) ? queryTrade : (tagged[0] ?? null);
  const feed = meta?.feeds.find((s) => s.id === permit.sourceId);
  const market = meta?.markets.find((m) => m.id === permit.market);

  // A new trade means a different kind of sub.
  useEffect(() => setRecipient(null), [trade]);

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
          {listButton}
          <div className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
            Permit leads · <span className="text-ink">{market?.name ?? permit.city}</span>
          </div>
          <a
            href={permit.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-panel px-2.5 text-xs font-medium text-ink hover:bg-panel-2"
          >
            <ExternalLink className="size-3.5" /> {permit.url === feed?.datasetUrl ? "City data" : "City record"}
          </a>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl space-y-8 px-4 py-5 sm:px-6">
            <header className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge>{relDay(permit.issuedDate)}</Badge>
                {permit.value ? <Badge tone="good">{money(permit.value, { compact: true })} job</Badge> : null}
                {permit.residential != null && <Badge>{permit.residential ? "Residential" : "Commercial"}</Badge>}
                {permit.number && <Badge>#{permit.number}</Badge>}
                {permit.related?.length ? <Badge tone="accent">{permit.related.length + 1} permits at this address</Badge> : null}
              </div>
              <h1 className="text-xl leading-snug font-semibold text-ink">{permit.type || "Building permit"}</h1>
              <p className="flex items-center gap-1.5 text-sm text-ink-2">
                <MapPin className="size-4 shrink-0 text-ink-3" />
                {permit.address}, {permit.city ? `${permit.city}, ` : ""}
                {permit.state}
                {permit.zip ? ` ${permit.zip}` : ""}
              </p>
              {permit.description && <p className="text-[13.5px] leading-relaxed text-ink">{permit.description}</p>}
              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-panel p-3 sm:grid-cols-4">
                <Fact label="Issued">{formatDate(`${permit.issuedDate}T12:00:00`)}</Fact>
                <Fact label="Job value">{money(permit.value)}</Fact>
                <Fact label="Contractor">
                  {permit.contractor ?? "Not listed"}
                  {permit.contractorPhone && <span className="block text-xs text-ink-3">{permit.contractorPhone}</span>}
                  {permit.contractorLicense && <span className="block text-xs text-ink-3">Lic. {permit.contractorLicense}</span>}
                </Fact>
                <Fact label="Owner">{permit.owner ?? "Not listed"}</Fact>
              </dl>
              {permit.related?.length ? (
                <div className="text-xs text-ink-2">
                  Also at this address:{" "}
                  {permit.related.map((r, i) => (
                    <span key={r.id}>
                      {i > 0 && ", "}
                      <a href={r.url} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
                        {r.type.split(" · ")[0] || "permit"} ({relDay(r.issuedDate).toLowerCase()})
                      </a>
                    </span>
                  ))}
                </div>
              ) : null}
            </header>

            <Section step={1} title="Who this is a lead for" subtitle="Pick the trade you're recruiting subs for.">
              {permit.trades.length === 0 ? (
                <Empty title="Not a lead for the trades we track">Electrical, plumbing and sign permits rarely mean follow-on work. Turn on &ldquo;only permits that mean work&rdquo; to hide them.</Empty>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {permit.trades.map((t) => (
                    <button
                      key={t.trade}
                      type="button"
                      onClick={() => setPitchTrade(t.trade)}
                      aria-pressed={trade === t.trade}
                      className={cx(
                        "rounded-xl border p-3 text-left transition-colors",
                        trade === t.trade ? "border-accent bg-accent-soft/60" : "border-line bg-panel hover:bg-panel-2",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-ink">{label(t.trade)}</span>
                        <span className="flex items-center gap-1.5">
                          <Badge tone={strengthTone(t.strength)}>{STRENGTH_LABEL[t.strength]}</Badge>
                          {trade === t.trade && <Check className="size-4 text-accent" />}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-2">{t.reason}</p>
                    </button>
                  ))}
                </div>
              )}
            </Section>

            {trade && <Recruit key={`${permit.market}:${trade}`} permit={permit} trade={trade} recipient={recipient} setRecipient={setRecipient} />}
            {trade && <Invite permit={permit} trade={trade} recipient={recipient} />}

            <div className="border-t border-line pt-6 xl:hidden">
              <PermitMarket />
            </div>
          </div>
        </div>
      </div>
      <aside aria-label="Market" className="scroll-thin hidden w-[320px] shrink-0 overflow-y-auto border-l border-line bg-panel xl:block">
        <div className="p-4">
          <PermitMarket />
        </div>
      </aside>
    </div>
  );
}
