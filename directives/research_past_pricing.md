# Research Past Pricing

## Goal
Find what the government paid for the same or similar work, ideally the exact previous contract, so the bid is low enough to win and high enough to profit.

## Inputs
- The opportunity (title, NAICS, place of performance, agency)

## Tool
`POST /api/pricing` (`src/lib/usaspending.ts`, stats in `src/lib/pricing-stats.ts`). Free, no key.

```bash
curl -s -X POST http://localhost:3000/api/pricing -H 'Content-Type: application/json' \
  -d '{"query":{"keywords":["grounds maintenance","landscaping"],"naics":"561730","state":"CO","yearsBack":6,"servicesOnly":true},"context":{"agency":"Department of the Interior","state":"CO"}}'
```

Returns `awards` (newest first, same agency + state flagged `likelyRelated`) and `stats` (median and middle-half range per year and per award).

## Process
1. Start with the default query (category keywords from `rules.awardKeywords`, same NAICS, same state).
2. Look for a `likelyRelated` award with a matching description. That's often the previous contract. Use it as the anchor.
3. No close match: compare to the typical per-year price (median of awards that ran a year or more).
4. Too few results: drop the NAICS filter, then the state filter, then shorten the keyword.
5. Price to win: the government usually picks the lowest acceptable price. Being well under the last award still leaves room for profit (one $962k landscaping win replaced a $1.6M contract).

## Edge cases
- Amounts are dollars **obligated so far**. A contract in progress shows less than its full value.
- Short purchase orders aren't yearly prices; the per-year stats skip them when there are 3+ year-long awards.
- Keywords under 3 characters are rejected by USAspending.
- USAspending can take 10–30 seconds. Results are cached for 12 hours.

## Learnings
- `place_of_performance_locations: [{country: "USA", state: "CO"}]` and `naics_codes: {require: ["561730"]}` both work as filters.
- Keyword search hits product buys too (e.g. "formalin" returns DLA supply orders), so filter to service PSC codes for service bids.
