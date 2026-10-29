// What a subcontractor's website says about how to reach them and what they
// do: emails, phones, license numbers, services, the area they serve, and
// whether they say they're licensed and insured. Rules over the page text;
// nothing is guessed (an email only counts if it's printed on the page).

export interface SiteFacts {
  url: string;
  emails: string[];
  phones: string[];
  licenses: string[];
  services: string[];
  serviceArea: string | null;
  insured: boolean;
  /** "Since 1998" / "25 years", as written. */
  experience: string | null;
  /** Pages read (home, contact). */
  pages: string[];
  readAt: string;
}

const JUNK_EMAIL = /@(?:example\.|sentry|wixpress|godaddy|domain\.com|email\.com|yourdomain|company\.com)|\.(?:png|jpe?g|gif|webp|svg)$|^(?:noreply|no-reply|donotreply)@/i;

export function findEmails(markdown: string, links: string[] = []): string[] {
  const out = new Set<string>();
  for (const l of links) {
    const m = l.match(/^mailto:([^?]+)/i);
    if (m) out.add(decodeURIComponent(m[1]!).trim().toLowerCase());
  }
  for (const m of markdown.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) out.add(m[0].toLowerCase());
  return [...out].filter((e) => !JUNK_EMAIL.test(e)).slice(0, 5);
}

export function findPhones(markdown: string, links: string[] = []): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    if (d.length === 10 && !/^(\d)\1{9}$/.test(d) && !/^555/.test(d.slice(3))) out.add(`(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`);
  };
  for (const l of links) {
    const m = l.match(/^tel:(.+)/i);
    if (m) add(decodeURIComponent(m[1]!));
  }
  for (const m of markdown.matchAll(/(?<![\d-])(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b/g)) add(m[0]);
  return [...out].slice(0, 4);
}

/** License numbers as printed: "Lic. #1023456", "CSLB 987654", "ROC 312345", "TACLA12345C". */
export function findLicenses(markdown: string): string[] {
  const out = new Set<string>();
  const res = [
    /\b(?:CSLB|ROC|TDLR|TACLA|TECL|RMP|DBPR|CBC|CGC|CFC|CAC|EC|L&I|LNI)\s*(?:Lic(?:ense)?\.?\s*)?(?:#|No\.?|Number)?\s*:?\s*([A-Z]{0,6}\d[\dA-Z-]{3,14})\b/gi,
    /\b(?:(?:Master|Journeyman|Plumbing|Plumber|HVAC|A\/C|Electrical|Electrician|Contractor'?s?|General|Roofing|Irrigation|Mechanical|State)\s+){0,3}Lic(?:ense|\.)?\s*(?:#|No\.?|Number)\s*:?\s*([A-Z]{0,6}-?\d[\dA-Z-]{3,14})\b/gi,
    /\b(TACLA\d{4,6}[A-Z]?|TECL\d{4,6})\b/g,
  ];
  // Sites often print "**License #:**" with the number on the next line.
  const text = markdown.replace(/[*_]/g, "");
  for (const re of res) for (const m of text.matchAll(re)) out.add(m[0].replace(/\s+/g, " ").trim());
  // "Lic. #1023456" inside "CSLB Lic. #1023456" is the same license.
  const all = [...out];
  return all.filter((x) => !all.some((y) => y !== x && y.includes(x))).slice(0, 5);
}

const SERVICE_WORDS = [
  "fence", "fencing", "gate", "landscap", "lawn", "irrigation", "tree", "pool", "patio", "concrete", "paver", "deck", "roof", "gutter", "siding", "window", "door",
  "blind", "shutter", "solar", "hvac", "air condition", "heating", "furnace", "plumb", "drain", "sewer", "electric", "lighting", "generator", "paint", "drywall",
  "floor", "tile", "cabinet", "countertop", "remodel", "renovation", "addition", "kitchen", "bath", "demolition", "junk", "haul", "clean", "janitorial", "pressure wash",
  "pest", "snow", "asbestos", "abatement", "mold", "insulation", "foundation", "excavat", "grading", "paving", "asphalt", "sealcoat", "masonry", "stucco", "welding",
];

/** Services from the site's headings and short list items. */
export function findServices(markdown: string): string[] {
  const out = new Map<string, string>();
  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/^[#>*\-\s\d.]+/, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim();
    // Headings (not the page title) and list items.
    if (line.length < 3 || line.length > 48 || !/^(#{2,}|[-*] |\d+\. )/.test(raw.trim())) continue;
    if (/contact|about|home|menu|login|call|privacy|terms|blog|review|faq|career|cookie/i.test(line)) continue;
    const lower = line.toLowerCase();
    if (SERVICE_WORDS.some((w) => lower.includes(w))) out.set(lower, line);
    if (out.size >= 10) break;
  }
  return [...out.values()];
}

export function findServiceArea(markdown: string): string | null {
  const m = markdown.match(/\b(?:proudly\s+)?(?:serving|service areas?|areas? (?:we )?serve[ds]?|we serve)\b[:\s]+([^.\n]{3,160})/i);
  return m ? m[1]!.replace(/[*_#]/g, "").replace(/\s+/g, " ").trim() : null;
}

export function siteFacts(url: string, pages: { url: string; markdown: string; links: string[] }[], now: Date = new Date()): SiteFacts {
  const md = pages.map((p) => p.markdown).join("\n\n");
  const links = pages.flatMap((p) => p.links);
  return {
    url,
    emails: findEmails(md, links),
    phones: findPhones(md, links),
    licenses: findLicenses(md),
    services: findServices(md),
    serviceArea: findServiceArea(md),
    insured: /\b(?:licensed|bonded)[,\s&]+(?:and\s+)?(?:bonded[,\s&]+(?:and\s+)?)?insured\b|\bfully insured\b/i.test(md),
    experience: md.match(/\b(?:since|established|est\.?)\s+(19\d\d|20[0-2]\d)\b|\b(\d{1,2})\+?\s+years\s+(?:of\s+)?(?:experience|in business)\b/i)?.[0] ?? null,
    pages: pages.map((p) => p.url),
    readAt: now.toISOString(),
  };
}

/** The site's contact page, if the home page links to one on the same site. */
export function contactPage(home: string, links: string[]): string | null {
  let host: string;
  try {
    host = new URL(home).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const same = links.filter((l) => {
    try {
      const u = new URL(l, home);
      return u.hostname.replace(/^www\./, "") === host && /^https?:$/.test(u.protocol);
    } catch {
      return false;
    }
  });
  return same.find((l) => /\/contact/i.test(l)) ?? same.find((l) => /quote|estimate|about/i.test(l)) ?? null;
}
