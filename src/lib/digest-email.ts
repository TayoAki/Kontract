import { money } from "./format.ts";
import type { Permit, TradeId } from "./types.ts";

// The email a subscriber gets: their new leads, each with why it's a lead and
// a link to the city's record. Plain text and simple HTML.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface DigestOptions {
  kind: "daily" | "weekly";
  trade: TradeId;
  tradeLabel: string;
  marketName: string;
  leads: Permit[];
  appUrl: string;
  freePerWeek: number;
  dailyPrice: number;
  /** On the free plan: how many leads the week had in all. */
  availableThisWeek?: number;
}

function line(p: Permit, trade: TradeId): { title: string; why: string } {
  const tag = p.trades.find((t) => t.trade === trade);
  const kind = p.type.split(" · ")[0] || "Permit";
  return {
    title: `${p.address}${p.zip ? ` ${p.zip}` : ""} · ${kind}${p.value ? ` · ${money(p.value, { compact: true })}` : ""}`,
    why: [tag?.reason, p.description && `"${p.description.slice(0, 140)}${p.description.length > 140 ? "…" : ""}"`].filter(Boolean).join(" "),
  };
}

export function digestEmail(o: DigestOptions): { subject: string; text: string; html: string } {
  const n = o.leads.length;
  const subject =
    o.kind === "daily"
      ? `${n} new ${o.tradeLabel.toLowerCase()} lead${n === 1 ? "" : "s"} in ${o.marketName}`
      : `Your ${n} best ${o.tradeLabel.toLowerCase()} leads in ${o.marketName} this week`;
  const more =
    o.kind === "weekly" && o.availableThisWeek && o.availableThisWeek > n
      ? `There were ${o.availableThisWeek} ${o.tradeLabel.toLowerCase()} leads in ${o.marketName} this week. Get every one the morning it's filed for ${money(o.dailyPrice)}/month: ${o.appUrl}`
      : "";
  const items = o.leads.map((p) => ({ ...line(p, o.trade), url: p.url, date: p.issuedDate }));
  const text = [
    subject,
    "",
    ...items.flatMap((i, k) => [`${k + 1}. ${i.title} (issued ${i.date})`, `   ${i.why}`, `   ${i.url}`, ""]),
    more,
    `See them all and quote jobs: ${o.appUrl}`,
  ]
    .filter((l, k, a) => !(l === "" && a[k - 1] === ""))
    .join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#1f2328">
<h2 style="font-size:18px;margin:0 0 12px">${esc(subject)}</h2>
${items
  .map(
    (i) => `<div style="padding:10px 0;border-top:1px solid #e5e7eb">
<div style="font-weight:600;font-size:14px">${esc(i.title)}</div>
<div style="font-size:13px;color:#57606a;margin-top:2px">Issued ${esc(i.date)}. ${esc(i.why)}</div>
<a href="${esc(i.url)}" style="font-size:13px;color:#2563eb">City record</a>
</div>`,
  )
  .join("\n")}
${more ? `<p style="font-size:13px;background:#eff6ff;padding:10px;border-radius:8px">${esc(more)}</p>` : ""}
<p style="font-size:13px"><a href="${esc(o.appUrl)}" style="color:#2563eb">Open Kontract</a> to see every lead and the jobs you've been asked to quote.</p>
</div>`;
  return { subject, text, html };
}
