"use client";

import { CalendarClock, ChevronDown, ChevronUp, ClipboardList, CreditCard, ExternalLink, FileSignature, LogOut, MapPin, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { formatDate, money } from "@/lib/format";
import { PERMIT_MARKETS, STATE_NAMES } from "@/lib/permit-sources";
import { TRADES } from "@/lib/permit-trades";
import type { QuoteRequest } from "@/lib/quote";
import { formatPhone, leadSnapshot } from "@/lib/lead-share";
import type { Account, Permit, SubLeads, TradeId } from "@/lib/types";
import { LeadView, type Sender } from "./LeadView";
import { relDay, STRENGTH_LABEL, strengthTone } from "./PermitMarket";
import { api, flushSaves, useApp } from "./state";
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Input, Label, Note, Section, Select, Toggle } from "./ui";

const marketName = (id?: string | null) => PERMIT_MARKETS.find((m) => m.id === id)?.name.replace(/\s*\(.*\)$/, "") ?? "your area";
const tradeLabel = (id?: string | null) => TRADES.find((t) => t.id === id)?.label ?? "your trade";

/** Send the sub to Stripe Checkout for the daily plan. */
function useUpgrade() {
  const say = useApp((s) => s.say);
  const [busy, setBusy] = useState(false);
  const upgrade = async () => {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>("/api/sub/checkout", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      say((err as Error).message);
      setBusy(false);
    }
  };
  return { upgrade, busy };
}

function useSender(): Sender {
  const account = useApp((s) => s.account);
  const user = useApp((s) => s.user);
  return { company: account?.company ?? "", name: user?.name ?? "", email: user?.email ?? "", phone: account?.phone ?? "", website: account?.website };
}

function LeadCard({ p, trade }: { p: Permit; trade: TradeId }) {
  const [open, setOpen] = useState(false);
  const sender = useSender();
  const tag = p.trades.find((t) => t.trade === trade);
  if (open) {
    return (
      <Card className="p-4">
        <div className="mb-2 flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            <ChevronUp className="size-3.5" /> Close
          </Button>
        </div>
        <LeadView s={leadSnapshot(p, trade, { company: "", name: "", email: "", phone: "" })} sender={sender} />
      </Card>
    );
  }
  return (
    <Card className="p-0">
      <button type="button" onClick={() => setOpen(true)} className="block w-full rounded-xl p-3.5 text-left hover:bg-panel-2" aria-expanded={false}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[14px] font-semibold text-ink">{p.address}</span>
              {tag && <Badge tone={strengthTone(tag.strength)}>{STRENGTH_LABEL[tag.strength]}</Badge>}
              {p.value ? <Badge tone="good">{money(p.value, { compact: true })} job</Badge> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-3">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {[p.city, p.zip].filter(Boolean).join(" ")}
              </span>
              <span>{p.type.split(" · ")[0]}</span>
              <span>Issued {relDay(p.issuedDate).toLowerCase()}</span>
            </div>
          </div>
          <span className="inline-flex h-7 shrink-0 items-center gap-1 text-xs font-medium text-accent">
            How to reach them <ChevronDown className="size-3.5" />
          </span>
        </div>
        {tag && <p className="mt-2 text-[13px] text-ink">{tag.reason}</p>}
        {p.description && <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{p.description}</p>}
        <p className="mt-1.5 text-xs text-ink-3">
          {p.contractor ? <>Contractor: {p.contractor}{p.contractorPhone ? ` · ${formatPhone(p.contractorPhone)}` : ""}. </> : null}
          {p.owner ? <>Owner: {p.owner}. </> : null}
          {!p.contractor && !p.owner && "No names on this permit: mail the address or knock."}
        </p>
      </button>
    </Card>
  );
}

interface SharedLead {
  token: string;
  status: "sent" | "viewed" | "taken" | "passed";
  createdAt: string;
  address: string;
  city: string;
  reason: string;
  from: string;
}

/** Leads primes have passed to you directly. */
function SharedLeads() {
  const [leads, setLeads] = useState<SharedLead[]>([]);
  useEffect(() => {
    api<{ leads: SharedLead[] }>("/api/sub/shared")
      .then((r) => setLeads(r.leads))
      .catch(() => {});
  }, []);
  if (!leads.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-[13px] font-semibold text-ink-2">Sent to you · {leads.length}</h2>
      {leads.map((l) => (
        <a key={l.token} href={`/l/${l.token}`} className="block rounded-xl border border-accent/40 bg-accent-soft/30 p-3.5 hover:bg-accent-soft/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14px] font-semibold text-ink">
              {l.address}, {l.city}
            </span>
            <Badge tone={l.status === "taken" ? "good" : "accent"}>{l.status === "taken" ? "You're on it" : l.status === "passed" ? "Passed" : "New"}</Badge>
          </div>
          <p className="mt-1 text-[13px] text-ink-2">{l.reason}</p>
          <p className="mt-1 text-xs text-ink-3">
            From {l.from || "a contractor"} · {formatDate(l.createdAt, { year: undefined })}
          </p>
        </a>
      ))}
    </section>
  );
}

export function SubLeadsView() {
  const account = useApp((s) => s.account);
  const plans = useApp((s) => s.status?.subPlans);
  const setView = useApp((s) => s.setView);
  const [data, setData] = useState<SubLeads | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { upgrade, busy } = useUpgrade();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<SubLeads>("/api/sub/leads")
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load, account?.trade, account?.market, account?.zips?.join(), account?.plan]);

  const [named, setNamed] = useState(false);
  const shown = useMemo(() => (data?.leads ?? []).filter((p) => !named || p.contractor), [data, named]);
  const byDay = useMemo(() => {
    const groups = new Map<string, Permit[]>();
    for (const p of shown) groups.set(p.issuedDate, [...(groups.get(p.issuedDate) ?? []), p]);
    return [...groups.entries()];
  }, [shown]);
  const withContractor = (data?.leads ?? []).filter((p) => p.contractor).length;

  const daily = data?.plan === "daily";
  const trade = data?.trade ?? account?.trade;

  return (
    <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              {tradeLabel(trade)} leads in {marketName(data?.market ?? account?.market)}
            </h1>
            <p className="mt-1 text-[13px] text-ink-2">
              {daily
                ? "Every new building permit that means work for you, newest first."
                : `This week's ${plans?.freePerWeek ?? 10} best, picked Monday from the last 7 days of permits. Call them before anyone else does.`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={load} busy={loading} aria-label="Refresh">
              <RefreshCw className="size-3.5" />
            </Button>
            <Button size="sm" onClick={() => setView("settings")}>
              Change trade or area
            </Button>
          </div>
        </header>

        {!daily && data && data.availableThisWeek > data.leads.length && (
          <Card className="flex flex-wrap items-center gap-3 border-accent/40 bg-accent-soft/40 p-3.5">
            <div className="min-w-0 flex-1 text-[13px] text-ink">
              <span className="font-semibold">{data.availableThisWeek} leads</span> this week in {marketName(data.market)}. You&apos;re seeing {data.leads.length}. Get every one the morning it&apos;s filed.
            </div>
            <Button variant="primary" size="sm" onClick={() => void upgrade()} busy={busy} disabled={!plans?.payments} title={plans?.payments ? undefined : "Payments aren't set up yet"}>
              Daily leads · {money(plans?.dailyPrice ?? 99)}/mo
            </Button>
          </Card>
        )}

        <SharedLeads />
        {error && <ErrorNote>{error}</ErrorNote>}
        {data && data.leads.length > 0 && (
          <Toggle checked={named} onChange={setNamed}>
            Only leads that name a contractor <span className="text-ink-3">· {withContractor} of {data.leads.length}</span>
          </Toggle>
        )}
        {!trade || !account?.market ? (
          <Empty
            icon={<ClipboardList className="size-8" />}
            title="Pick your trade and area"
            action={
              <Button variant="primary" onClick={() => setView("settings")}>
                Set them up
              </Button>
            }
          >
            We read new building permits from your city every day and pick the ones that mean work for you.
          </Empty>
        ) : !data && loading ? (
          <p className="text-sm text-ink-3">Reading this week&apos;s permits…</p>
        ) : data && data.leads.length === 0 ? (
          <Empty icon={<ClipboardList className="size-8" />} title="No leads this week yet">
            Nothing filed in the last 7 days means work for {tradeLabel(trade).toLowerCase()} in {marketName(data.market)}
            {account.zips?.length ? " in your ZIPs" : ""}. Try a wider area in Settings.
          </Empty>
        ) : daily ? (
          byDay.map(([day, leads]) => (
            <section key={day} className="space-y-2">
              <h2 className="text-[13px] font-semibold text-ink-2">
                {relDay(day)} · {leads.length}
              </h2>
              {leads.map((p) => (
                <LeadCard key={p.id} p={p} trade={trade as TradeId} />
              ))}
            </section>
          ))
        ) : (
          <div className="space-y-2">
            {shown.map((p) => (
              <LeadCard key={p.id} p={p} trade={trade as TradeId} />
            ))}
          </div>
        )}
        <p className="text-xs text-ink-3">
          Permits come from the city&apos;s open-data portal and are public records. A permit is a sign of work, not a request for a quote: introduce yourself, and be useful.
        </p>
      </div>
    </div>
  );
}

const QUOTE_STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "good" }> = {
  sent: { label: "New", tone: "accent" },
  viewed: { label: "Opened", tone: "neutral" },
  submitted: { label: "Quoted", tone: "good" },
};

export function SubQuotesView() {
  const user = useApp((s) => s.user);
  const [list, setList] = useState<(QuoteRequest & { jobTitle: string; dueBy: string; primeCompany: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ requests: NonNullable<typeof list> }>("/api/sub/quotes")
      .then((r) => setList(r.requests))
      .catch((err: Error) => setError(err.message));
  }, []);
  return (
    <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <header>
          <h1 className="text-2xl font-semibold text-ink">Quote requests</h1>
          <p className="mt-1 text-[13px] text-ink-2">Jobs contractors have asked you to price. Open one, enter your prices, send. They go straight into the contractor&apos;s bid.</p>
        </header>
        {error && <ErrorNote>{error}</ErrorNote>}
        {list && list.length === 0 && (
          <Empty icon={<FileSignature className="size-8" />} title="No quote requests yet">
            When a contractor sends a quote link to {user?.email}, it shows up here too.
          </Empty>
        )}
        <ul className="space-y-2">
          {list?.map((q) => (
            <li key={q.token}>
              <a href={`/q/${q.token}`} className="block rounded-xl border border-line bg-panel p-3.5 hover:bg-panel-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-ink">{q.jobTitle}</span>
                  <Badge tone={QUOTE_STATUS[q.status]?.tone ?? "neutral"}>{QUOTE_STATUS[q.status]?.label ?? q.status}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-3">
                  <span>From {q.primeCompany || "a contractor"}</span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3" /> Quote due {q.dueBy}
                  </span>
                  {q.response && <span>You quoted {money(q.response.total, { cents: true })}</span>}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const marketsByState = Object.keys(STATE_NAMES)
  .sort((a, b) => STATE_NAMES[a]!.localeCompare(STATE_NAMES[b]!))
  .map((code) => ({ code, name: STATE_NAMES[code]!, markets: PERMIT_MARKETS.filter((m) => m.state === code) }));

export function SubSettingsView() {
  const user = useApp((s) => s.user);
  const account = useApp((s) => s.account);
  const plans = useApp((s) => s.status?.subPlans);
  const saveAccount = useApp((s) => s.saveAccount);
  const say = useApp((s) => s.say);
  const [form, setForm] = useState<Partial<Account>>(account ?? {});
  const [zips, setZips] = useState((account?.zips ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { upgrade, busy: upgrading } = useUpgrade();
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    if (account) setForm(account);
  }, [account]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveAccount({ company: form.company, trade: form.trade, market: form.market, website: form.website, phone: form.phone, digest: form.digest, zips: zips.split(/[\s,]+/).filter(Boolean) });
      say("Saved");
    } catch (err) {
      say(`Couldn't save: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function portal() {
    setPortalBusy(true);
    try {
      const { url } = await api<{ url: string }>("/api/sub/portal", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      say((err as Error).message);
      setPortalBusy(false);
    }
  }

  return (
    <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-10 px-4 py-6 sm:px-6">
        <header>
          <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        </header>

        <Section title="Account">
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <Avatar name={form.company || user?.name || user?.email || "You"} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{user?.name}</div>
              <div className="truncate text-[13px] text-ink-2">{user?.email}</div>
            </div>
            <Button
              busy={signingOut}
              onClick={async () => {
                setSigningOut(true);
                await flushSaves();
                await authClient.signOut();
                window.location.reload();
              }}
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </Card>
        </Section>

        <Section title="Plan" subtitle="Free gets the week's best leads every Monday. Daily gets every lead the morning it's filed.">
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <CreditCard className="size-5 text-ink-3" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{account?.plan === "daily" ? "Daily leads" : "Free"}</div>
              <div className="text-[13px] text-ink-2">
                {account?.plan === "daily" ? `Every lead, every morning · ${money(plans?.dailyPrice ?? 99)}/month` : `${plans?.freePerWeek ?? 10} leads a week`}
              </div>
            </div>
            {account?.plan === "daily" ? (
              <Button onClick={() => void portal()} busy={portalBusy}>
                Manage billing
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void upgrade()} busy={upgrading} disabled={!plans?.payments}>
                Upgrade · {money(plans?.dailyPrice ?? 99)}/mo
              </Button>
            )}
          </Card>
          {!plans?.payments && <Note tone="warn">Payments aren&apos;t set up on this server yet (STRIPE_SECRET_KEY, STRIPE_PRICE_ID).</Note>}
        </Section>

        <Section title="Your leads">
          <Card className="p-4">
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
              <label className="block">
                <Label>Trade</Label>
                <Select value={form.trade ?? ""} onChange={(e) => setForm({ ...form, trade: (e.target.value || undefined) as Account["trade"] })}>
                  <option value="">Pick one</option>
                  {TRADES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <Label>Area</Label>
                <Select value={form.market ?? ""} onChange={(e) => setForm({ ...form, market: e.target.value || undefined })}>
                  <option value="">Pick a city</option>
                  {marketsByState.map((st) => (
                    <optgroup key={st.code} label={st.name}>
                      {st.markets.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </label>
              <label className="block sm:col-span-2">
                <Label hint="Optional. Leave empty for the whole city">Only these ZIP codes</Label>
                <Input value={zips} onChange={(e) => setZips(e.target.value)} placeholder="78701, 78702" inputMode="numeric" />
              </label>
              <label className="block">
                <Label>Business name</Label>
                <Input value={form.company ?? ""} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </label>
              <label className="block">
                <Label>Phone</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
              </label>
              <label className="block sm:col-span-2">
                <Label hint="Used by Find customers">Website</Label>
                <Input value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="yourcompany.com" />
              </label>
              <div className="sm:col-span-2">
                <Toggle checked={form.digest ?? true} onChange={(digest) => setForm({ ...form, digest })}>
                  Email me my leads {account?.plan === "daily" ? "every morning" : "every Monday"}
                </Toggle>
                {!plans?.email && <p className="mt-1 text-xs text-ink-3">Email isn&apos;t set up on this server yet (RESEND_API_KEY), so leads are here in the app.</p>}
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" busy={busy}>
                  Save
                </Button>
              </div>
            </form>
          </Card>
        </Section>

        <Section title="Find customers">
          <Card className="flex items-center gap-3 p-4 text-[13px] text-ink-2">
            <Sparkles className="size-5 text-accent" />
            Add your website above, then open Find customers: AI reads your site and finds companies with a reason to hire you now.
          </Card>
        </Section>
        <p className="text-xs text-ink-3">Member since {formatDate(account?.createdAt)}.</p>
      </div>
    </div>
  );
}
