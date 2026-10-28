import type { Opportunity } from "./types.ts";

// Pure helpers that turn SAM.gov API payloads into our Opportunity shape.

const SMALL = new Set(["of", "and", "the", "for", "in", "on", "at", "to", "a", "an", "or", "by"]);

/** "VETERANS AFFAIRS, DEPARTMENT OF" → "Department of Veterans Affairs". */
export function prettyName(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  const flipped = s.match(/^(.*),\s*(DEPARTMENT OF( THE)?|OFFICE OF( THE)?)$/i);
  if (flipped) s = `${flipped[2]} ${flipped[1]}`;
  const letters = s.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (letters.length > 0 && upper / letters.length < 0.8) return s; // already mixed case
  return s
    .toLowerCase()
    .split(/(\s+|-|\/|\()/)
    .map((w, i) => {
      if (!/[a-z]/.test(w)) return w;
      if (/\d/.test(w) || /^(usa|us|va|dod|dla|gsa|nasa|faa|epa|hvac|nsn|ii|iii|iv|fy\d*)$/.test(w)) return w.toUpperCase();
      if (i > 0 && SMALL.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}

export interface SamNotice {
  noticeId: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  department?: string;
  subTier?: string;
  office?: string;
  postedDate?: string;
  type?: string;
  baseType?: string;
  typeOfSetAsideDescription?: string | null;
  typeOfSetAside?: string | null;
  responseDeadLine?: string | null;
  naicsCode?: string | null;
  classificationCode?: string | null;
  pointOfContact?: { fullName?: string; title?: string; email?: string; phone?: string }[] | null;
  placeOfPerformance?: {
    city?: { name?: string };
    state?: { code?: string; name?: string };
    zip?: string;
    country?: { code?: string };
  } | null;
  officeAddress?: { city?: string; state?: string; zipcode?: string } | null;
  description?: string | null;
  uiLink?: string;
  resourceLinks?: string[] | null;
}

export function normalizeNotice(n: SamNotice): Opportunity {
  const path = (n.fullParentPathName ?? "").split(".").filter(Boolean);
  const agency = prettyName(path[0] ?? n.department ?? "");
  const office = prettyName(path[path.length - 1] ?? n.office ?? n.subTier ?? "");
  const pop = n.placeOfPerformance;
  const place = pop?.state?.code
    ? { city: pop.city?.name ? prettyName(pop.city.name) : undefined, state: pop.state.code, zip: pop.zip, country: pop.country?.code }
    : { city: n.officeAddress?.city ? prettyName(n.officeAddress.city) : undefined, state: n.officeAddress?.state, zip: n.officeAddress?.zipcode };
  return {
    id: n.noticeId,
    title: prettyName(n.title ?? "Untitled notice"),
    solicitationNumber: n.solicitationNumber ?? "",
    agency,
    office: office === agency ? "" : office,
    postedDate: n.postedDate ? new Date(n.postedDate).toISOString() : new Date().toISOString(),
    responseDeadline: n.responseDeadLine ? new Date(n.responseDeadLine).toISOString() : null,
    type: n.type ?? n.baseType ?? "",
    setAside: n.typeOfSetAsideDescription ?? null,
    setAsideCode: n.typeOfSetAside ?? null,
    naicsCode: n.naicsCode ?? null,
    pscCode: n.classificationCode ?? null,
    placeOfPerformance: place,
    contacts: (n.pointOfContact ?? [])
      .filter((c) => c.fullName || c.email)
      .map((c) => ({ name: c.fullName ?? c.email ?? "", title: c.title, email: c.email, phone: c.phone })),
    attachments: n.resourceLinks ?? [],
    descriptionUrl: n.description && /^https?:\/\//.test(n.description) ? n.description : null,
    description: n.description && !/^https?:\/\//.test(n.description) ? n.description : undefined,
    samUrl: n.uiLink ?? `https://sam.gov/opp/${n.noticeId}/view`,
  };
}

/** Turn the notice's HTML description into readable plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h\d|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

