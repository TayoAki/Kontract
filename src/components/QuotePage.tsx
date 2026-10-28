"use client";

import { CalendarClock, CheckCircle2, Loader2, MapPin, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import { quoteTotal, type QuoteResponse, type QuoteSnapshot } from "@/lib/quote";
import { Markdown } from "./Markdown";
import { Button, Card, ErrorNote, Input, Label, NumberInput, TextArea, Toggle } from "./ui";

interface Loaded {
  snapshot: QuoteSnapshot;
  status: string;
  response: QuoteResponse | null;
}

/** The page a subcontractor opens from a quote link: the scope, the line items, and a form for their prices. */
export function QuotePage({ token }: { token: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [insured, setInsured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/q/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json()) as Loaded & { error?: string };
        if (!res.ok) throw new Error(body.error || "Couldn't open this quote request.");
        setData(body);
        const r = body.response;
        if (r) {
          setPrices(Object.fromEntries(r.lines.map((l) => [l.id, l.unitPrice])));
          setStartDate(r.startDate ?? "");
          setNotes(r.notes ?? "");
          setContactName(r.contactName ?? "");
          setEmail(r.email ?? "");
          setPhone(r.phone ?? "");
          setInsured(r.insured);
          setSentAt(r.submittedAt);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  const s = data?.snapshot;
  const total = useMemo(() => (s ? quoteTotal(s, Object.entries(prices).map(([id, unitPrice]) => ({ id, unitPrice }))) : 0), [s, prices]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/q/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: s.lines.map((l) => ({ id: l.id, unitPrice: prices[l.id] ?? 0 })), startDate, notes, contactName, email, phone, insured }),
      });
      const body = (await res.json()) as { response?: QuoteResponse; error?: string };
      if (!res.ok) throw new Error(body.error || "Couldn't send your quote.");
      setSentAt(body.response!.submittedAt);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Shell>
        <ErrorNote>{error}</ErrorNote>
      </Shell>
    );
  }
  if (!s) {
    return (
      <Shell>
        <p className="flex items-center gap-2 text-sm text-ink-3">
          <Loader2 className="size-4 animate-spin" /> Opening the quote request…
        </p>
      </Shell>
    );
  }

  const per = s.periodLabel === "year" ? "per year" : "for the job";
  const from = s.prime.company || "A contractor";

  return (
    <Shell>
      <div className="space-y-6">
        {sentAt && (
          <div role="status" className="flex items-start gap-3 rounded-xl bg-good-soft px-4 py-3 text-good">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div className="text-[13px]">
              <div className="font-semibold">Quote sent to {from}.</div>
              <div>
                {money(total, { cents: true })} {per}. You can change your prices below and send again until {s.dueBy}.
              </div>
            </div>
          </div>
        )}
        <header className="space-y-2">
          <p className="text-[13px] text-ink-2">
            Request for quote from <span className="font-medium text-ink">{from}</span> for {s.subName}
          </p>
          <h1 className="text-2xl leading-tight font-semibold text-balance text-ink">{s.jobTitle}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-4 text-ink-3" /> {s.location}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-4 text-ink-3" /> Quote due {s.dueBy}
            </span>
          </div>
          <p className="text-[13.5px] leading-relaxed text-ink">{s.summary}</p>
        </header>

        <form onSubmit={submit} className="space-y-6">
          <Card className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-semibold text-ink">Your prices</h2>
              <p className="text-xs text-ink-3">All-in price per unit: labor, travel, materials, disposal and fees.</p>
            </div>
            <ul className="divide-y divide-line">
              {s.lines.map((l) => (
                <li key={l.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_9rem_7rem] sm:items-center">
                  <div>
                    <div className="text-[13px] font-medium text-ink">{l.description}</div>
                    <div className="text-xs text-ink-3">
                      About {l.quantity.toLocaleString()} {l.unit}
                      {l.quantity === 1 ? "" : "s"} {per}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-ink-2">
                    <NumberInput value={prices[l.id] ?? 0} onChange={(n) => setPrices((p) => ({ ...p, [l.id]: n }))} prefix="$" aria-label={`Price per ${l.unit} for ${l.description}`} className="flex-1" />
                    <span className="shrink-0">/{l.unit}</span>
                  </label>
                  <div className="text-right text-[13px] text-ink tabular-nums">{money((prices[l.id] ?? 0) * l.quantity, { cents: true })}</div>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between gap-2 bg-panel-2 px-4 py-3">
              <span className="text-[13px] font-medium text-ink-2">Total {per}</span>
              <span className="text-lg font-semibold text-ink tabular-nums">{money(total, { cents: true })}</span>
            </div>
            {s.periods > 1 && <p className="px-4 pb-3 text-xs text-ink-3">The contract runs {s.periods} years if every option year is used.</p>}
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-[15px] font-semibold text-ink">About you</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <Label>Your name</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="name" />
              </label>
              <label className="block">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <label className="block">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
              </label>
            </div>
            <label className="block">
              <Label>Earliest start date</Label>
              <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="e.g. two weeks after award" />
            </label>
            <label className="block">
              <Label hint="Optional">Notes</Label>
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Crew size, similar jobs you've done, anything that changes the price…" />
            </label>
            <Toggle checked={insured} onChange={setInsured}>
              I carry liability insurance and can send a certificate and a W-9
            </Toggle>
          </Card>

          {formError && <ErrorNote>{formError}</ErrorNote>}
          <Button type="submit" variant="primary" busy={busy} className="w-full sm:w-auto">
            <Send className="size-4" /> {sentAt ? "Send updated quote" : "Send quote"}
          </Button>
        </form>

        <section className="space-y-2">
          <h2 className="text-[15px] font-semibold text-ink">Scope of work</h2>
          <Card className="p-4">
            <Markdown source={s.scope} />
          </Card>
          {s.requirements.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
              {s.requirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </section>

        <footer className="space-y-1 border-t border-line pt-4 text-[13px] text-ink-2">
          <div>
            Questions? {s.prime.contactName || from}
            {s.prime.email && (
              <>
                {" · "}
                <a href={`mailto:${s.prime.email}`} className="text-accent hover:underline">
                  {s.prime.email}
                </a>
              </>
            )}
            {s.prime.phone && ` · ${s.prime.phone}`}
          </div>
          <div className="text-xs text-ink-3">
            Want new permit leads for your trade every week, free? <a href="/join" className="text-accent hover:underline">Create a free account</a>.
          </div>
        </footer>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <div className="grid size-7 place-items-center rounded-md bg-accent text-xs font-bold text-on-accent">K</div>
          <span className="text-sm font-semibold text-ink">Quote request</span>
        </div>
      </div>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
