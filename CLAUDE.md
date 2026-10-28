# Agent Instructions

Kontract helps a small business win government service contracts as the prime contractor: find opportunities, price them against past awards, line up a local subcontractor, and submit a proposal. It follows the same 3-layer setup as the Agentic Workflows template.

## The 3 layers

**1. Directives (what to do)**: SOPs in `directives/`, one per step of the bid workflow. Read the matching directive before doing the task.

| Task | Directive |
|---|---|
| Find opportunities worth bidding | `directives/find_opportunities.md` |
| Check what the government paid before | `directives/research_past_pricing.md` |
| Find, vet and get quotes from subcontractors | `directives/find_subcontractors.md` |
| Price the bid and write the proposal | `directives/write_proposal.md` |

**2. Orchestration (you)**: read the directive, call the tools in order, handle errors, ask the user when a decision is theirs (which bid to pursue, which sub to pick, the final price).

**3. Execution (deterministic tools)**: TypeScript in `src/lib/`, exposed over HTTP by `src/app/api/`. With the app running (`npm run dev`, port 3000), call the endpoints listed in `README.md` instead of re-implementing them. Use `curl`, not hand-written scraping.

| Module | Does |
|---|---|
| `src/lib/sam.ts` | SAM.gov search + descriptions (cached; ~10 requests/day without a role) |
| `src/lib/usaspending.ts`, `pricing-stats.ts` | Past awards, typical per-year price, past winners |
| `src/lib/places.ts` | Local businesses via Google Places or Apify |
| `src/lib/claude.ts`, `prompts.ts` | Breakdown (structured output) and streamed drafts |
| `src/lib/fit-score.ts`, `rules.ts` | Fit score and the no-AI breakdown |
| `src/lib/bid-math.ts` | Sub cost, price, profit, margin, markup |
| `src/lib/templates.ts` | Fill-in drafts when Claude isn't configured |
| `src/lib/store.ts` | `.data/kontract.json` (deals, profile) and `.data/cache.json` |

## Operating principles

- **Check for a tool first.** Extend `src/lib/` before writing one-off scripts. Keep business logic there (pure and testable), not in components.
- **Test what you change.** `npm test` (node:test, pure modules only: anything importing `server-only` can't load under node) and `npm run typecheck`. Add a test next to the module for new logic.
- **Self-anneal.** When an API breaks or changes, fix the tool, test it, then update the directive with what you learned (limits, field quirks, timing). Ask before running anything that spends paid credits (Claude, Apify, Google Places) in bulk.
- **Update directives, don't replace them.** They're living SOPs. Don't create or overwrite one without asking.
- **Never put margin or pricing in anything a subcontractor sees**, and never invent licenses, past performance or numbers in a proposal. Use `[placeholders]`.

## Files

- `.data/`: the user's pipeline and caches. Never commit; safe to delete caches.
- `.env.local`: API keys (`SAM_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY` / `APIFY_API_TOKEN`). Never commit.
- Claude model defaults to `claude-opus-5-5` (`ANTHROPIC_MODEL` overrides).
