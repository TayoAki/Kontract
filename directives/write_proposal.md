# Price the Bid and Write the Proposal

## Goal
Submit a complete, compliant proposal at a price that wins and leaves a margin.

## Inputs
- Tracked deal with a selected subcontractor and their quote
- Company profile (`GET /api/profile`): name, UEI, CAGE, address, contact

## Tools
- Bid math: `src/lib/bid-math.ts` (`bidTotals`, `applyMarkup`, `vsAnchor`)
- Proposal draft: `POST /api/ai/draft` with `kind: "proposal"` (Claude at high effort, or `templates.proposalTemplate`)
- Save: `PUT /api/deals`

## Process
1. **Price it.** For each line: quantity per year, the sub's cost per unit, your price per unit. Set the contract length (base + option years, or one-time job). Start from the default markup (Settings), then check against the past-award anchor:
   - Above the anchor → you'll likely lose on price. Cut the markup.
   - Far below → you may be leaving money on the table.
   - Worked examples: $700 sub → $1,500 per pickup × 15/yr × 5 yrs = $60k profit. Meals at $8/$10/$11 → $10/$12/$15.
2. **Run the pre-submit checklist** on the Proposal tab: price with profit, sub selected, UEI/CAGE filled, past performance (use the sub's similar jobs on a first bid), deadline, and the solicitation's own instructions (forms, page limits, how to submit).
3. **Draft the proposal.** The draft follows the solicitation's instructions when the description gives them; otherwise: company info, cover letter, understanding of the requirement, technical approach (you + your local partner), quality control, past performance, price table, certifications.
4. **Review.** Replace every `[placeholder]`. Never claim licenses, past contracts or certifications you don't have.
5. **Submit** the way the notice says (email to the contracting officer or a portal), a day early. Mark it Submitted; record Won/Lost when you hear back. On a loss, look up who won and for how much.

## Edge cases
- No Claude key: the template draft has the same sections and the exact price table.
- Very long notices: Claude gets the full description text (attachments aren't read; check them yourself).
- If Claude declines a request, the server-side fallback (`fallbacks: "default"`) retries on another model automatically.
