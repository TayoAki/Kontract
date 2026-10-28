import { tradeById } from "./permit-trades.ts";
import type { Permit, TradeId } from "./types.ts";

// Passing a permit to a subcontractor as a lead, and how to reach the
// customer when the permit has no phone or email (most don't): call the
// contractor running the job, mail the owner or "current resident" at the
// address, or knock. Permits are public records, so "I saw your new pool
// permit" is a normal opener.

export type ReachKind = "call" | "lookup" | "mail" | "door" | "record";

export interface ReachStep {
  kind: ReachKind;
  text: string;
}

/** "5124863800" → "(512) 486-3800"; anything else as given. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw.trim();
}

export function mapUrl(p: Pick<Permit, "address" | "city" | "state" | "zip">): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.address, p.city, p.state, p.zip].filter(Boolean).join(", "))}`;
}

/** How to reach whoever is spending the money, best first, from what the permit has. */
export function reachPlan(p: Pick<Permit, "contractor" | "contractorPhone" | "owner" | "address" | "residential" | "type">, trade?: TradeId): ReachStep[] {
  const work = trade ? tradeById(trade).label.toLowerCase() : "your";
  const steps: ReachStep[] = [];
  if (p.contractor && p.contractorPhone) steps.push({ kind: "call", text: `Call ${p.contractor} at ${formatPhone(p.contractorPhone)}. They're running the job and may sub out the ${work} work or pass your name to the owner.` });
  else if (p.contractor) steps.push({ kind: "lookup", text: `Find ${p.contractor}'s number (search their name and city) and call: they're running the job and may sub out the ${work} work.` });
  if (p.owner) steps.push({ kind: "mail", text: `Mail a short letter to ${p.owner} at ${p.address}: what you saw (the permit), what you do, and a way to reach you.` });
  else steps.push({ kind: "mail", text: `Mail a postcard or letter to "Current resident" at ${p.address}. Mention the permit and what you offer.` });
  if (p.residential !== false) steps.push({ kind: "door", text: "Leave a door hanger or knock when work starts. Crews on site often know who's handling the next trade." });
  steps.push({ kind: "record", text: "Open the city's record: some list the applicant or contractor and their phone even when the data feed doesn't." });
  return steps;
}

export interface LeadSnapshot {
  permitId: string;
  trade: TradeId;
  tradeLabel: string;
  reason: string;
  strength: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
  issuedDate: string;
  type: string;
  description: string;
  value?: number;
  owner?: string;
  contractor?: string;
  contractorPhone?: string;
  contractorLicense?: string;
  relatedPermits: number;
  recordUrl: string;
  mapUrl: string;
  reach: ReachStep[];
  from: { company: string; name: string; email: string; phone: string };
  note?: string;
}

/** What the sub sees on the lead page: the permit and how to reach the customer. */
export function leadSnapshot(p: Permit, trade: TradeId, from: LeadSnapshot["from"], note?: string): LeadSnapshot {
  const tag = p.trades.find((t) => t.trade === trade);
  return {
    permitId: p.id,
    trade,
    tradeLabel: tradeById(trade).label,
    reason: tag?.reason ?? `A ${p.type.split(" · ")[0]!.toLowerCase()} at this address.`,
    strength: tag?.strength ?? "possible",
    address: p.address,
    city: p.city,
    state: p.state,
    zip: p.zip,
    issuedDate: p.issuedDate,
    type: p.type,
    description: p.description.slice(0, 600),
    value: p.value,
    owner: p.owner,
    contractor: p.contractor,
    contractorPhone: p.contractorPhone,
    contractorLicense: p.contractorLicense,
    relatedPermits: p.related?.length ?? 0,
    recordUrl: p.url,
    mapUrl: mapUrl(p),
    reach: reachPlan(p, trade),
    from,
    note: note?.trim().slice(0, 600) || undefined,
  };
}

/** The message that carries the link: short enough for a text. */
export function leadMessage(s: Pick<LeadSnapshot, "tradeLabel" | "address" | "city" | "reason" | "from">, link: string, contactName?: string): string {
  const hi = contactName ? `Hi ${contactName.split(" ")[0]},` : "Hi,";
  return `${hi} a ${s.tradeLabel.toLowerCase()} lead for you: ${s.address}, ${s.city}. ${s.reason} Details and how to reach them: ${link}\n\n${s.from.name || s.from.company}${s.from.company && s.from.name ? `, ${s.from.company}` : ""}`;
}

/** A letter for the property, for permits with no phone or email. */
export function leadLetter(s: Pick<LeadSnapshot, "owner" | "address" | "city" | "state" | "zip" | "type" | "tradeLabel">, sender: { company: string; name: string; phone: string; email: string; website?: string }): string {
  const to = s.owner || "Current resident";
  const work = s.type.split(" · ")[0]!.toLowerCase();
  return `${to}
${s.address}
${[s.city, s.state].filter(Boolean).join(", ")}${s.zip ? ` ${s.zip}` : ""}

Hello,

I saw that the city recently issued a ${work} for your property. Congratulations on the project.

${sender.company || "We"} ${sender.company ? "is" : "are"} a local ${s.tradeLabel.toLowerCase()} company. Projects like yours often need ${s.tradeLabel.toLowerCase()} work once the main job is done, and we'd be glad to give you a free quote whenever the timing is right.

You can reach me at ${[sender.phone, sender.email].filter(Boolean).join(" or ") || "[your phone or email]"}${sender.website ? `, or see our work at ${sender.website}` : ""}.

Thank you,

${sender.name || "[Your name]"}
${sender.company || "[Your company]"}
`;
}
