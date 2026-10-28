# Agent Instructions

Kontract helps a small business win government service contracts as the prime contractor: find opportunities, price them against past awards, line up a local subcontractor, and submit a proposal. It also shows who is pulling building permits near each job (Permit leads), keeps a subcontractor bench (the CRM), and has subcontractor accounts: free weekly permit leads (paid daily), quote requests, and an AI customer finder. It follows the same 3-layer setup as the Agentic Workflows template.

## The 3 layers

**1. Directives (what to do)**: SOPs in `directives/`, one per step of the bid workflow. Read the matching directive before doing the task.

| Task | Directive |
|---|---|
| Find opportunities worth bidding | `directives/find_opportunities.md` |
| Check what the government paid before | `directives/research_past_pricing.md` |
| Find, vet and get quotes from subcontractors | `directives/find_subcontractors.md` |
| Price the bid and write the proposal | `directives/write_proposal.md` |
| Permit leads, quote links, the sub bench, sub accounts, the AI finder | No directive yet; see those sections in `README.md` |

**2. Orchestration (you)**: read the directive, call the tools in order, handle errors, ask the user when a decision is theirs (which bid to pursue, which sub to pick, the final price).

**3. Execution (deterministic tools)**: TypeScript in `src/lib/`, exposed over HTTP by `src/app/api/`. With the app running (`npm run dev`, port 3000), call the endpoints listed in `README.md` instead of re-implementing them. Use `curl`, not hand-written scraping. They need a session: sign in with `curl -c` first (see README) and pass the cookie jar.

| Module | Does |
|---|---|
| `src/lib/sam-bulk.ts` | SAM.gov's daily file: download, index, hourly freshness check, search (plus state/local bids), descriptions |
| `src/lib/sled-sources.ts`, `sled.ts` | State and local bid feeds (Socrata): row → Opportunity, 3-hourly pull, health |
| `src/lib/csv.ts`, `sam-normalize.ts`, `opportunity-search.ts` | Streaming CSV + encoding, row → Opportunity (merging amendments), filters/sort/paging |
| `src/lib/sam.ts` | SAM.gov API, only for attachment links (needs a key; ~10 requests/day without a role) |
| `src/lib/usaspending.ts`, `pricing-stats.ts` | Past awards, typical per-year price, past winners |
| `src/lib/places.ts` | Local businesses via Google Places or Apify |
| `src/lib/claude.ts`, `prompts.ts` | Breakdown (structured output) and streamed drafts |
| `src/lib/fit-score.ts`, `rules.ts` | Fit score and the no-AI breakdown |
| `src/lib/bid-math.ts` | Sub cost, price, profit, margin, markup |
| `src/lib/templates.ts` | Fill-in drafts when Claude isn't configured |
| `src/lib/permit-sources.ts`, `permit-normalize.ts`, `permit-trades.ts` | The source register (feeds per city, cadence, gaps), row → Permit, grouping by address, which trades a permit is a lead for and how strongly, what work a job needs |
| `src/lib/permits.ts`, `permit-health.ts`, `permit-pitch.ts` | Fetch + cache permits per feed, 6-hourly sync, contractors pulling them near a job; feed health from past checks; the sub invite |
| `src/lib/quote.ts`, `quotes.ts` | Quote links: what a sub sees (no pricing, contacts scrubbed), validating and applying a quote to the bid; the SQLite rows |
| `src/lib/crm.ts` | Sub bench: stages (Found → Contacted → Quoted → Active sub), touches, follow-ups, jobs each sub quoted or won |
| `src/lib/accounts.ts`, `plans.ts`, `sub-leads.ts` | Prime vs sub accounts, invites onto a bench, plan limits, a sub's weekly 10 / daily leads |
| `src/lib/digests.ts`, `digest-email.ts`, `email.ts` | Lead digest emails (Resend), weekly on free and daily on paid |
| `src/lib/stripe.ts`, `stripe-signature.ts` | Daily-plan Checkout, billing portal, webhook → plan |
| `src/lib/prospects.ts`, `prospect-rules.ts` | AI customer finder (Claude + web search/fetch): profile, signals, prospects; cleaning (source required, emails only if on a page read), run limits |
| `src/lib/auth.ts`, `db.ts` | Better Auth accounts (email + password) and the SQLite file `.data/kontract.db` |
| `src/lib/store.ts` | Per-user records in SQLite (deals, profile, bench contacts, account, prospects) and `.data/cache.json` (the SAM.gov index is `.data/sam-opportunities.jsonl`) |

## Operating principles

- **Check for a tool first.** Extend `src/lib/` before writing one-off scripts. Keep business logic there (pure and testable), not in components.
- **Test what you change.** `npm test` (node:test, pure modules only: anything importing `server-only` can't load under node) and `npm run typecheck`. Add a test next to the module for new logic.
- **Self-anneal.** When an API breaks or changes, fix the tool, test it, then update the directive with what you learned (limits, field quirks, timing). Ask before running anything that spends paid credits (Claude, Apify, Google Places) in bulk.
- **Update directives, don't replace them.** They're living SOPs. Don't create or overwrite one without asking.
- **Never put margin or pricing in anything a subcontractor sees** (the quote page is built from `quoteSnapshot` in `quote.ts`; keep it that way), and never invent licenses, past performance or numbers in a proposal. Use `[placeholders]`.
- **The AI finder never sends anything** and never guesses contact details. Each real run spends Claude credits (web search + fetch); test with the sample mode (no key) unless the user OKs a live run.

## Files

- `.data/`: accounts, each user's pipeline and CRM (`kontract.db`), and caches. Never commit; safe to delete caches, never `kontract.db`.
- `.env.local`: API keys (`SAM_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY` / `APIFY_API_TOKEN`, `SOCRATA_APP_TOKEN`, `STRIPE_*`, `RESEND_API_KEY`) and `BETTER_AUTH_SECRET`. Never commit.
- Claude model defaults to `claude-opus-5-5` (`ANTHROPIC_MODEL` overrides).
