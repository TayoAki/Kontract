# Find Subcontractors

## Goal
Get at least three quotes from reliable local companies before the bid is due. Never submit without someone who will do the work.

## Inputs
- A tracked deal (opportunity + price lines)
- What kind of company (from the breakdown's `subcontractorSearchTerms`) and where (place of performance)

## Tools
- Scope of work: `POST /api/ai/draft` with `kind: "sow"` (Claude, or `templates.sowTemplate`)
- Local businesses: `POST /api/subcontractors` `{query, location}` (`src/lib/places.ts`)
- Past federal winners of similar work: `recipients()` over `POST /api/pricing` results
- Outreach email + call script per company: `POST /api/ai/draft` with `kind: "outreach"` and `subId`

```bash
curl -s -X POST http://localhost:3000/api/subcontractors -H 'Content-Type: application/json' \
  -d '{"query":"commercial cleaning company","location":"Miami, FL"}'
```

## Process
1. **Tuesday: write the scope of work.** What, where, how often, how long, requirements, what to include in the quote (price per unit matching the line items, availability, 2–3 similar jobs, insurance certificate, W-9), quote due date (a few days before the government's deadline), payment terms (net 30 after each job). No government contact details, no pricing.
2. **Wednesday: call and email.** Search Google Maps-style listings near the work, plus companies that already won this work federally. Shortlist 5+.
3. **Vet with the hunger check**: responds fast, good reviews, real website, professional email, OK with net-30, has similar past jobs. "We're busy, I'll get back to you" means move on.
4. **Thursday: gather quotes.** Enter each quote on the shortlist and press "Use in price" for the one you'll go with; mark it Selected.

## Edge cases
- **No places key**: sample listings are returned (`source: "sample"`), clearly labeled.
- **Apify** runs the actor synchronously and can take 1–2 minutes; Google Places is ~1 second.
- ~10–15% of business websites block scrapers; phone is the fallback.
- A sub that already worked that facility is a strong sign. Ask.

## Learnings
- Service subs are easier than manufacturers: explain once that the government pays net 30 after the work, and you pay them when you're paid.
