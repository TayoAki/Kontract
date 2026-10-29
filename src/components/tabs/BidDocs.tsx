"use client";

import { AlertTriangle, Check, ExternalLink, FileDown, FileText, ListPlus, Loader2, RefreshCw, ScanLine, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { budgetLabel, daysTo } from "@/lib/bid-details";
import { formatDate, uid } from "@/lib/format";
import type { BidDetails, BidDocument, Cited, Deal } from "@/lib/types";
import { useApp } from "../state";
import { Badge, Button, Card, cx, ErrorNote, Note } from "../ui";

async function post(opportunity: Deal["opportunity"], claude: boolean): Promise<BidDetails> {
  const res = await fetch("/api/opportunities/details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opportunity, claude }),
  });
  const body = (await res.json()) as { details?: BidDetails; error?: string };
  if (!res.ok || !body.details) throw new Error(body.error || "Couldn't read the attachments");
  return body.details;
}

/** Reads the notice's attachments once per deal (free: rules only) and keeps the result on the deal. */
export function useBidDetails(deal: Deal) {
  const updateDeal = useApp((s) => s.updateDeal);
  const [busy, setBusy] = useState<"rules" | "claude" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const o = deal.opportunity;
  const firecrawl = useApp((s) => Boolean(s.status?.firecrawl));
  // SAM.gov attachments are public; state and local bid pages need Firecrawl to render.
  const canRead = !o.isSample && (o.source === "bulk" || (o.source === "sled" && firecrawl));
  const have = deal.details?.noticeId === o.id ? deal.details : undefined;
  const started = useRef<string | null>(null);

  function save(details: BidDetails) {
    updateDeal(deal.id, (d) => ({ ...d, details, opportunity: { ...d.opportunity, attachments: details.documents.map((x) => x.url) } }), { track: false });
  }

  async function read(claude = false) {
    setBusy(claude ? "claude" : "rules");
    setError(null);
    try {
      save(await post(o, claude));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!canRead || have || started.current === o.id) return;
    started.current = o.id;
    void read(false);
  }, [canRead, have, o.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return { details: have, busy, error, read, canRead };
}

function Source({ c }: { c: Cited<unknown> }) {
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer list-none text-[11px] text-ink-3 hover:text-ink-2">
        <span className="underline decoration-dotted underline-offset-2">Where it says so</span>
      </summary>
      <blockquote className="mt-1 border-l-2 border-line-strong pl-2 text-[12px] leading-snug text-ink-2">
        “{c.quote}”<span className="mt-0.5 block text-[11px] text-ink-3">{c.doc}</span>
      </blockquote>
    </details>
  );
}

function Fact({ label, value, c, tone, sub }: { label: string; value: React.ReactNode; c?: Cited<unknown> | null; tone?: "warn" | "bad" | "good"; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={cx("text-[13px] font-medium", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink")}>{value}</dd>
      {sub && <div className="text-[11px] text-ink-3">{sub}</div>}
      {c && <Source c={c} />}
    </div>
  );
}

const day = (iso: string) => formatDate(`${iso}T12:00:00`, { weekday: "short" });

function DocList({ docs }: { docs: BidDocument[] }) {
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {docs.map((d) => (
        <li key={d.id}>
          <a
            href={d.url}
            target="_blank"
            rel="noreferrer"
            title={d.note ?? (d.pages ? `${d.pages} pages` : undefined)}
            className="flex items-start gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink-2 hover:border-line-strong hover:text-ink"
          >
            {d.read === "read" ? (
              <Check className="mt-px size-3.5 shrink-0 text-good" aria-label="Read" />
            ) : d.read === "scanned" ? (
              <ScanLine className="mt-px size-3.5 shrink-0 text-warn" aria-label="Scanned" />
            ) : d.read === "failed" ? (
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-warn" aria-label="Couldn't read" />
            ) : (
              <FileDown className="mt-px size-3.5 shrink-0 text-ink-3" aria-label="Not read" />
            )}
            <span className="min-w-0">
              <span className="line-clamp-2 break-words">{d.name}</span>
              {(d.note || d.pages) && <span className="block text-[11px] text-ink-3">{d.note ?? `${d.pages} pages`}</span>}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The facts that decide the bid, read from the notice's attachments. */
export function BidDocs({ deal }: { deal: Deal }) {
  const o = deal.opportunity;
  const claude = useApp((s) => Boolean(s.status?.claude));
  const updateDeal = useApp((s) => s.updateDeal);
  const say = useApp((s) => s.say);
  const { details: d, busy, error, read, canRead } = useBidDetails(deal);

  if (!canRead) {
    return (
      <a href={o.samUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
        See {o.source === "sled" ? "documents" : "attachments"} on {o.portal ?? "SAM.gov"} <ExternalLink className="size-3.5" />
      </a>
    );
  }
  if (!d) {
    return (
      <div className="space-y-2">
        {error ? (
          <>
            <ErrorNote>{error}</ErrorNote>
            <Button size="sm" onClick={() => void read(false)} busy={busy === "rules"}>
              <RefreshCw className="size-3.5" /> Try again
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-ink-3">
            <Loader2 className="size-4 animate-spin" /> {o.source === "sled" ? `Reading the bid page on ${o.portal ?? "the portal"}…` : "Reading the attachments on SAM.gov…"}
          </p>
        )}
      </div>
    );
  }

  const readCount = d.documents.filter((x) => x.read === "read").length;
  const visitDays = d.siteVisit?.value.date ? daysTo(d.siteVisit.value.date) : null;
  const qDays = d.questionsDue?.value ? daysTo(d.questionsDue.value) : null;
  const facts = [
    d.budget && <Fact key="budget" label={d.budget.value.kind === "magnitude" ? "Their budget range" : d.budget.value.kind === "ceiling" ? "Ceiling" : "Their estimate"} value={budgetLabel(d.budget.value)} c={d.budget} sub={d.budget.value.kind === "magnitude" ? "Construction bids must disclose this range" : undefined} />,
    d.bonds && <Fact key="bonds" label="Bonds" value={d.bonds.value.length ? d.bonds.value.join(", ") : "Not required"} c={d.bonds} tone={d.bonds.value.length ? "warn" : "good"} />,
    d.siteVisit && (
      <Fact
        key="visit"
        label={d.siteVisit.value.mandatory ? "Site visit (required)" : "Site visit"}
        value={d.siteVisit.value.date ? day(d.siteVisit.value.date) : "Scheduled; see the notice"}
        tone={visitDays != null && visitDays < 0 ? (d.siteVisit.value.mandatory ? "bad" : "warn") : undefined}
        sub={visitDays != null && visitDays < 0 ? "Already happened" : undefined}
        c={d.siteVisit}
      />
    ),
    d.questionsDue?.value && <Fact key="questions" label="Questions due" value={day(d.questionsDue.value)} tone={qDays != null && qDays < 0 ? "warn" : undefined} sub={qDays != null && qDays < 0 ? "Passed" : qDays != null ? `${qDays} day${qDays === 1 ? "" : "s"} left` : undefined} c={d.questionsDue} />,
    d.period && <Fact key="period" label="How long" value={d.period.value} c={d.period} />,
    d.evaluation && <Fact key="eval" label="How they pick" value={d.evaluation.value.split(":")[0]} sub={d.evaluation.value.split(": ")[1]} c={d.evaluation} />,
    d.sizes[0] && <Fact key="size" label="Size" value={d.sizes.slice(0, 2).map((s) => s.value).join(" · ")} c={d.sizes[0]} />,
    d.wageDeterminations.length > 0 && <Fact key="wd" label="Wage rates" value={d.wageDeterminations.join(", ")} sub="Pay at least these rates; tell your sub" />,
  ].filter(Boolean);

  const r = d.reading;
  function applyScope() {
    if (!r?.scope.length) return;
    updateDeal(deal.id, (x) => ({
      ...x,
      pricing: {
        ...x.pricing,
        lines: r.scope.map((s) => ({ id: uid("line"), description: s.description, unit: s.unit ?? "lump sum", quantity: s.quantity ?? 1, subCost: 0, price: 0 })),
      },
    }));
    say("Pricing lines set from the scope. Add your sub's prices on Past pricing.");
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-3">
            Read {readCount} of {d.documents.length} {o.source === "sled" ? "document" : "attachment"}{d.documents.length === 1 ? "" : "s"} and {o.source === "sled" ? `the ${o.portal ?? "portal"} page` : "the notice"} · {formatDate(d.readAt, { year: undefined, hour: "numeric", minute: "2-digit" })}
          </p>
          {busy === "rules" && <Loader2 className="size-3.5 animate-spin text-ink-3" />}
        </div>
        {facts.length > 0 ? <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{facts}</dl> : <p className="text-[13px] text-ink-2">No budget, bonds, dates or sizes stated in what we could read.</p>}
        {d.requirements.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">What the job requires</div>
            <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {d.requirements.map((q) => (
                <li key={q.value} className="text-[13px] text-ink-2">
                  {q.value}
                  <Source c={q} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {(d.forms.length > 0 || d.priceForm) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {d.forms.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">Fill in and send back</div>
                <ul className="space-y-1 text-[13px] text-ink-2">
                  {d.forms.map((f) => (
                    <li key={f} className="flex gap-2">
                      <FileText className="mt-0.5 size-3.5 shrink-0 text-ink-3" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.priceForm && (
              <div>
                <div className="mb-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">The price form asks for</div>
                <p className="text-[13px] text-ink-2">
                  {d.priceForm.rows.slice(0, 8).join(" · ")}
                  {d.priceForm.rows.length > 8 && <span className="text-ink-3"> · and {d.priceForm.rows.length - 8} more</span>}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-3">{d.priceForm.doc}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold text-ink">The scope, item by item</div>
            <p className="text-xs text-ink-3">{r ? "Claude's reading of the documents. Every item quotes where it came from." : "Claude reads the scope, bid items and price form so you can price it and send it to subs."}</p>
          </div>
          {claude && (
            <Button size="sm" variant={r ? "ghost" : "primary"} busy={busy === "claude"} onClick={() => void read(true)}>
              {r ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />} {r ? "Read again" : "Read the scope with Claude"}
            </Button>
          )}
        </div>
        {busy === "claude" && <p className="text-xs text-ink-3">Reading {readCount} documents. This takes a minute…</p>}
        {error && busy === null && d && <ErrorNote>{error}</ErrorNote>}
        {r ? (
          <div className="space-y-4">
            <p className="text-[14px] leading-relaxed text-ink">{r.summary}</p>
            {r.scope.length > 0 && (
              <div>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {r.scope.map((s) => (
                    <li key={s.description} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-[13px] text-ink">{s.description}</div>
                        <Source c={{ value: s.description, quote: s.quote, doc: s.doc }} />
                      </div>
                      <div className="shrink-0 text-right text-xs text-ink-2 tabular-nums">{s.quantity != null ? `${s.quantity.toLocaleString()} ${s.unit ?? ""}` : <span className="text-ink-3">Qty not stated</span>}</div>
                    </li>
                  ))}
                </ul>
                <Button size="sm" className="mt-2" onClick={applyScope}>
                  <ListPlus className="size-3.5" /> Use as pricing lines
                </Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Trades needed", r.trades],
                ["Ask your sub", r.questions],
                ["Risks", r.risks],
              ].map(([title, items]) =>
                (items as string[]).length ? (
                  <div key={title as string}>
                    <div className={cx("mb-1 text-xs font-semibold tracking-wide uppercase", title === "Risks" ? "text-warn" : "text-ink-3")}>{title as string}</div>
                    <ul className="space-y-1 text-[13px] text-ink-2">
                      {(items as string[]).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          </div>
        ) : !claude ? (
          <Note>The facts above come straight from the documents. An item-by-item scope list needs AI reading, which is off on this site (see Settings).</Note>
        ) : null}
      </Card>

      <div>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
          Attachments <Badge>{d.documents.length}</Badge>
        </div>
        {d.documents.length ? (
          <DocList docs={d.documents} />
        ) : o.source === "sled" ? (
          <p className="text-[13px] text-ink-2">
            The documents aren&apos;t public on this page (most portals need a free vendor login).{" "}
            <a href={o.samUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
              Open it on {o.portal ?? "the portal"}
            </a>
            .
          </p>
        ) : (
          <p className="text-[13px] text-ink-2">No attachments on this notice.</p>
        )}
      </div>
    </div>
  );
}
