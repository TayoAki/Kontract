# Find Opportunities

## Goal
Build a list of contract opportunities a first-time prime can win by subcontracting the work: services you can understand, posted by an agency that has to spend with small businesses.

## Inputs
- Keyword (optional): a trade or service, e.g. "janitorial", "waste", "landscaping"
- State, NAICS code, set-aside (optional)
- How recent (default: any time) and minimum days left to respond (default: 5)
- Sort: `fit` (default), `deadline` or `newest`

## Tool
`GET /api/opportunities` (`src/lib/sam-bulk.ts` + `src/lib/opportunity-search.ts`). Searches SAM.gov's free daily file of every active notice, held locally: no API key, no rate limit. Keywords match titles and full descriptions. Pages of 100 (`limit`, `offset`).

```bash
curl -s "http://localhost:3000/api/opportunities?q=janitorial&state=FL&servicesOnly=1&biddableOnly=1&minDaysToRespond=7&sort=fit"
```

- Full description for one notice: `POST /api/opportunities/description` `{id}` (local, free).
- Attachment links: `POST /api/opportunities/attachments` `{id, postedDate}`. Needs `SAM_API_KEY`; one SAM.gov API request per notice (cached 7 days).
- Check SAM.gov for a newer file now: `POST /api/opportunities/refresh`.

Score results with `fitScore()` in `src/lib/fit-score.ts` (the sidebar shows the same score).

## What makes a good one
1. **A service, not a product.** Product service codes are 4 digits (e.g. `1680`); services start with a letter (e.g. `S222`). Products mean manufacturers, shipping, approved countries and certifications.
2. **Something you understand.** Skip notices with 10+ attachments unless you know the work. (The daily file doesn't list attachments, so the fit score marks them "not listed" until you list them or open the notice.)
3. **Time to get a quote.** 14+ days is comfortable; under 7 is tight.
4. **Small-business set-aside** (SBA, WOSB, SDVOSB, 8(a), HUBZone).
5. **Open for bids**: Solicitation or Combined Synopsis/Solicitation. Sources Sought means reply with a capability statement to get on the buyer's radar; no price yet.

## Process
1. Search with services-only and open-bids-only on.
2. Rank by fit score, then by contract length (multi-year beats one-off).
3. Track the ones worth pursuing (`PUT /api/deals`, or the Track button). They show up in My bids and Deadlines.
4. Fill the pipeline: the more you submit, the more you win. Aim for several bids a week.

## Edge cases
- **First run**: the server downloads the file at boot (~200 MB, ~10–30 seconds). Searches wait for it; after that it loads from `.data/sam-opportunities.jsonl` in well under a second.
- **Download fails** (offline, SAM.gov down): results fall back to labeled sample data (`source: "sample"`) with the error in `notice`, and it retries every 15 minutes. A saved file keeps being used if a refresh fails.
- **Freshness**: SAM.gov regenerates the file nightly (~03:30 UTC). Notices posted today show up tomorrow. `dataAsOf` on every response says which file you're seeing.
- **Place of performance missing** (most rows): the contracting office's city/state is used and `placeFromOffice` is true, so the state filter can be off for those.
- **Attachments, SAM 429/401/403**: only the attachments endpoint uses the API. Keys without a role allow ~10 requests/day; keys expire every 90 days.

## Learnings
- Source file: `https://sam.gov/api/prod/fileextractservices/v1/api/download/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv?privacy=Public` (303 redirect to a signed S3 URL; override with `SAM_BULK_URL`). A `Range: bytes=0-0` GET returns its `Last-Modified` cheaply; HEAD doesn't work on the signed URL.
- It's Windows-1252 with some UTF-8 pasted into descriptions (`src/lib/csv.ts` decodes both), mixed LF/CRLF, and descriptions contain quoted newlines.
- Deadlines come in four formats (`…-08:00`, no offset, `YYYY-MM-DD`, empty); `SetASideCode` is sometimes `["SBA"]`; titles may start with a PSC code like `Z1DZ--`.
- Each amendment is its own row. On 2026-10-28: 72,060 rows → 10,065 open/recent → 6,846 after merging versions by solicitation number + agency (GSA's Multiple Award Schedule alone had 6,901 rows). 1,232 were open service solicitations. Merged notices carry `versions`; awarded or cancelled solicitations are dropped.
- The SAM.gov search API returns at most 1,000 notices per request and keys without a role get 10 requests/day; that's why search no longer uses it.
