"use client";

import {
  Briefcase,
  CalendarClock,
  ClipboardList,
  Copy,
  Globe,
  Handshake,
  Mail,
  MessageSquare,
  PanelLeft,
  Phone,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { ACTIVITY_KINDS, benchSummary, CRM_STAGES, crmStageLabel, followUpIn, followUpStatus, logActivity, subJobs, type JobOutcome, type SubJob } from "@/lib/crm";
import { formatDate, money, pct } from "@/lib/format";
import { formatPhone } from "@/lib/lead-share";
import { subInvite } from "@/lib/permit-pitch";
import { TRADES, WORK } from "@/lib/permit-trades";
import type { CrmActivity, CrmContact, CrmStage, TradeId, WorkId } from "@/lib/types";
import { Insured, useJoinUrl } from "./PermitDetail";
import { usePermits } from "./permits-state";
import { useApp } from "./state";
import { Avatar, Badge, Button, Card, Chip, cx, Empty, Input, Label, Section, Select, TextArea } from "./ui";
import { WebsiteFacts } from "./WebsiteFacts";

const STAGE_TONE: Record<CrmStage, "neutral" | "accent" | "good" | "warn" | "bad"> = {
  found: "neutral",
  contacted: "accent",
  quoted: "warn",
  active: "good",
  "not-a-fit": "bad",
};

const OUTCOME_LABEL: Record<JobOutcome, string> = {
  shortlisted: "Shortlisted",
  asked: "Asked to quote",
  quoted: "Quoted",
  selected: "Selected",
  won: "Won",
  lost: "Lost",
  declined: "Declined",
};
const OUTCOME_TONE: Record<JobOutcome, "neutral" | "accent" | "good" | "warn" | "bad"> = {
  shortlisted: "neutral",
  asked: "accent",
  quoted: "warn",
  selected: "accent",
  won: "good",
  lost: "bad",
  declined: "neutral",
};

const tradeLabel = (t?: string) => WORK.find((x) => x.id === t)?.label ?? t ?? "";

/** Jobs per contact, from your bids. */
function useJobsByContact(): Map<string, SubJob[]> {
  const contacts = useApp((s) => s.contacts);
  const deals = useApp((s) => s.deals);
  return useMemo(() => {
    const list = Object.values(deals);
    return new Map(Object.values(contacts).map((c) => [c.id, subJobs(c, list)]));
  }, [contacts, deals]);
}

function jobLine(jobs: SubJob[]): string {
  const quoted = jobs.filter((j) => j.quote != null || ["quoted", "selected", "won", "lost"].includes(j.outcome)).length;
  const won = jobs.filter((j) => j.outcome === "won").length;
  return [quoted && `${quoted} quote${quoted === 1 ? "" : "s"}`, won && `${won} won`].filter(Boolean).join(" · ");
}

function FollowUpBadge({ c }: { c: CrmContact }) {
  const f = followUpStatus(c);
  if (!f) return null;
  if (f === "overdue") return <Badge tone="bad">Follow up overdue</Badge>;
  if (f === "today") return <Badge tone="warn">Follow up today</Badge>;
  return <Badge>Follow up {formatDate(`${c.nextFollowUp}T12:00:00`, { year: undefined })}</Badge>;
}

function ContactItem({ c, jobs, active, onClick }: { c: CrmContact; jobs: SubJob[]; active: boolean; onClick: () => void }) {
  const line = jobLine(jobs);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cx("flex w-full gap-3 border-b border-line px-3 py-2.5 text-left transition-colors", active ? "bg-accent-soft/70" : "hover:bg-panel-2")}
    >
      <Avatar name={c.company} size={30} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-ink">{c.company}</span>
          {line && <span className="shrink-0 text-[11px] text-ink-3">{line}</span>}
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-3">{[tradeLabel(c.trade), [c.city, c.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "No details yet"}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge tone={STAGE_TONE[c.stage]}>{crmStageLabel(c.stage)}</Badge>
          {c.source === "signup" && <Badge tone="good">Signed up</Badge>}
          <FollowUpBadge c={c} />
        </div>
      </div>
    </button>
  );
}

function WorkSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Other</option>
      {WORK.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
      {value && !WORK.some((w) => w.id === value) && <option value={value}>{value}</option>}
    </Select>
  );
}

function AddContact({ onDone }: { onDone: () => void }) {
  const addContact = useApp((s) => s.addContact);
  const selectContact = useApp((s) => s.selectContact);
  const say = useApp((s) => s.say);
  const [company, setCompany] = useState("");
  const [trade, setTrade] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  return (
    <form
      className="space-y-2 border-b border-line bg-panel-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!company.trim()) return;
        const [cityName, state] = city.split(",").map((s) => s.trim());
        const { contact, existed } = addContact({
          company,
          trade: trade || undefined,
          phone: phone.trim() || undefined,
          city: cityName || undefined,
          state: state?.toUpperCase().slice(0, 2) || undefined,
        });
        if (existed) say(`${contact.company} is already on your bench`);
        selectContact(contact.id);
        onDone();
      }}
    >
      <label className="block">
        <Label>Company</Label>
        <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Lone Star Fence Co" autoFocus required />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <Label>Trade</Label>
          <WorkSelect value={trade} onChange={setTrade} />
        </label>
        <label>
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </label>
      </div>
      <label className="block">
        <Label>City, state</Label>
        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Austin, TX" />
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={!company.trim()}>
          Add sub
        </Button>
      </div>
    </form>
  );
}

type Filter = CrmStage | "all" | "due";

function ContactList() {
  const contacts = useApp((s) => s.contacts);
  const selectedId = useApp((s) => s.crmSelectedId);
  const selectContact = useApp((s) => s.selectContact);
  const jobsBy = useJobsByContact();
  const [filter, setFilter] = useState<Filter>("all");
  const [trade, setTrade] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const all = useMemo(() => Object.values(contacts), [contacts]);
  const summary = useMemo(() => benchSummary(all), [all]);
  const trades = useMemo(() => Object.keys(summary.byTrade).filter((t) => t !== "Other").sort(), [summary]);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const dueIds = new Set(summary.due.map((c) => c.id));
    return all
      .filter((c) => (filter === "all" ? true : filter === "due" ? dueIds.has(c.id) : c.stage === filter))
      .filter((c) => !trade || c.trade === trade)
      .filter((c) => {
        if (!words.length) return true;
        const hay = `${c.company} ${c.contactName ?? ""} ${c.trade ?? ""} ${tradeLabel(c.trade)} ${c.city ?? ""} ${c.phone ?? ""} ${c.email ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => {
        // Due follow-ups first, then most recently touched.
        const da = dueIds.has(a.id) ? 0 : 1;
        const db = dueIds.has(b.id) ? 0 : 1;
        return da - db || b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [all, filter, trade, q, summary]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your bench" aria-label="Search subs" className="pl-8" />
          </div>
          <Button variant="primary" onClick={() => setAdding((v) => !v)} aria-expanded={adding} aria-label="Add sub" className="px-2.5">
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            All <span className="text-ink-3 tabular-nums">{all.length}</span>
          </Chip>
          {summary.due.length > 0 && (
            <Chip active={filter === "due"} onClick={() => setFilter("due")}>
              Due <span className="text-bad tabular-nums">{summary.due.length}</span>
            </Chip>
          )}
          {CRM_STAGES.map((s) => (
            <Chip key={s.id} active={filter === s.id} onClick={() => setFilter(filter === s.id ? "all" : s.id)}>
              {s.label} <span className="text-ink-3 tabular-nums">{summary.byStage[s.id]}</span>
            </Chip>
          ))}
        </div>
        {trades.length > 1 && (
          <Select value={trade} onChange={(e) => setTrade(e.target.value)} aria-label="Trade" className="h-8 text-xs">
            <option value="">Every trade</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {tradeLabel(t)} ({summary.byTrade[t]})
              </option>
            ))}
          </Select>
        )}
      </div>
      {adding && <AddContact onDone={() => setAdding(false)} />}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-ink-2">{all.length ? "No subs match." : "Subs you add from permits, a bid, or by hand show up here."}</p>
        ) : (
          list.map((c) => <ContactItem key={c.id} c={c} jobs={jobsBy.get(c.id) ?? []} active={c.id === selectedId} onClick={() => selectContact(c.id)} />)
        )}
      </div>
      <div className="border-t border-line px-3 py-2 text-[11px] text-ink-3">
        {list.length} sub{list.length === 1 ? "" : "s"} · only you can see these
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block min-w-0", className)}>
      <Label>{label}</Label>
      {children}
    </label>
  );
}

const ACTIVITY_ICON: Record<CrmActivity["kind"], ComponentType<{ className?: string }>> = {
  call: Phone,
  email: Mail,
  text: MessageSquare,
  meeting: Handshake,
  note: StickyNote,
};

function ActivityLog({ c, update }: { c: CrmContact; update: (fn: (c: CrmContact) => CrmContact) => void }) {
  const [kind, setKind] = useState<CrmActivity["kind"]>("call");
  const [text, setText] = useState("");
  const [follow, setFollow] = useState(2);
  return (
    <Section title="Activity" subtitle="Log every call, text and email. Quotes from the online form log themselves.">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          update((cur) => ({ ...logActivity(cur, kind, text), nextFollowUp: follow ? followUpIn(follow) : cur.nextFollowUp }));
          setText("");
        }}
      >
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind">
          {ACTIVITY_KINDS.map((k) => (
            <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label}
            </Chip>
          ))}
        </div>
        <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={kind === "call" ? "Talked to Mike, can start in two weeks, has a crew of 4…" : "What happened?"} aria-label="What happened" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-2">
            Next follow-up
            <Select value={follow} onChange={(e) => setFollow(Number(e.target.value))} className="h-7 w-auto pr-7 pl-2 text-xs">
              <option value={0}>Keep as is</option>
              <option value={1}>Tomorrow</option>
              <option value={2}>In 2 days</option>
              <option value={7}>In a week</option>
              <option value={30}>In a month</option>
            </Select>
          </label>
          <Button size="sm" variant="primary" type="submit" disabled={!text.trim()}>
            Log {ACTIVITY_KINDS.find((k) => k.id === kind)?.label.toLowerCase()}
          </Button>
        </div>
      </form>
      {c.activities.length === 0 ? (
        <p className="text-[13px] text-ink-3">Nothing logged yet.</p>
      ) : (
        <ol className="space-y-2">
          {c.activities.map((a) => {
            const Icon = ACTIVITY_ICON[a.kind];
            return (
              <li key={a.id} className="flex gap-2.5 rounded-lg border border-line bg-panel px-3 py-2">
                <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] whitespace-pre-wrap text-ink">{a.text}</div>
                  <div className="mt-0.5 text-[11px] text-ink-3">
                    {ACTIVITY_KINDS.find((k) => k.id === a.kind)?.label} · {formatDate(a.at, { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Delete activity"
                  className="self-start text-ink-3 hover:text-bad"
                  onClick={() => update((cur) => ({ ...cur, activities: cur.activities.filter((x) => x.id !== a.id) }))}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

function Jobs({ jobs }: { jobs: SubJob[] }) {
  const open = useApp((s) => s.open);
  return (
    <Section title="Jobs" subtitle="Bids this sub is on, what they quoted, and how it went.">
      {jobs.length === 0 ? (
        <p className="text-[13px] text-ink-3">Not on any bids yet. Shortlist them from a bid&apos;s Subcontractors tab, or send them a quote link.</p>
      ) : (
        <ul className="space-y-1.5">
          {jobs.map((j) => (
            <li key={j.dealId}>
              <button type="button" onClick={() => open(j.dealId, "subs")} className="flex w-full items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-left hover:bg-panel-2">
                <Briefcase className="size-4 shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink">{j.title}</div>
                  <div className="truncate text-[11px] text-ink-3">
                    {j.agency}
                    {j.deadline ? ` · due ${formatDate(j.deadline)}` : ""}
                  </div>
                </div>
                {j.quote != null && <span className="shrink-0 text-xs font-medium text-ink tabular-nums">{money(j.quote)}</span>}
                <Badge tone={OUTCOME_TONE[j.outcome]}>{OUTCOME_LABEL[j.outcome]}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ContactInvite({ c }: { c: CrmContact }) {
  const profile = useApp((s) => s.profile);
  const plans = useApp((s) => s.status?.subPlans);
  const say = useApp((s) => s.say);
  const work = (WORK.find((t) => t.id === c.trade)?.id ?? "general") as WorkId;
  const joinUrl = useJoinUrl(work, c.market);
  const invite = subInvite({
    work,
    marketName: c.city || c.state || "your area",
    contactName: c.contactName,
    company: c.company,
    profile: profile ?? undefined,
    joinUrl,
    freePerWeek: plans?.freePerWeek ?? 10,
    dailyPrice: plans?.dailyPrice ?? 99,
  });
  if (c.source === "signup") return null;
  return (
    <Section
      title="Invite to join"
      subtitle="Free permit leads for their trade, plus your jobs to quote online. Open a permit in Permit leads to lead with a real one."
      actions={
        <Button
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(`Subject: ${invite.subject}\n\n${invite.body}`)
              .then(() => say("Invite copied"))
              .catch(() => say("Couldn't copy"))
          }
        >
          <Copy className="size-3.5" /> Copy
        </Button>
      }
    >
      <Card className="p-3">
        <div className="text-[13px] font-medium text-ink">{invite.subject}</div>
        <pre className="mt-2 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{invite.body}</pre>
      </Card>
    </Section>
  );
}

function ContactDetail({ c, jobs, listButton }: { c: CrmContact; jobs: SubJob[]; listButton?: ReactNode }) {
  const upsertContact = useApp((s) => s.upsertContact);
  const removeContact = useApp((s) => s.removeContact);
  const setView = useApp((s) => s.setView);
  const setQuery = usePermits((s) => s.setQuery);
  const update = (fn: (c: CrmContact) => CrmContact) => {
    const cur = useApp.getState().contacts[c.id];
    if (cur) upsertContact(fn(cur));
  };
  const set = (patch: Partial<CrmContact>) => update((cur) => ({ ...cur, ...patch }));
  const text = (k: keyof CrmContact) => ({
    value: (c[k] as string | undefined) ?? "",
    onChange: (e: { target: { value: string } }) => set({ [k]: e.target.value || undefined }),
  });
  const leadTrade = TRADES.find((t) => t.id === c.trade);
  const [name, setName] = useState(c.company);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
        {listButton}
        <div className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
          Sub bench · <span className="text-ink">{c.company}</span>
        </div>
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            if (window.confirm(`Delete ${c.company} and its activity log?`)) void removeContact(c.id);
          }}
        >
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-8 px-4 py-5 sm:px-6">
          <header className="flex flex-wrap items-start gap-3">
            <Avatar name={c.company} size={44} />
            <div className="min-w-0 flex-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => (name.trim() ? set({ company: name.trim() }) : setName(c.company))}
                aria-label="Company"
                className="h-10 border-transparent bg-transparent px-1 text-lg font-semibold hover:border-line-strong"
              />
              <div className="mt-1 flex flex-wrap items-center gap-3 px-1 text-xs text-ink-2">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-accent">
                    <Phone className="size-3" /> {formatPhone(c.phone)}
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-accent">
                    <Mail className="size-3" /> {c.email}
                  </a>
                )}
                {c.website && (
                  <a href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                    <Globe className="size-3" /> Website
                  </a>
                )}
                {c.license && <Badge>Lic. {c.license}</Badge>}
                <Insured until={c.insuredUntil} />
                <span className="text-ink-3">
                  Added {formatDate(c.createdAt)}{" "}
                  {c.source === "permits" ? "from permit records" : c.source === "places" ? "from Google Maps" : c.source === "signup" ? "when they signed up" : "by hand"}
                </span>
              </div>
              {c.website && (
                <div className="px-1">
                  <WebsiteFacts
                    website={c.website}
                    have={{ email: c.email, phone: c.phone, license: c.license }}
                    onUse={({ email, phone, license }) => set({ ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(license ? { license } : {}) })}
                  />
                </div>
              )}
            </div>
          </header>

          <div className="space-y-2">
            <div className="grid grid-cols-5 gap-1 rounded-lg bg-panel-2 p-1" role="radiogroup" aria-label="Stage">
              {CRM_STAGES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={c.stage === s.id}
                  title={s.hint}
                  onClick={() => set({ stage: s.id })}
                  className={cx("h-8 truncate rounded-md px-1 text-xs font-medium transition-colors", c.stage === s.id ? "bg-panel text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-3">{CRM_STAGES.find((s) => s.id === c.stage)?.hint}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Trade">
              <WorkSelect value={c.trade ?? ""} onChange={(v) => set({ trade: v || undefined })} />
            </Field>
            <Field label="Next follow-up">
              <Input type="date" value={c.nextFollowUp ?? ""} onChange={(e) => set({ nextFollowUp: e.target.value || undefined })} />
            </Field>
            <Field label="License number">
              <Input {...text("license")} />
            </Field>
          </div>

          <Jobs jobs={jobs} />

          <Section title="Contact">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contact name">
                <Input {...text("contactName")} placeholder="Who you talk to" />
              </Field>
              <Field label="Phone">
                <Input {...text("phone")} inputMode="tel" />
              </Field>
              <Field label="Email">
                <Input {...text("email")} type="email" />
              </Field>
              <Field label="Website">
                <Input {...text("website")} />
              </Field>
              <Field label="City">
                <Input {...text("city")} />
              </Field>
              <Field label="State">
                <Input value={c.state ?? ""} onChange={(e) => set({ state: e.target.value.toUpperCase().slice(0, 2) || undefined })} maxLength={2} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input {...text("address")} />
              </Field>
              <Field label="Notes" className="sm:col-span-2">
                <TextArea {...text("notes")} rows={3} placeholder="Crew size, insurance, what work they want, how fast they answer…" />
              </Field>
            </div>
          </Section>

          <ActivityLog c={c} update={update} />
          <ContactInvite c={c} />

          {leadTrade && c.state && (
            <Button
              onClick={() => {
                setQuery({ state: c.state, market: c.market, trade: leadTrade.id as TradeId });
                setView("permits");
              }}
            >
              <ClipboardList className="size-4" /> See {leadTrade.label.toLowerCase()} permits {c.city ? `near ${c.city}` : `in ${c.state}`}
            </Button>
          )}

          <div className="border-t border-line pt-6 xl:hidden">
            <BenchOverview />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Right panel: the bench by stage and trade, quote rate, and who to call today. */
function BenchOverview() {
  const contacts = useApp((s) => s.contacts);
  const selectContact = useApp((s) => s.selectContact);
  const s = useMemo(() => benchSummary(Object.values(contacts)), [contacts]);
  const max = Math.max(1, ...Object.values(s.byStage));
  const trades = Object.entries(s.byTrade).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
          <div className="text-xs text-ink-2">Active subs</div>
          <div className="mt-1 text-lg font-semibold text-good tabular-nums">{s.byStage.active}</div>
        </div>
        <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
          <div className="text-xs text-ink-2">Quote rate</div>
          <div className="mt-1 text-lg font-semibold text-ink tabular-nums">{s.quoteRate == null ? "—" : pct(s.quoteRate)}</div>
          <div className="mt-0.5 text-[11px] text-ink-3">of subs you reached</div>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Pipeline</h3>
        <ul className="space-y-1.5">
          {CRM_STAGES.map((st) => (
            <li key={st.id} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-ink-2">{st.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                <div className={cx("h-full rounded-full", st.id === "active" ? "bg-good" : st.id === "not-a-fit" ? "bg-bad/60" : "bg-accent")} style={{ width: `${(s.byStage[st.id] / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right font-medium text-ink tabular-nums">{s.byStage[st.id]}</span>
            </li>
          ))}
        </ul>
      </div>
      {trades.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">By trade</h3>
          <div className="flex flex-wrap gap-1.5">
            {trades.map(([t, n]) => (
              <Badge key={t}>
                {t === "Other" ? "Other" : tradeLabel(t)} · {n}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Follow up today</h3>
        {s.due.length === 0 ? (
          <p className="mt-1 text-xs text-ink-3">Nobody&apos;s waiting on you.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {s.due.slice(0, 8).map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => selectContact(c.id)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-panel-2">
                  <CalendarClock className={cx("size-3.5 shrink-0", followUpStatus(c) === "overdue" ? "text-bad" : "text-warn")} />
                  <span className="min-w-0 flex-1 truncate text-ink">{c.company}</span>
                  <span className="shrink-0 text-ink-3">{c.phone ?? crmStageLabel(c.stage)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CrmView() {
  const contact = useApp((s) => (s.crmSelectedId ? (s.contacts[s.crmSelectedId] ?? null) : null));
  const hasContacts = useApp((s) => Object.keys(s.contacts).length > 0);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const setSidebarOpen = useApp((s) => s.setSidebarOpen);
  const setView = useApp((s) => s.setView);
  const jobsBy = useJobsByContact();

  return (
    <div className="relative flex min-w-0 flex-1 overflow-clip">
      <div
        className={cx(
          "z-30 w-[300px] shrink-0 border-r border-line bg-panel",
          "max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:transition-transform",
          contact ? (sidebarOpen ? "max-lg:translate-x-0 max-lg:shadow-lg" : "max-lg:-translate-x-full") : "max-lg:static max-lg:w-full max-lg:shadow-none",
        )}
      >
        <ContactList />
      </div>
      {sidebarOpen && contact && (
        <button type="button" aria-label="Close list" className="absolute inset-0 z-20 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={cx("flex min-w-0 flex-1", !contact && "max-lg:hidden")}>
        {contact ? (
          <ContactDetail
            key={contact.id}
            c={contact}
            jobs={jobsBy.get(contact.id) ?? []}
            listButton={
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Show list">
                <PanelLeft className="size-4" /> List
              </Button>
            }
          />
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            {hasContacts ? (
              <div className="w-full max-w-md space-y-6">
                <Empty icon={<Users className="size-8" />} title="Pick a sub">
                  See their jobs and quotes, log calls, set the next follow-up, and move them from found to active.
                </Empty>
                <BenchOverview />
              </div>
            ) : (
              <Empty
                icon={<Users className="size-8" />}
                title="Your bench is empty"
                action={
                  <Button variant="primary" onClick={() => setView("permits")}>
                    <ClipboardList className="size-4" /> Find subs in permit records
                  </Button>
                }
              >
                The businesses pulling permits near you are working right now. Add them from Permit leads, from a bid&apos;s Subcontractors tab, or press + to add one by hand.
              </Empty>
            )}
          </div>
        )}
      </div>
      <aside aria-label="Bench summary" className={cx("scroll-thin hidden w-[300px] shrink-0 overflow-y-auto border-l border-line bg-panel", contact && "xl:block")}>
        <div className="p-4">
          <BenchOverview />
        </div>
      </aside>
    </div>
  );
}
