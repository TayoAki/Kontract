# Find Opportunities

## Goal
Build a list of contract opportunities a first-time prime can win by subcontracting the work: services you can understand, posted by an agency that has to spend with small businesses.

## Inputs
- Keyword (optional): a trade or service, e.g. "janitorial", "waste", "landscaping"
- State, NAICS code, set-aside (optional)
- How recent (default: posted in the last 30 days) and minimum days left to respond (default: 5)

## Tool
`GET /api/opportunities` (`src/lib/sam.ts`)

```bash
curl -s "http://localhost:3000/api/opportunities?q=janitorial&state=FL&servicesOnly=1&biddableOnly=1&minDaysToRespond=7"
```

Score results with `fitScore()` in `src/lib/fit-score.ts` (the sidebar shows the same score).

## What makes a good one
1. **A service, not a product.** Product service codes are 4 digits (e.g. `1680`); services start with a letter (e.g. `S222`). Products mean manufacturers, shipping, approved countries and certifications.
2. **Something you understand.** Skip notices with 10+ attachments unless you know the work.
3. **Time to get a quote.** 14+ days is comfortable; under 7 is tight.
4. **Small-business set-aside** (SBA, WOSB, SDVOSB, 8(a), HUBZone).
5. **Open for bids**: Solicitation or Combined Synopsis/Solicitation. Sources Sought means reply with a capability statement to get on the buyer's radar; no price yet.

## Process
1. Search with services-only and open-bids-only on.
2. Rank by fit score, then by contract length (multi-year beats one-off).
3. Track the ones worth pursuing (`PUT /api/deals`, or the Track button). They show up in My bids and Deadlines.
4. Fill the pipeline: the more you submit, the more you win. Aim for several bids a week.

## Edge cases
- **No `SAM_API_KEY`**: the endpoint returns labeled sample data (`source: "sample"`).
- **SAM 429**: daily limit hit. Results are cached for 2 hours; try again tomorrow or use a key with a role (1,000/day).
- **SAM 401/403**: keys expire every 90 days. Regenerate on sam.gov.
- **"Showing the newest 1,000"**: narrow with a keyword, state or NAICS code.

## Learnings
- `ptype` (notice type) isn't sent; filtering happens after one request to save quota.
- The `description` field on a notice is a URL; fetching it costs another request (`POST /api/opportunities/description`, cached for 30 days).
