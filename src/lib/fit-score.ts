import { budgetLabel, daysTo } from "./bid-details.ts";
import { daysUntil, formatDate } from "./format.ts";
import type { BidDetails, Opportunity } from "./types.ts";

// Scores an opportunity on the things that make a first bid winnable:
// a service (not a product), something you can understand at a glance,
// enough time to line up a subcontractor, a small-business set-aside, and a
// notice you can actually bid on.

export type Level = "good" | "ok" | "bad";

export interface FitCriterion {
  key: string;
  label: string;
  level: Level;
  detail: string;
  points: number;
  max: number;
}

export interface FitScore {
  score: number;
  verdict: "Strong fit" | "Worth a look" | "Hard pass";
  criteria: FitCriterion[];
}

/** Product service codes are 4 digits (e.g. 6515); service codes start with a letter (e.g. S222). */
export function isServiceCode(psc: string | null | undefined): boolean | null {
  if (!psc) return null;
  const c = psc.trim().charAt(0);
  if (!c) return null;
  return /[A-Za-z]/.test(c);
}

/** Service or product: from the product/service code, else what a state or local feed says. */
export function serviceOf(o: Pick<Opportunity, "pscCode" | "serviceKind">): boolean | null {
  return isServiceCode(o.pscCode) ?? (o.serviceKind ? o.serviceKind !== "product" : null);
}

const SMALL_BUSINESS_SET_ASIDES = /small business|8\(a\)|8a|hubzone|service-disabled|sdvosb|women-owned|wosb|veteran|isbee|indian/i;

export function isSmallBusinessSetAside(o: Pick<Opportunity, "setAside" | "setAsideCode">): boolean {
  const text = `${o.setAside ?? ""} ${o.setAsideCode ?? ""}`;
  if (/^\s*$/.test(text) || /^none/i.test(o.setAside ?? "")) return false;
  return SMALL_BUSINESS_SET_ASIDES.test(text) || /^(SBA|SBP|8A|8AN|HZC|HZS|SDVOSBC|SDVOSBS|WOSB|WOSBSS|EDWOSB|EDWOSBSS|VSA|VSS|ISBEE|IEE)$/i.test(o.setAsideCode ?? "");
}

export function isBiddable(type: string): boolean {
  return /^(solicitation|combined synopsis)/i.test(type.trim());
}

/** Job size from the budget the documents disclose; null when they don't. */
function sizeCriterion(details: BidDetails | undefined): FitCriterion | null {
  const b = details?.budget?.value;
  if (!b) return null;
  const label = budgetLabel(b);
  const top = b.high ?? b.low ?? 0;
  if ((b.low ?? 0) >= 1_000_000) return { key: "simple", label: `Big job: ${label}`, level: "bad", detail: "Expect bonding, a full-time superintendent and a sub who runs jobs this size.", points: 0, max: 20 };
  if (top > 250_000) return { key: "simple", label: `Mid-size job: ${label}`, level: "ok", detail: "Doable with one strong sub. Check they can carry the bonding and insurance.", points: 10, max: 20 };
  return { key: "simple", label: `Small job: ${label}`, level: "good", detail: "A size one local sub can handle.", points: 20, max: 20 };
}

/** Bonds and the site visit: they don't change the score, but they can end a bid. */
function documentFlags(details: BidDetails | undefined, now: Date): FitCriterion[] {
  const out: FitCriterion[] = [];
  const bonds = details?.bonds?.value;
  if (bonds?.length) out.push({ key: "bonds", label: "Bonds required", level: "ok", detail: `${bonds.join(", ")}. Line up a surety before you bid.`, points: 0, max: 0 });
  const visit = details?.siteVisit?.value;
  if (visit?.date) {
    const days = daysTo(visit.date, now);
    const when = formatDate(`${visit.date}T12:00:00`, { year: undefined });
    if (days < 0)
      out.push(
        visit.mandatory
          ? { key: "visit", label: `Missed the required site visit (${when})`, level: "bad", detail: "Bidders had to attend. Ask the contracting officer whether there will be another.", points: 0, max: 0 }
          : { key: "visit", label: `Site visit was ${when}`, level: "ok", detail: "It wasn't required, but read the attendee list and any answers posted after it.", points: 0, max: 0 },
      );
    else out.push({ key: "visit", label: `Site visit ${when}${visit.mandatory ? " (required)" : ""}`, level: visit.mandatory ? "ok" : "good", detail: "Go, or send your sub: you'll price it better.", points: 0, max: 0 });
  }
  return out;
}

/** Building, repair and alteration work (PSC Y/Z, NAICS 23): a licensed contractor does it, and bigger jobs need bonding. */
export function isConstruction(o: Pick<Opportunity, "pscCode" | "naicsCode" | "serviceKind">): boolean {
  return /^[YZ]/i.test(o.pscCode ?? "") || /^23/.test(o.naicsCode ?? "") || o.serviceKind === "construction";
}

export function fitScore(o: Opportunity, now: Date = new Date(), details?: BidDetails): FitScore {
  const criteria: FitCriterion[] = [];

  const service = serviceOf(o);
  criteria.push(
    service === true && isConstruction(o)
      ? { key: "service", label: "Construction or repair", level: "ok", detail: "Doable with a licensed contractor as your sub. Larger jobs need bonding and someone on site.", points: 20, max: 30 }
      : service === true
      ? { key: "service", label: "Service, not a product", level: "good", detail: "A local provider can do the work and wait for net-30 payment.", points: 30, max: 30 }
      : service === false
        ? { key: "service", label: "This is a product buy", level: "bad", detail: "Products mean manufacturers, shipping, approved countries and certifications.", points: 0, max: 30 }
        : { key: "service", label: "Service or product unclear", level: "ok", detail: "The notice doesn't say whether it's a service. Read the description.", points: 15, max: 30 },
  );

  const n = details?.documents.length ?? o.attachments?.length;
  const size = sizeCriterion(details);
  criteria.push(
    size
      ? size
      : n == null
      ? { key: "simple", label: "Attachments not listed", level: "ok", detail: `Open the notice on ${o.portal ?? "SAM.gov"} to see how big the package is.`, points: 10, max: 20 }
      : n <= 3
      ? { key: "simple", label: n === 0 ? "No attachments" : `${n} attachment${n === 1 ? "" : "s"}`, level: "good", detail: "Short package. You can understand the ask quickly.", points: 20, max: 20 }
      : n <= 9
        ? { key: "simple", label: `${n} attachments`, level: "ok", detail: "Medium package. Skim the statement of work first.", points: 10, max: 20 }
        : { key: "simple", label: `${n} attachments`, level: "bad", detail: "Big package. Easy to get lost; skip unless you know this work.", points: 0, max: 20 },
  );

  const days = daysUntil(o.responseDeadline, now);
  criteria.push(
    days == null
      ? { key: "time", label: "No deadline listed", level: "ok", detail: "Check the notice for a response date.", points: 10, max: 20 }
      : days < 0
        ? { key: "time", label: "Deadline passed", level: "bad", detail: "Use it for pricing research instead.", points: 0, max: 20 }
        : days >= 14
          ? { key: "time", label: `${days} days to respond`, level: "good", detail: "Plenty of time to find a sub and get a quote.", points: 20, max: 20 }
          : days >= 7
            ? { key: "time", label: `${days} days to respond`, level: "ok", detail: "Tight but doable. Start calling subs today.", points: 12, max: 20 }
            : { key: "time", label: `${days} day${days === 1 ? "" : "s"} to respond`, level: "bad", detail: "Very little time to get a reliable quote.", points: days >= 3 ? 5 : 0, max: 20 },
  );

  const sb = isSmallBusinessSetAside(o);
  criteria.push(
    sb
      ? { key: "setaside", label: "Small-business set-aside", level: "good", detail: o.setAside ?? "Only small businesses can bid.", points: 15, max: 15 }
      : { key: "setaside", label: "Open to everyone", level: "ok", detail: "No set-aside, so you compete with large companies.", points: 5, max: 15 },
  );

  criteria.push(
    isBiddable(o.type)
      ? { key: "type", label: "Open for bids", level: "good", detail: o.type, points: 15, max: 15 }
      : /award/i.test(o.type)
        ? { key: "type", label: "Already awarded", level: "bad", detail: "Not biddable. Useful to see who won and for how much.", points: 0, max: 15 }
        : { key: "type", label: o.type || "Notice", level: "ok", detail: "Not a bid yet. Reply to get on the buyer's radar before it posts.", points: 5, max: 15 },
  );

  criteria.push(...documentFlags(details, now));

  const score = criteria.reduce((s, c) => s + c.points, 0);
  // A $1M+ job is never a strong first sub-out bid, whatever else lines up.
  const capped = size?.level === "bad" || criteria.some((c) => c.key === "visit" && c.level === "bad");
  const verdict = score >= 75 && !capped ? "Strong fit" : score >= 50 ? "Worth a look" : "Hard pass";
  return { score, verdict, criteria };
}
