import type { BidDetails, Cited, Opportunity } from "./types.ts";

// Size rules for engine API responses: cited sentences are trimmed to 300
// characters and a details response stays under 200 KB.

export const MAX_QUOTE = 300;
export const MAX_DETAILS_BYTES = 200_000;

const trim = (s: string, max = MAX_QUOTE) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
const cite = <T>(c: Cited<T> | null): Cited<T> | null => (c ? { ...c, quote: trim(c.quote) } : null);

/** BidDetails with every quote trimmed, and lists cut back until the JSON fits. */
export function trimDetails(d: BidDetails, maxBytes = MAX_DETAILS_BYTES): BidDetails {
  const out: BidDetails = {
    ...d,
    budget: cite(d.budget),
    bonds: cite(d.bonds),
    siteVisit: cite(d.siteVisit),
    questionsDue: cite(d.questionsDue),
    period: cite(d.period),
    evaluation: cite(d.evaluation),
    sizes: d.sizes.map((s) => cite(s)!),
    requirements: d.requirements.map((r) => cite(r)!),
    reading: d.reading ? { ...d.reading, scope: d.reading.scope.map((s) => ({ ...s, quote: trim(s.quote) })) } : d.reading,
  };
  const size = () => Buffer.byteLength(JSON.stringify(out));
  // Rarely needed: halve the longest lists until it fits.
  for (let i = 0; i < 12 && size() > maxBytes; i++) {
    out.requirements = out.requirements.slice(0, Math.ceil(out.requirements.length / 2));
    out.sizes = out.sizes.slice(0, Math.ceil(out.sizes.length / 2));
    out.wageDeterminations = out.wageDeterminations.slice(0, Math.ceil(out.wageDeterminations.length / 2));
    out.forms = out.forms.slice(0, Math.ceil(out.forms.length / 2));
    if (out.priceForm) out.priceForm = { ...out.priceForm, rows: out.priceForm.rows.slice(0, Math.ceil(out.priceForm.rows.length / 2)) };
    if (out.reading) out.reading = { ...out.reading, scope: out.reading.scope.slice(0, Math.ceil(out.reading.scope.length / 2)) };
    out.documents = out.documents.slice(0, Math.max(20, Math.ceil(out.documents.length / 2)));
  }
  return out;
}

/** Search results go out without descriptions (fetch one notice for its text). */
export const withoutDescription = (o: Opportunity): Opportunity => {
  const { description: _description, ...rest } = o;
  return rest;
};
