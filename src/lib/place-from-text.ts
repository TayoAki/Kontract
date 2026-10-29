import type { Place } from "./types.ts";

// Many notices leave the place-of-performance fields blank and name the site
// in the text ("The VA Bedford Healthcare System, 200 Springs Road, Bedford,
// MA 01730 is seeking..."). Find that address, skipping the ones that say
// where to send a quote or where the contracting office is.

const STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|PR|GU|VI";
const ADDRESS = new RegExp(String.raw`\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}),\s*(${STATES})\.?,?\s+(\d{5})(?:-\d{4})?\b`, "g");
const NOT_THE_SITE = /submit|send|mail(?:ed|ing)?\s+to|deliver(?:ed)? to|e-?mail|address offers?|issued by|contracting office|contract specialist|point of contact|attn|p\.?\s?o\.?\s+box|remit|invoice/i;
const THE_SITE = /located|place of performance|performed at|work (?:site|location)|services? (?:at|for)|facility|campus|medical center|health ?care system|hospital|station|base|installation|building|site/i;

export function workPlaceFromText(text: string | undefined): Place | null {
  if (!text) return null;
  let fallback: Place | null = null;
  for (const m of text.matchAll(ADDRESS)) {
    const before = text.slice(Math.max(0, m.index! - 140), m.index!);
    if (NOT_THE_SITE.test(before.slice(-90))) continue;
    const place: Place = { city: m[1]!.replace(/^(?:Road|Street|Avenue|Drive|Blvd|Rd|St|Ave|Dr)\s+/i, "").trim(), state: m[2]!, zip: m[3]! };
    if (THE_SITE.test(before)) return place;
    fallback ??= place;
  }
  return fallback;
}
