"use client";

import { Check, DoorOpen, ExternalLink, FileText, Loader2, Mail, MapPin, Phone, Printer, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { leadLetter, type LeadSnapshot, type ReachKind } from "@/lib/lead-share";
import { Badge, Button, Card, cx, ErrorNote } from "./ui";

const ICON: Record<ReachKind, typeof Phone> = { call: Phone, lookup: Search, mail: Mail, door: DoorOpen, record: FileText };

export interface Sender {
  company: string;
  name: string;
  phone: string;
  email: string;
  website?: string;
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Open a printable letter in a new window. */
export function printLetter(text: string): boolean {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return false;
  w.document.write(`<!doctype html><title>Letter</title><style>body{font:15px/1.6 Georgia,serif;max-width:6.5in;margin:1in auto;white-space:pre-wrap;color:#111}@media print{body{margin:0 auto}}</style><body>${escape(text)}</body>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

/** A lead: the permit, why it's work for this trade, and how to reach whoever is paying. */
export function LeadView({ s, sender, className }: { s: LeadSnapshot; sender?: Sender; className?: string }) {
  const [blocked, setBlocked] = useState(false);
  const facts = [
    ["Issued", new Date(`${s.issuedDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })],
    ["Permit", s.type.split(" · ")[0]],
    ["Job value", s.value ? money(s.value) : "Not listed"],
    ["Owner", s.owner ?? "Not listed"],
    ["Contractor", s.contractor ? `${s.contractor}${s.contractorLicense ? ` · Lic. ${s.contractorLicense}` : ""}` : "Not listed"],
  ];
  const search = s.contractor ? `https://www.google.com/search?q=${encodeURIComponent(`${s.contractor} ${s.city} ${s.state}`)}` : null;
  return (
    <div className={cx("space-y-4", className)}>
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={s.strength === "strong" ? "good" : "accent"}>{s.tradeLabel}</Badge>
          {s.relatedPermits > 0 && <Badge>{s.relatedPermits + 1} permits at this address</Badge>}
        </div>
        <h1 className="mt-2 text-xl font-semibold text-ink">{s.address}</h1>
        <a href={s.mapUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-accent">
          <MapPin className="size-3.5" /> {[s.city, s.state].filter(Boolean).join(", ")} {s.zip} · Map
        </a>
        <p className="mt-2 text-[15px] text-ink">{s.reason}</p>
        {s.description && <p className="mt-1 text-[13px] text-ink-2">{s.description}</p>}
      </div>
      <Card className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <div className="text-xs text-ink-3">{k}</div>
            <div className="truncate text-[13px] font-medium text-ink" title={v}>
              {v}
            </div>
          </div>
        ))}
      </Card>
      <div>
        <h2 className="mb-2 text-[13px] font-semibold text-ink">How to reach them</h2>
        <ol className="space-y-2">
          {s.reach.map((step) => {
            const Icon = ICON[step.kind];
            return (
              <li key={step.kind} className="flex gap-2.5 rounded-lg border border-line bg-panel p-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">{step.text}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {step.kind === "call" && s.contractorPhone && (
                      <a href={`tel:${s.contractorPhone}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-panel px-3 text-xs font-medium text-ink shadow-xs hover:bg-panel-2 pointer-coarse:h-10">
                        <Phone className="size-3.5" /> Call
                      </a>
                    )}
                    {step.kind === "lookup" && search && (
                      <a href={search} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-panel px-3 text-xs font-medium text-ink shadow-xs hover:bg-panel-2 pointer-coarse:h-10">
                        <Search className="size-3.5" /> Search their name
                      </a>
                    )}
                    {step.kind === "mail" && (
                      <Button size="sm" onClick={() => setBlocked(!printLetter(leadLetter(s, sender ?? { company: "", name: "", phone: "", email: "" })))}>
                        <Printer className="size-3.5" /> Print a letter
                      </Button>
                    )}
                    {step.kind === "record" && (
                      <a href={s.recordUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-panel px-3 text-xs font-medium text-ink shadow-xs hover:bg-panel-2 pointer-coarse:h-10">
                        City record <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        {blocked && <p className="mt-1 text-xs text-warn">Allow pop-ups to print the letter.</p>}
      </div>
    </div>
  );
}

/** The page a sub opens from a lead link. */
export function LeadPage({ token }: { token: string }) {
  const [data, setData] = useState<{ snapshot: LeadSnapshot; status: string; toName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/l/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json()) as { snapshot: LeadSnapshot; status: string; toName: string; error?: string };
        if (!res.ok) throw new Error(body.error || "Couldn't open this lead.");
        setData(body);
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  async function answer(a: "taken" | "passed") {
    setBusy(a);
    try {
      const res = await fetch(`/api/l/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: a }) });
      const body = (await res.json()) as { status?: string; error?: string };
      if (!res.ok) throw new Error(body.error || "Couldn't save that.");
      setData((d) => (d ? { ...d, status: body.status! } : d));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const s = data?.snapshot;
  return (
    <div className="min-h-dvh bg-bg">
      <div className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <div className="grid size-7 place-items-center rounded-md bg-accent text-xs font-bold text-on-accent">K</div>
          <span className="text-sm font-semibold text-ink">A lead for {data?.toName ?? "you"}</span>
        </div>
      </div>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {error && <ErrorNote>{error}</ErrorNote>}
        {!s && !error && (
          <p className="flex items-center gap-2 text-[13px] text-ink-3">
            <Loader2 className="size-4 animate-spin" /> Opening the lead…
          </p>
        )}
        {s && (
          <>
            {s.note && (
              <Card className="p-3.5 text-[13px] text-ink">
                <span className="text-ink-3">{s.from.name || s.from.company} says: </span>
                {s.note}
              </Card>
            )}
            <LeadView s={s} />
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-[13px] text-ink-2">
                {data.status === "taken" ? "You're on it. Thanks for letting them know." : data.status === "passed" ? "You passed on this one." : "Will you follow up on this lead?"}
              </div>
              <div className="flex gap-2">
                <Button variant={data.status === "taken" ? "secondary" : "primary"} size="sm" busy={busy === "taken"} onClick={() => void answer("taken")}>
                  <Check className="size-3.5" /> I&apos;m on it
                </Button>
                <Button variant="ghost" size="sm" busy={busy === "passed"} onClick={() => void answer("passed")}>
                  <X className="size-3.5" /> Not for me
                </Button>
              </div>
            </Card>
            <p className="text-xs text-ink-3">
              Sent by {[s.from.name, s.from.company].filter(Boolean).join(", ") || "a Kontract user"}
              {s.from.email && (
                <>
                  {" · "}
                  <a href={`mailto:${s.from.email}`} className="text-accent hover:underline">
                    {s.from.email}
                  </a>
                </>
              )}
              {s.from.phone && <> · {s.from.phone}</>}. Permits are public records from the city.{" "}
              <a href="/join" className="text-accent hover:underline">
                Get 10 free leads a week
              </a>
              .
            </p>
          </>
        )}
      </main>
    </div>
  );
}
