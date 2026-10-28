import { daysUntil } from "./format.ts";
import type { Opportunity } from "./types.ts";

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

const SMALL_BUSINESS_SET_ASIDES = /small business|8\(a\)|8a|hubzone|service-disabled|sdvosb|women-owned|wosb|veteran|isbee|indian/i;

export function isSmallBusinessSetAside(o: Pick<Opportunity, "setAside" | "setAsideCode">): boolean {
  const text = `${o.setAside ?? ""} ${o.setAsideCode ?? ""}`;
  if (/^\s*$/.test(text) || /^none/i.test(o.setAside ?? "")) return false;
  return SMALL_BUSINESS_SET_ASIDES.test(text) || /^(SBA|SBP|8A|8AN|HZC|HZS|SDVOSBC|SDVOSBS|WOSB|WOSBSS|EDWOSB|EDWOSBSS|VSA|VSS|ISBEE|IEE)$/i.test(o.setAsideCode ?? "");
}

export function isBiddable(type: string): boolean {
  return /^(solicitation|combined synopsis)/i.test(type.trim());
}

export function fitScore(o: Opportunity, now: Date = new Date()): FitScore {
  const criteria: FitCriterion[] = [];

  const service = isServiceCode(o.pscCode);
  criteria.push(
    service === true
      ? { key: "service", label: "Service, not a product", level: "good", detail: "A local provider can do the work and wait for net-30 payment.", points: 30, max: 30 }
      : service === false
        ? { key: "service", label: "This is a product buy", level: "bad", detail: "Products mean manufacturers, shipping, approved countries and certifications.", points: 0, max: 30 }
        : { key: "service", label: "Service or product unclear", level: "ok", detail: "No product/service code on the notice. Read the description.", points: 15, max: 30 },
  );

  const n = o.attachments?.length;
  criteria.push(
    n == null
      ? { key: "simple", label: "Attachments not listed", level: "ok", detail: "Open the notice on SAM.gov to see how big the package is.", points: 10, max: 20 }
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

  const score = criteria.reduce((s, c) => s + c.points, 0);
  const verdict = score >= 75 ? "Strong fit" : score >= 50 ? "Worth a look" : "Hard pass";
  return { score, verdict, criteria };
}
