import { money } from "./format.ts";
import { TRADES, workById } from "./permit-trades.ts";
import type { CompanyProfile, Permit, TradeId, WorkId } from "./types.ts";

// The message that invites a local contractor onto your subcontractor bench:
// free permit leads for their trade every week, plus your jobs to quote. Lead
// with a real permit from their area when there is one.

export interface InviteOptions {
  work: WorkId;
  marketName: string;
  /** A recent permit that means work for this trade. */
  permit?: Permit;
  /** The person you're writing to, if you know their name. */
  contactName?: string;
  /** The business you're writing to. */
  company?: string;
  profile?: Partial<CompanyProfile>;
  /** Where they sign up. */
  joinUrl: string;
  freePerWeek: number;
  dailyPrice: number;
  now?: Date;
}

const or = (v: string | undefined, placeholder: string) => (v && v.trim() ? v.trim() : `[${placeholder}]`);

function greeting(o: Pick<InviteOptions, "contactName" | "company">): string {
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

function hookFor(p: Permit, trade: TradeId, now: Date): string {
  const reason = p.trades.find((t) => t.trade === trade)?.reason;
  const kind = (p.type.split(" · ")[0] || "building").replace(/\s*permits?$/i, "").toLowerCase() || "building";
  const what = `${p.value ? `${money(p.value, { compact: true })} ` : ""}${kind}`;
  let desc = p.description.replace(/[.\s]+$/, "");
  // Shouting feeds read better in sentence case.
  if (desc && desc === desc.toUpperCase()) desc = desc.charAt(0) + desc.slice(1).toLowerCase();
  const snippet = desc ? `: "${desc.slice(0, 90)}${desc.length > 90 ? "…" : ""}"` : "";
  return `${whichList(p.issuedDate, now)} had this one: ${article(what)} ${what} permit at ${p.address}${p.zip ? ` (${p.zip})` : ""}${snippet}.${reason ? ` ${reason}` : ""}`;
}

const isTrade = (w: WorkId): w is TradeId => TRADES.some((t) => t.id === w);

export function subInvite(o: InviteOptions): { subject: string; body: string } {
  const work = workById(o.work);
  const name = or(o.profile?.contactName, "your name");
  const company = or(o.profile?.companyName, "your company");
  const noun = isTrade(o.work) ? TRADES.find((t) => t.id === o.work)!.noun : work.label.toLowerCase();
  const leads = isTrade(o.work)
    ? `\n1. ${o.freePerWeek} new ${noun} leads a week from building permits in ${o.marketName}, free.${o.permit ? ` ${hookFor(o.permit, o.work as TradeId, o.now ?? new Date())}` : ""}\n2. Our jobs to quote. When we have ${noun} work, you get the scope and quote it online in a few minutes. No bidding fees.`
    : `\nWhen we have ${noun} work, you get the scope and quote it online in a few minutes. No bidding fees.`;
  const upsell = isTrade(o.work) ? `\n\nWant every new permit the morning it's filed? That's ${money(o.dailyPrice)}/month, cancel anytime.` : "";
  const body = `Hi ${greeting(o)},

I'm ${name} with ${company}. We win commercial and government service contracts around ${o.marketName} and hire local ${work.plural} to do the work.
${leads}

Join here: ${o.joinUrl}${upsell}

${name}
${or(o.profile?.phone, "phone")}`;
  const subject = isTrade(o.work) ? `Free ${noun} leads in ${o.marketName}, plus jobs to quote` : `${work.label} work to quote in ${o.marketName}`;
  return { subject, body };
}
