# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: primes at a desk.** Owners of small businesses that win government service contracts as the prime contractor and hand the work to a local subcontractor. They work on a laptop during the day: find opportunities, price them against past awards, line up a sub, write and submit the proposal. Screens are dense and used often.
- **Secondary: subcontractors on phones.** Local trades (cleaning, roofing, landscaping and so on) who open a quote link or a shared lead from a job site, and who can have their own account for free weekly permit leads (daily on the paid plan), quote requests and an AI customer finder.

## Product Purpose

Kontract helps a small business win government work it can't do with its own crew: every open SAM.gov notice plus state and local bids, scored for how winnable each one is; what the government paid before; local subs found from business listings, past federal winners and the businesses pulling building permits near the job; quote links subs answer online; and a proposal drafted from the bid, the price and the company profile. Success is a submitted bid with a real sub quote behind it, and a bench of subs who answer fast.

## Positioning

The sub-out model end to end: it pairs government bids with the local trades who can do the work, using public permit records to show who is active near the job right now, and keeps the prime's pricing out of everything a sub sees.

## Operating Context

- Weekly rhythm: find and triage bids, research pricing, get sub quotes, submit before the deadline.
- Documents: SAM.gov notices and attachments (Word, Excel, PDF), scopes of work sent to subs, proposals exported to Word or PDF.
- Subs receive links by email or text and open them on phones; they have no account unless they make one.

## Capabilities and Constraints

- Data: SAM.gov daily file (checked hourly), state and local bid feeds, USAspending past awards, city and county permit feeds (checked every 6 hours), Google Places or Apify for businesses, Firecrawl for sub websites and portals, Claude for breakdowns and drafts (fill-in templates without it).
- Accounts: prime and sub roles; each user's bids, profile and bench are private.
- Never put the prime's margin or pricing in anything a subcontractor sees.
- Never invent licenses, past performance or numbers in a proposal; blanks are written as [placeholders].
- The AI customer finder never sends anything and never guesses contact details.

## Brand Commitments

- Name: Kontract.
- Voice: plain English for busy owners; controls name their action; no jargon, key names or env vars on everyday screens.
- Visual direction set by the owner (Oct 2026): feel like shadcn/ui (flat, bordered, quiet), off-white and green, light only, across the signed-in app and the public pages subs open (quote request, shared lead, join). Neumorphism was tried and rejected as too much.

## Evidence on Hand

Real public data only (SAM.gov, USAspending, permit feeds). There are no customer logos, testimonials, case studies or published win rates; do not fabricate any.

## Product Principles

1. The prime's next action is always obvious: what's due, what to price, who to call.
2. What a sub sees is clean, honest and free of the prime's numbers.
3. Show where a fact came from (the document, the feed, the award) instead of asserting it.
4. Dense where primes work, simple where subs tap.
