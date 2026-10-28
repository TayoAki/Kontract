# Kontract

Find government contracts you can win, see what the government paid for the same work before, line up a local subcontractor, put your price on top, and send the proposal.

![Kontract workspace](docs/screenshot.png)

It's built around the playbook for winning your first contract with no experience:

1. **Pick work you understand.** Services, not products. Few attachments. A small-business set-aside. At least a week to respond.
2. **Check past pricing.** Every federal award is public on USAspending.gov. Find the last contract for this work and price against it.
3. **Get a subcontractor's quote before you bid.** Send them a scope of work, then call. Pick the hungry ones who answer fast.
4. **Put your price on top.** The government usually picks the lowest price, so stay under past awards and still keep a margin.
5. **Submit, and keep submitting.** It's a numbers game. Monday find, Tuesday write scopes, Wednesday call subs, Thursday gather quotes, Friday look again.

## Quick start

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Open http://localhost:3000. Everything works without keys: real SAM.gov opportunities (from the daily file), real USAspending pricing, sample subcontractor listings and fill-in templates. The first start takes 10–30 seconds to download SAM.gov's file. Add keys to `.env.local` and restart to switch the rest to live data.

| Key | Unlocks | How to get it |
|---|---|---|
| — | Live opportunities and full descriptions: every active SAM.gov notice, from SAM.gov's free daily file | No key needed. The server downloads the file (~200 MB) at startup, keeps the ~7,000 notices that are still open, and re-checks hourly for a new one. |
| `SAM_API_KEY` (optional) | Attachment links for a notice (the daily file doesn't include them) | Free. Sign in at sam.gov → Profile → Public API Key. Keys without a role allow about 10 requests a day; each notice you list costs one. |
| `ANTHROPIC_API_KEY` | Claude's plain-English read of each notice, scopes of work, outreach emails/call scripts and proposals | platform.claude.com. Uses `claude-opus-5-5` by default (`ANTHROPIC_MODEL` to change). |
| `GOOGLE_PLACES_API_KEY` *or* `APIFY_API_TOKEN` | Real local businesses (rating, reviews, phone, website) when you search for subcontractors | Google Places API (New), or Apify's `compass/crawler-google-places` actor (the same one the Agentic Workflows Google Maps pipeline uses). |
| — | Past award pricing and past winners from USAspending.gov | No key needed. |

## What's on screen

The layout follows the wireframe:

| Area | What it does |
|---|---|
| **Left rail** | This week (weekly rhythm + pipeline), Find opportunities, Deadlines, My bids, Settings, and your company profile. |
| **Sidebar** | Search every open SAM.gov notice (keyword across titles and descriptions, state, NAICS, set-aside, posted date, time to respond, services only, open bids only), sorted by fit, deadline or newest, 100 at a time. Or switch to My bids filtered by stage. Each item shows days left and a fit score. |
| **Tabs** | **Overview**: what they're asking for in plain English, where, who can bid, requirements, red flags, questions for subs, the notice and attachments, and the contracting officer. **Past pricing**: similar past awards, the typical price per year, and the bid builder (sub cost → your price, per unit, per year, over the contract). **Subcontractors**: scope of work to send, local business search, companies that already won this work, and a shortlist with quotes, a six-point "hunger check" and an email/call script per company. **Proposal**: a pre-submit checklist, the proposal draft (edit, copy, download, print to PDF), and submitted/won/lost. |
| **Right sidebar** | Fit score with the reasons, your bid (sub cost, price, profit, margin), your price against past awards, and next steps. |
| **Bottom bar** | Which data sources are live, today's focus, and bids due this week. |

Anything you price, shortlist or draft is saved to **My bids** automatically. Press **Track** to save one without changing it.

## How it's built

Next.js (App Router) + TypeScript + Tailwind. One app serves the UI and a small JSON API.

```
directives/          SOPs for each step (the "what to do" layer, like the Agentic Workflows setup)
src/lib/             Deterministic tools: SAM.gov daily file + search, USAspending, places search,
                     Claude, bid math, fit score, rule-based breakdowns, templates, JSON store
src/app/api/         HTTP endpoints over src/lib (see below)
src/components/      The UI
.data/               Your pipeline and caches (git-ignored)
```

| Endpoint | Purpose |
|---|---|
| `GET /api/opportunities?q=&state=&naics=&setAside=&postedWithinDays=&minDaysToRespond=&servicesOnly=1&biddableOnly=1&sort=fit\|deadline\|newest&limit=&offset=` | Search opportunities |
| `POST /api/opportunities/description` `{id}` | A notice's full description |
| `POST /api/opportunities/attachments` `{id, postedDate}` | A notice's attachment links (needs `SAM_API_KEY`) |
| `POST /api/opportunities/refresh` | Check SAM.gov for a newer daily file now |
| `POST /api/pricing` `{query:{keywords,naics?,state?,yearsBack?,servicesOnly?},context?}` | Past awards + stats |
| `POST /api/subcontractors` `{query,location}` | Local businesses |
| `POST /api/ai/breakdown` `{opportunity}` | Plain-English breakdown (Claude, or rules) |
| `POST /api/ai/draft` `{kind:"sow"\|"outreach"\|"proposal",deal,subId?}` | Streams a draft as NDJSON |
| `GET/PUT /api/deals`, `DELETE /api/deals/:id` | Your pipeline |
| `GET/PUT /api/profile` | Company profile (UEI, CAGE, contact) used in drafts |
| `GET /api/status` | Which integrations are configured |

```bash
npm test
```

```bash
npm run typecheck
```

## Deploying

Bids are stored in `.data/kontract.json` and the SAM.gov index in `.data/sam-opportunities.jsonl`, so run it somewhere with a persistent disk: a VPS, or Railway/Render with a volume mounted and `DATA_DIR` pointing at it. `npm run build && npm start` runs the production server. It holds the notice index in memory (the server uses about 300–400 MB), and needs to reach sam.gov to download the daily file. There's no login, so keep it private (run it locally or behind your host's auth).

## Notes and limits

- Past award amounts are dollars obligated so far, so a contract still in progress shows less than its full value. "Typical per year" uses awards that ran about a year or more when there are enough of them.
- Opportunities come from SAM.gov's nightly file, so a notice posted today appears tomorrow. Amendments are merged into one notice (with an amendment count), and awarded or cancelled solicitations are dropped.
- Most notices don't list a place of performance; then the contracting office's location is shown and labeled as such.
- If the daily file can't be downloaded, you get sample opportunities labeled "Sample" with `DEMO-` numbers until it succeeds.
- Drafts are starting points. Read every proposal, replace every `[placeholder]`, and follow the solicitation's own instructions.
