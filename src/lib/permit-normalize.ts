import { isResidential, isTradeWork, tagTrades } from "./permit-trades.ts";
import type { PermitSource } from "./permit-sources.ts";
import type { Permit, PermitContractor, PermitQuery, PermitResults, TradeId } from "./types.ts";

// Pure helpers: build the SoQL query for a source, turn its rows into
// Permits, and filter/summarize them.

type Row = Record<string, unknown>;

const KEEP_UPPER = /^(n|s|e|w|ne|nw|se|sw|us|fm|cr|sr|hwy|po|llc|inc|ii|iii|iv|adu|hvac|sfr|sfd|ti|rtu|pv)$/i;

/** "1755 N FOREST AVE" → "1755 N Forest Ave"; "otc permit" → "Otc permit"; leaves mixed case alone. */
export function titleCase(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters && !/[A-Z]/.test(letters)) return s.charAt(0).toUpperCase() + s.slice(1);
  if (!letters || letters.replace(/[^A-Z]/g, "").length / letters.length < 0.7) return s;
  return s
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((w) => (KEEP_UPPER.test(w) ? w.toUpperCase() : /\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "url" in (v as Row)) return String((v as Row).url ?? "");
  return String(v)
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^"(.*)"$/, "$1");
}

const EMPTY = /^(n\/?a|none|null|unknown|not applicable|owner|homeowner|self|owner[- /]builder|property owner|same as owner|tbd|-)$/i;
const clean = (v: unknown) => {
  const t = text(v);
  return t && !EMPTY.test(t) ? t : "";
};

/** Job values; $0 and $1 are placeholders some cities use for "not given". */
function num(v: unknown): number | undefined {
  const n = Number.parseFloat(text(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 1 ? n : undefined;
}

/** "2026-10-27T00:00:00.000" or "10/27/26" → "2026-10-27". */
export function permitDate(v: unknown, format: "iso" | "mdyy" = "iso"): string | null {
  const t = text(v);
  if (format === "mdyy") {
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!m) return null;
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${year}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** SoQL $where for permits issued in the last `days` days (through today). */
export function dateWhere(s: PermitSource, days: number, now: Date = new Date()): string {
  const from = new Date(now.getTime() - (days - 1) * 86400000);
  if (s.dateFormat === "mdyy") {
    // Text dates can't be range-compared; list each day, padded and unpadded.
    const values = new Set<string>();
    for (let d = new Date(from); d <= now; d = new Date(d.getTime() + 86400000)) {
      const [y, mo, da] = isoDay(d).split("-") as [string, string, string];
      const yy = y.slice(2);
      values.add(`${mo}/${da}/${yy}`);
      values.add(`${Number(mo)}/${Number(da)}/${yy}`);
    }
    return `${s.date} in (${[...values].map((v) => `'${v}'`).join(", ")})`;
  }
  return `${s.date} >= '${isoDay(from)}T00:00:00' AND ${s.date} <= '${isoDay(now)}T23:59:59'`;
}

function chicagoContacts(row: Row, n: number): { contractor?: string; owner?: string } {
  let contractor: string | undefined;
  let owner: string | undefined;
  for (let i = 1; i <= n; i++) {
    const type = text(row[`contact_${i}_type`]).toUpperCase();
    const name = clean(row[`contact_${i}_name`]);
    if (!name) continue;
    if (!contractor && /CONTRACTOR/.test(type) && !/SELF|OWNER/.test(type)) contractor = name;
    if (!owner && /OWNER/.test(type)) owner = name;
  }
  return { contractor, owner };
}

/** "Paradisa Homes, LLC***MAIN***" → "Paradisa Homes, LLC" (Austin marks a firm's main account). */
const businessName = (name: string) =>
  name
    .replace(/\s*(\*+\s*main\s*\**|\(main\))\s*$/i, "")
    .replace(/\*+/g, "")
    .trim();

export function normalizePermit(s: PermitSource, row: Row): Permit | null {
  const m = s.map;
  const issuedDate = permitDate(row[s.date], s.dateFormat);
  if (!issuedDate) return null;
  const type = [...new Set(m.type.map((f) => titleCase(clean(row[f]))).filter(Boolean))].join(" · ");
  const description = m.description.map((f) => clean(row[f])).find(Boolean) ?? "";
  const rawAddress = m.address.map((f) => text(row[f])).filter(Boolean).join(" ");
  const address = titleCase(rawAddress.split(",")[0]!.replace(/\s+/g, " ").trim());
  const zip = (m.zip ? text(row[m.zip]) : "").match(/\d{5}/)?.[0] ?? rawAddress.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1];
  const value = (m.value ?? []).map((f) => num(row[f])).find((n) => n !== undefined);
  const contacts = s.numberedContacts ? chicagoContacts(row, s.numberedContacts) : {};
  const contractor = contacts.contractor ?? (m.contractor ? clean(row[m.contractor]) : "");
  const owner = contacts.owner ?? (m.owner ? clean(row[m.owner]) : "");
  const useText = (m.use ?? []).map((f) => text(row[f])).join(" ");
  const residential = isResidential(useText) ?? isResidential(`${type} ${description}`);
  const link = m.link ? text(row[m.link]) : "";
  const number = m.number ? text(row[m.number]) : "";
  if (!address && !description) return null;
  return {
    id: `${s.id}:${number || `${issuedDate}:${address}:${description.slice(0, 40)}`}`,
    sourceId: s.id,
    number,
    issuedDate,
    type,
    description,
    address,
    city: titleCase(m.city ? text(row[m.city]) || m.cityDefault || "" : m.cityDefault || ""),
    state: s.state,
    zip,
    value,
    contractor: businessName(contractor) ? titleCase(businessName(contractor)) : undefined,
    contractorPhone: m.contractorPhone ? clean(row[m.contractorPhone]) || undefined : undefined,
    owner: owner ? titleCase(owner) : undefined,
    residential,
    url: /^https?:\/\//.test(link) ? link : s.datasetUrl,
    trades: tagTrades(type, description, residential),
  };
}

/** Apply the user's filters and count permits per trade (before the trade filter). */
export function filterPermits(all: Permit[], q: PermitQuery): Omit<PermitResults, "sources"> {
  const words = (q.q ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const base = all.filter((p) => {
    if (q.residentialOnly && p.residential === false) return false;
    if (q.minValue && (p.value ?? 0) < q.minValue) return false;
    if (q.zip && p.zip !== q.zip) return false;
    if (q.leadsOnly && p.trades.length === 0) return false;
    if (words.length) {
      const hay = `${p.type} ${p.description} ${p.address} ${p.city} ${p.contractor ?? ""} ${p.zip ?? ""}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const byTrade: Partial<Record<TradeId, number>> = {};
  for (const p of base) for (const t of p.trades) byTrade[t.trade] = (byTrade[t.trade] ?? 0) + 1;
  const permits = (q.trade ? base.filter((p) => p.trades.some((t) => t.trade === q.trade)) : base).sort(
    (a, b) => b.issuedDate.localeCompare(a.issuedDate) || (b.value ?? 0) - (a.value ?? 0),
  );
  return { permits, total: permits.length, byTrade, scanned: all.length };
}

export const contractorKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Businesses pulling permits in this market, busiest first. With a trade, only
 * permits that are that trade's own work count (pool permits → pool builders).
 */
export function permitContractors(permits: Permit[], trade?: TradeId): PermitContractor[] {
  const map = new Map<string, PermitContractor>();
  for (const p of permits) {
    if (!p.contractor) continue;
    if (trade && !isTradeWork(trade, p.type, p.description)) continue;
    const key = contractorKey(p.contractor);
    if (!key) continue;
    const c = map.get(key) ?? { key, name: p.contractor, phone: p.contractorPhone, permits: 0, latest: p.issuedDate, types: [] };
    c.permits += 1;
    c.phone ??= p.contractorPhone;
    if (p.issuedDate > c.latest) c.latest = p.issuedDate;
    const type = p.type.split(" · ")[0];
    if (type && !c.types.includes(type) && c.types.length < 3) c.types.push(type);
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => b.permits - a.permits || b.latest.localeCompare(a.latest));
}
