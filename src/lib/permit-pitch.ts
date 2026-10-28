import { money } from "./format.ts";
import { tradeById } from "./permit-trades.ts";
import type { CompanyProfile, Permit, TradeId } from "./types.ts";

// The outreach message for selling permit alerts to a contractor: lead with a
// real permit from their area, offer tomorrow's list free, then a monthly
// price with a no-questions refund.

export interface PitchOptions {
  trade: TradeId;
  marketName: string;
  /** A recent permit that means work for this trade. */
  permit?: Permit;
  /** The person you're writing to, if you know their name. */
  contactName?: string;
  /** The business you're writing to. */
  company?: string;
  profile?: Partial<CompanyProfile>;
  price: number;
  guaranteeDays: number;
  now?: Date;
}

const or = (v: string | undefined, placeholder: string) => (v && v.trim() ? v.trim() : `[${placeholder}]`);

function greeting(o: PitchOptions): string {
  if (o.contactName?.trim()) return o.contactName.trim().split(/\s+/)[0]!;
  const company = o.company?.trim().replace(/,?\s+(llc|l\.l\.c\.|inc|co|corp|ltd|pllc)\.?$/i, "");
  if (company) return `${company} team`;
  return "there";
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

function whichList(issued: string, now: Date): string {
  const days = (now.getTime() - Date.parse(`${issued}T12:00:00`)) / 86400000;
  return days <= 2 ? "Yesterday's list" : days <= 8 ? "This week's list" : "A recent list";
}

function hookFor(p: Permit, reason: string | undefined, now: Date): string {
  const kind = (p.type.split(" · ")[0] || "building").replace(/\s*permits?$/i, "").toLowerCase() || "building";
  const what = `${p.value ? `${money(p.value, { compact: true })} ` : ""}${kind}`;
  let desc = p.description.replace(/[.\s]+$/, "");
  // Shouting feeds read better in sentence case.
  if (desc && desc === desc.toUpperCase()) desc = desc.charAt(0) + desc.slice(1).toLowerCase();
  const snippet = desc ? `: "${desc.slice(0, 90)}${desc.length > 90 ? "…" : ""}"` : "";
  return `${whichList(p.issuedDate, now)} had this one: ${article(what)} ${what} permit at ${p.address}${p.zip ? ` (${p.zip})` : ""}${snippet}.${reason ? ` ${reason}` : ""}`;
}

export function permitPitch(o: PitchOptions): { subject: string; body: string } {
  const trade = tradeById(o.trade);
  const p = o.permit;
  const reason = p?.trades.find((t) => t.trade === o.trade)?.reason;
  const name = or(o.profile?.contactName, "your name");
  const company = or(o.profile?.companyName, "your company");
  const hook = p ? hookFor(p, reason, o.now ?? new Date()) : `Every day the city posts new permits that mean work for ${trade.plural}.`;
  const body = `Hi ${greeting(o)},

I'm ${name} with ${company}. Every morning I send ${trade.plural} in ${o.marketName} the new building permits that mean work for them, before anyone else calls.

${hook}

Want tomorrow's list for your area free, no card? After that it's ${money(o.price)}/month, and if you don't land a job from the list in ${o.guaranteeDays} days, I'll refund it in full. No questions asked.

${name}
${or(o.profile?.phone, "phone")}`;
  return { subject: `New ${trade.noun} leads in ${o.marketName}, every morning`, body };
}
