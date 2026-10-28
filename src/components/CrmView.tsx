"use client";

import { CalendarClock, ClipboardList, Copy, Globe, Handshake, Mail, MessageSquare, PanelLeft, Phone, Plus, Search, StickyNote, Trash2, Users } from "lucide-react";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { ACTIVITY_KINDS, CRM_STAGES, crmStageLabel, crmSummary, followUpIn, followUpStatus, logActivity } from "@/lib/crm";
import { formatDate, money, pct } from "@/lib/format";
import { permitPitch } from "@/lib/permit-pitch";
import { TRADES } from "@/lib/permit-trades";
import type { CrmActivity, CrmContact, CrmStage, TradeId } from "@/lib/types";
import { usePermits } from "./permits-state";
import { useApp } from "./state";
import { Avatar, Badge, Button, Card, Chip, cx, Empty, Input, Label, NumberInput, Section, Select, Stat, TextArea } from "./ui";

const STAGE_TONE: Record<CrmStage, "neutral" | "accent" | "good" | "warn" | "bad"> = {
  prospect: "neutral",
  contacted: "accent",
  trial: "warn",
  paying: "good",
  lost: "bad",
};

const tradeLabel = (t?: string) => TRADES.find((x) => x.id === t)?.label ?? t ?? "";

function FollowUpBadge({ c }: { c: CrmContact }) {
  const f = followUpStatus(c);
  if (!f) return null;
  if (f === "overdue") return <Badge tone="bad">Follow up overdue</Badge>;
  if (f === "today") return <Badge tone="warn">Follow up today</Badge>;
  return <Badge>Follow up {formatDate(`${c.nextFollowUp}T12:00:00`, { year: undefined })}</Badge>;
}

function ContactItem({ c, active, onClick }: { c: CrmContact; active: boolean; onClick: () => void }) {
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
          {c.monthlyValue ? <span className="shrink-0 text-xs text-ink-3 tabular-nums">{money(c.monthlyValue)}/mo</span> : null}
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-3">{[tradeLabel(c.trade), [c.city, c.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "No details yet"}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge tone={STAGE_TONE[c.stage]}>{crmStageLabel(c.stage)}</Badge>
          <FollowUpBadge c={c} />
        </div>
      </div>
    </button>
  );
}

function AddContact({ onDone }: { onDone: () => void }) {
  const addContact = useApp((s) => s.addContact);
  const selectContact = useApp((s) => s.selectContact);
  const say = useApp((s) => s.say);
  const price = usePermits((s) => s.price);
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
          monthlyValue: price,
        });
        if (existed) say(`${contact.company} is already in your CRM`);
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
          <Select value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="">Other</option>
            {TRADES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
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
          Add contact
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
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const all = useMemo(() => Object.values(contacts), [contacts]);
  const summary = useMemo(() => crmSummary(all), [all]);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const dueIds = new Set(summary.due.map((c) => c.id));
    return all
      .filter((c) => (filter === "all" ? true : filter === "due" ? dueIds.has(c.id) : c.stage === filter))
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
  }, [all, filter, q, summary]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts" aria-label="Search contacts" className="pl-8" />
          </div>
          <Button variant="primary" onClick={() => setAdding((v) => !v)} aria-expanded={adding} aria-label="Add contact" className="px-2.5">
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
      </div>
      {adding && <AddContact onDone={() => setAdding(false)} />}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-ink-2">{all.length ? "No contacts match." : "Contacts you add from permit leads, or by hand, show up here."}</p>
        ) : (
          list.map((c) => <ContactItem key={c.id} c={c} active={c.id === selectedId} onClick={() => selectContact(c.id)} />)
        )}
      </div>
      <div className="border-t border-line px-3 py-2 text-[11px] text-ink-3">
        {list.length} contact{list.length === 1 ? "" : "s"} · only you can see these
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
    <Section title="Activity" subtitle="Log every touch. Most clients say yes on the third or fourth.">
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
        <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={kind === "call" ? "Talked to Mike, wants to see a sample list…" : "What happened?"} aria-label="What happened" />
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

function ContactPitch({ c }: { c: CrmContact }) {
  const profile = useApp((s) => s.profile);
  const say = useApp((s) => s.say);
  const price = usePermits((s) => s.price);
  const guaranteeDays = usePermits((s) => s.guaranteeDays);
  const trade = TRADES.find((t) => t.id === c.trade)?.id as TradeId | undefined;
  if (!trade) return null;
  const pitch = permitPitch({ trade, marketName: c.city || c.state || "your area", contactName: c.contactName, company: c.company, profile: profile ?? undefined, price: c.monthlyValue || price, guaranteeDays });
  return (
    <Section
      title="Pitch"
      subtitle="Open a permit in Permit leads to lead with a real one from their area."
      actions={
        <Button
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(`Subject: ${pitch.subject}\n\n${pitch.body}`)
              .then(() => say("Pitch copied"))
              .catch(() => say("Couldn't copy"))
          }
        >
          <Copy className="size-3.5" /> Copy
        </Button>
      }
    >
      <Card className="p-3">
        <div className="text-[13px] font-medium text-ink">{pitch.subject}</div>
        <pre className="mt-2 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{pitch.body}</pre>
      </Card>
    </Section>
  );
}

function ContactDetail({ c, listButton }: { c: CrmContact; listButton?: ReactNode }) {
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
  const trade = TRADES.find((t) => t.id === c.trade);
  const [name, setName] = useState(c.company);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
        {listButton}
        <div className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
          CRM · <span className="text-ink">{c.company}</span>
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
                className="h-10 border-transparent bg-transparent px-1 text-lg font-semibold hover:border-line-strong" />
              <div className="mt-1 flex flex-wrap gap-3 px-1 text-xs text-ink-2">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-accent">
                    <Phone className="size-3" /> {c.phone}
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
                <span className="text-ink-3">
                  Added {formatDate(c.createdAt)} from {c.source === "permits" ? "permit records" : c.source === "places" ? "Google Maps" : "manual entry"}
                </span>
              </div>
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
            <Field label="Monthly value">
              <NumberInput value={c.monthlyValue ?? 0} onChange={(n) => set({ monthlyValue: n || undefined })} prefix="$" className="[&_input]:h-9" />
            </Field>
            <Field label="Next follow-up">
              <Input type="date" value={c.nextFollowUp ?? ""} onChange={(e) => set({ nextFollowUp: e.target.value || undefined })} />
            </Field>
            <Field label="Trade">
              <Select value={c.trade ?? ""} onChange={(e) => set({ trade: e.target.value || undefined })}>
                <option value="">Other</option>
                {TRADES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
                {c.trade && !trade && <option value={c.trade}>{c.trade}</option>}
              </Select>
            </Field>
          </div>

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
                <TextArea {...text("notes")} rows={3} placeholder="What they care about, what they pay for leads now…" />
              </Field>
            </div>
          </Section>

          <ActivityLog c={c} update={update} />
          <ContactPitch c={c} />

          {trade && c.state && (
            <Button
              onClick={() => {
                setQuery({ state: c.state, source: c.market, trade: trade.id });
                setView("permits");
              }}
            >
              <ClipboardList className="size-4" /> See {trade.label.toLowerCase()} permits {c.city ? `near ${c.city}` : `in ${c.state}`}
            </Button>
          )}

          <div className="border-t border-line pt-6 xl:hidden">
            <CrmOverview />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Right panel: revenue, pipeline and who to call today. */
function CrmOverview() {
  const contacts = useApp((s) => s.contacts);
  const selectContact = useApp((s) => s.selectContact);
  const s = useMemo(() => crmSummary(Object.values(contacts)), [contacts]);
  const max = Math.max(1, ...Object.values(s.byStage));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Monthly revenue" value={money(s.mrr)} hint={`${s.byStage.paying} paying`} tone={s.mrr > 0 ? "good" : undefined} />
        <Stat label="In trial" value={money(s.trialValue)} hint={`${s.byStage.trial} trial${s.byStage.trial === 1 ? "" : "s"}`} />
      </div>
      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">Pipeline</h3>
        <ul className="space-y-1.5">
          {CRM_STAGES.map((st) => (
            <li key={st.id} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-ink-2">{st.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                <div className={cx("h-full rounded-full", st.id === "paying" ? "bg-good" : st.id === "lost" ? "bg-bad/60" : "bg-accent")} style={{ width: `${(s.byStage[st.id] / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right font-medium text-ink tabular-nums">{s.byStage[st.id]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-ink-3">{s.winRate == null ? "Win rate shows once you've pitched someone." : `${pct(s.winRate)} of everyone you've pitched is paying.`}</p>
      </div>
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

  return (
    <div className="relative flex min-w-0 flex-1 overflow-clip">
      <div
        className={cx(
          "z-30 w-[300px] shrink-0 border-r border-line bg-panel",
          "max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:shadow-xl max-lg:transition-transform",
          contact ? (sidebarOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full") : "max-lg:static max-lg:w-full max-lg:shadow-none",
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
                <Empty icon={<Users className="size-8" />} title="Pick a contact">
                  Log calls and emails, set the next follow-up, and move them from prospect to paying.
                </Empty>
                <CrmOverview />
              </div>
            ) : (
              <Empty
                icon={<Users className="size-8" />}
                title="Your CRM is empty"
                action={
                  <Button variant="primary" onClick={() => setView("permits")}>
                    <ClipboardList className="size-4" /> Find permit leads
                  </Button>
                }
              >
                Add contractors from a permit lead (Add to CRM), or press + to add one by hand. Then track every call until they&apos;re paying.
              </Empty>
            )}
          </div>
        )}
      </div>
      <aside aria-label="CRM summary" className={cx("scroll-thin hidden w-[300px] shrink-0 overflow-y-auto border-l border-line bg-panel", contact && "xl:block")}>
        <div className="p-4">
          <CrmOverview />
        </div>
      </aside>
    </div>
  );
}
