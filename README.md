# Kontract

Find government contracts you can win (federal from SAM.gov, plus state and local bids), see what the government paid for the same work before, line up a local subcontractor, get their quote through a link, put your price on top, and send the proposal. **Permit leads** shows who is pulling building permits near each job, and the **Sub bench** tracks every subcontractor you work with, what they quoted and what they won.

It has two kinds of account. A **prime** (the business bidding as the prime contractor) gets everything above. A **subcontractor** gets free permit leads for their trade (10 a week, or every lead daily on a paid plan), the quote requests primes send them, and an AI finder that reads their website and looks for customers who are buying now.

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

Needs Node 22.13 or newer (it uses the built-in `node:sqlite`). Open http://localhost:3000 and create an account (pick "I win jobs and hire subs" or "I'm a subcontractor"); each account's bids, profile and bench are private to it. Everything works without keys: real SAM.gov opportunities (from the daily file), real USAspending pricing, sample subcontractor listings and fill-in templates. The first start takes 10–30 seconds to download SAM.gov's file. Add keys to `.env.local` and restart to switch the rest to live data.

| Key | Unlocks | How to get it |
|---|---|---|
| — | Live opportunities and full descriptions: every active SAM.gov notice, from SAM.gov's free daily file | No key needed. The server downloads the file (~200 MB) at startup, keeps the ~7,000 notices that are still open, and re-checks hourly for a new one. |
| `SAM_API_KEY` (optional) | A fallback for listing a notice's attachments | Not needed: attachments are listed and downloaded from SAM.gov's public endpoints. Free at sam.gov → Profile → Public API Key (about 10 requests a day without a role; keys expire every 90 days). |
| `ANTHROPIC_API_KEY` | Claude's plain-English read of each notice, scopes of work, outreach emails/call scripts and proposals | platform.claude.com. Uses `claude-opus-5-5` by default (`ANTHROPIC_MODEL` to change). |
| `GOOGLE_PLACES_API_KEY` *or* `APIFY_API_TOKEN` | Real local businesses (rating, reviews, phone, website) when you search for subcontractors | Google Places API (New), or Apify's `compass/crawler-google-places` actor (the same one the Agentic Workflows Google Maps pipeline uses). |
| — | Past award pricing and past winners from USAspending.gov | No key needed. |
| — | Building permits from 21 city and county open-data feeds (19 cities and counties, 12 states), and open bids from 5 state and local procurement feeds | No key needed. `SOCRATA_APP_TOKEN` (optional, free at any Socrata portal → Developer settings) raises the rate limits. |
| `BETTER_AUTH_SECRET` | Signs session cookies | Optional locally (one is generated into the data folder). Set it in production: `openssl rand -base64 32`. Set `BETTER_AUTH_URL` to the public URL too. |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | The paid daily-leads plan for subcontractors (Checkout and the billing portal) | A Stripe account, a recurring Price for the plan, and a webhook to `https://<your-domain>/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.updated`/`deleted`. Without them the plan shows as "coming soon". `DAILY_LEADS_PRICE_USD` sets the price shown (default 99). |
| `RESEND_API_KEY`, `EMAIL_FROM` | Lead digest emails to subcontractors (weekly on free, daily on paid) | resend.com, with a verified sending domain. `DIGEST_HOUR_UTC` sets the send hour (default 12, about 7am Central). Without them, leads are only in the app. |

## What's on screen

The layout follows the wireframe:

| Area | What it does |
|---|---|
| **Left rail** | This week (weekly rhythm + pipeline), Find opportunities, Deadlines, My bids, Permit leads (with a link to Data sources), Sub bench, Settings, and your account. A subcontractor account has My leads, Quote requests, Find customers and Settings. |
| **Sidebar** | Search every open SAM.gov notice and state/local bid (keyword across titles and descriptions, federal or state & local, state, NAICS, set-aside, posted date, time to respond, services only, open bids only), sorted by fit, deadline or newest, 100 at a time. Or switch to My bids filtered by stage. Each item shows days left and a fit score; state and local bids carry a badge. |
| **Tabs** | **Overview**: what the bid documents say (below), what they're asking for in plain English, where, who can bid, requirements, red flags, questions for subs, the notice, and the contracting officer. **Past pricing**: similar past awards, the typical price per year, and the bid builder (sub cost → your price, per unit, per year, over the contract). **Subcontractors**: scope of work to send, local business search, companies that already won this work, **businesses pulling that trade's permits near the job**, subs from your bench who do this work in the state, and a shortlist with quotes, a six-point "hunger check", an email/call script and a **quote link** per company. **Proposal**: a pre-submit checklist, the proposal draft (edit, copy, download, print to PDF), and submitted/won/lost. |
| **Right sidebar** | Fit score with the reasons, your bid (sub cost, price, profit, margin), your price against past awards, and next steps. |
| **Bottom bar** | Which data sources are live, today's focus, and bids due this week. |

Anything you price, shortlist or draft is saved to **My bids** automatically. Press **Track** to save one without changing it.

### From the bid documents

When you open a SAM.gov notice, Kontract lists its attachments from SAM.gov (no key needed), downloads them, and reads Word, Excel, PowerPoint and PDF files on the server (nothing is stored but the facts). Rules pull out, each with the sentence and document it came from:

- **Their budget**: the magnitude range construction bids must disclose (e.g. "between $1,000,000 and $2,000,000"), a stated estimate, or a not-to-exceed ceiling. On a form that lists every range, only a checked box counts.
- **Bonds** (bid, performance, payment, and the bid guarantee %), the **site visit** (date, required or not, already passed), **when questions are due**, **how long the work runs**, **wage determinations**, **how they pick** (lowest price, best value, comparative analysis), **sizes** (sq ft, linear ft, acres), and **what the job requires** (asbestos, infection control, OSHA 10/30, background checks, licenses, warranties, working hours). Contract fine print and long checklists are skipped.
- **Forms to fill in** and the rows of the **price form**.

That's free and takes a few seconds (the 11 attachments on a VA roof job, including a 406-page spec book, read in about 5 seconds). The bid snapshot shows your price against their range, and the fit score marks a $1M+ job, required bonds and a missed site visit. Scanned PDFs (no text layer) are marked, not read.

With `ANTHROPIC_API_KEY`, **Read the scope with Claude** (about $0.20 a bid, on request) lists the scope item by item with quantities, the trades needed, questions for your sub and risks. Every item must quote the words it came from, and items whose quote isn't in the documents are dropped. **Use as pricing lines** turns the scope into your price lines. The scope sent to subs (and the quote page) includes sizes, scope items, requirements and wage rates, never the budget.

### Quote links

On the Subcontractors tab, **Get quote link** makes a private link for one sub (no account needed). They open it on their phone, see the scope of work, the line items and quantities, the due date and your contact details, and enter a price per line, a start date, whether they're insured, and notes. **None of your pricing, markup or margin is on that page**, and the government's emails and phone numbers are scrubbed from the scope. When they send it, the quote lands in the bid on its own (the app checks every minute and when you come back to the tab): the sub is marked quoted with their total and per-line prices, an unpriced bid is filled with their cost plus your default markup, and the quote is logged on their bench record. A revised quote replaces the old one. The card shows whether the link was opened.

### Permit leads

Every building permit is someone about to spend money on a property. For a prime, the businesses pulling a trade's permits are licensed, local and busy: the best subs to call. The same permits are leads for the trades that come after (fence, landscaping, pools, gutters, blinds…), which is what subcontractor accounts get.

| Area | What it does |
|---|---|
| **Sidebar** | Pick a state and a city or county (or all of them), how far back (today to 30 days), a trade, and how strong a signal (strong, likely, possible). Each trade shows how many leads it has. More filters: keyword, ZIP, minimum job value, residential only, and leads only. |
| **Counting** | Leads are **unique addresses**, not rows: a new house with a building, electrical and plumbing permit is one lead with three related permits, tagged with the strongest reason for each trade. Cities with more than one feed (San Francisco's two permit systems, New York's DOB and electrical permits) are merged into one market. |
| **Permit** | Address, type, job value, contractor (with license number and insurance date where the city publishes them) and owner, related permits at the same address, a link to the city's record, and **who this is a lead for**: each trade with the reason (a new pool needs a safety fence; a new roof is the time for gutters). |
| **Names a contractor** | A filter for addresses where a permit names the contractor (someone to call, and a business to recruit), with the count. |
| **Recruit** | Businesses already pulling that trade's permits in the city, plus a Google Maps search for that trade nearby. **Add to bench**, or send an **invite**: a message that leads with this permit, offers free weekly leads for their trade, and links to a sign-up page pre-filled with their trade and city. When they sign up, they land on your bench. |
| **Pass it to a sub as a lead** | Pick a sub from your bench (or type a name and email) and add a note. They get a private link to a lead page: the address and map, why it's work for their trade, the permit's facts, and how to reach the customer. They answer "I'm on it" or "Not for me", and you see it on the permit. If they have an account with that email, the lead also shows under "Sent to you". |
| **Right panel** | Leads by trade (click to filter), your bench in that state, and each feed's health. |

**When a permit has no phone or email** (most don't), every lead comes with a reach plan built from what the permit does have: call the contractor running the job (or look up their number), mail the owner or "Current resident" at the address (a printable letter is built for you), knock or leave a door hanger on residential jobs, and check the city's record, which sometimes lists the applicant's phone when the data feed doesn't.

### Sub bench

Every subcontractor you work with, from permits, the Subcontractors tab, an invite or by hand. Stages are **Found → Contacted → Quoted → Active sub** (or Not a fit). Log calls, emails, texts and meetings, set the next follow-up, and keep their trade, license, insurance, contact details and notes. Each record lists **the jobs they've quoted or won** (from your bids, with their quote and the bid's outcome). The right panel shows the bench by stage and trade, quote rate, and who to follow up with today. Logging a touch moves Found to Contacted; a quote moves them to Quoted.

### Subcontractor accounts

A sub picks their trade and area at sign-up (or arrives from an invite with both filled in).

| Area | What it does |
|---|---|
| **Leads** | Tap a lead for the full detail and how to reach them (call, letter, map, city record). A filter shows only leads that name a contractor; leads a prime sent them are at the top. Permits that mean work for their trade in their area. **Free: the 10 best each week** (scored by signal strength, job value and how recent; the picks stay fixed for the week). **Daily plan: every lead, every day.** Either can be limited to their ZIP codes. |
| **Quote requests** | Every quote link a prime has sent to their email, with its status. |
| **Find customers** | The AI finder (below). |
| **Settings** | Trade, area, ZIPs, website, plan and billing, and the email digest. |

How fresh the leads are: most city feeds publish daily (San Francisco's PermitSF several times a day; College Station, Collin County and Illinois CDB weekly). Kontract re-pulls every feed **every 6 hours** and caches each pull for an hour, which catches each day's posting within a few hours without hammering the portals. Free picks refresh **every Monday**; daily-plan digests go out **every morning** (12:00 UTC by default).

### Find customers (AI)

A sub enters their website and picks which signals to look for. Claude (with web search and web fetch) reads the site, writes a business and customer profile, then searches for companies showing buying signals: **funded startups** (recently raised, with the funding date and amount, founders, and why they fit), **hiring companies** (open roles that mean new space or work), **LinkedIn signals**, **X signals**, **community** posts asking for the service, and **local news** (new locations, construction, relocations, openings). Each prospect has its location, the source link it came from, the people named on a page, and a drafted first email.

Guard rails: every prospect needs a source link; **emails are kept only if they appear on a page Claude actually read** (never guessed); LinkedIn links are kept only if they're real profile URLs; nothing is sent automatically (the sub copies the email or opens it in their mail app and marks the prospect contacted). Each run spends Claude credits, so it's limited to once a week on free and once a day on the daily plan. Without `ANTHROPIC_API_KEY` it shows labeled sample prospects.

### Data sources

A register of every feed: city and county permit feeds grouped by state, and the state and local bid feeds. Each shows its dataset link, how often it publishes, its known gaps (no contractor names, dates as text, weekly batches…), when it was last verified, and its **health** from the last pulls: OK, stale (no new rows when the feed should have them), empty, failing (with the error) or unknown. **Check all now** re-pulls every feed.

## How it's built

Next.js (App Router) + TypeScript + Tailwind. One app serves the UI and a small JSON API.

```
directives/          SOPs for each step (the "what to do" layer, like the Agentic Workflows setup)
src/lib/             Deterministic tools: SAM.gov daily file + search, state/local bid feeds,
                     USAspending, places search, Claude, bid math, fit score, rule-based breakdowns,
                     templates, permit feeds + register + health + trade tagging, quote links,
                     sub bench, sub leads + plans + digests, Stripe, the AI customer finder,
                     accounts (Better Auth) and the SQLite store
src/app/api/         HTTP endpoints over src/lib (see below)
src/components/      The UI
.data/               Accounts, pipelines and caches (git-ignored)
```

| Endpoint | Purpose |
|---|---|
| `GET /api/opportunities?q=&state=&level=federal\|sled&naics=&setAside=&postedWithinDays=&minDaysToRespond=&servicesOnly=1&biddableOnly=1&sort=fit\|deadline\|newest&limit=&offset=` | Search SAM.gov notices and state/local bids |
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
| `GET /api/permits?state=TX&market=&days=7&trade=&minStrength=strong\|likely\|possible&minValue=&residentialOnly=1&leadsOnly=1&zip=&q=` | Recent permits grouped by address, counts by trade, unique addresses vs rows, busiest contractors, and per-trade contractors |
| `GET /api/permits/contractors?state=TX&city=Austin&work=hvac,plumbing` | Businesses pulling permits for this work near a job (widens to the state when the city has none) |
| `GET /api/permits/sources` | States, markets, permit and bid feeds with health, trades and kinds of work |
| `POST /api/permits/check` | Re-pull every feed now and return fresh health |
| `POST /api/opportunities/details` `{opportunity, claude?}` | Read a notice's attachments: budget, bonds, dates, requirements, forms (and Claude's scope reading with `claude: true`) |
| `GET/PUT /api/crm`, `DELETE /api/crm/:id` | Your sub bench |
| `GET/POST /api/leads/share` `{permit, trade, contactId? \| toName, toEmail?, note?}` | Leads you've passed to subs, and pass one |
| `GET/POST /api/l/:token` `{answer: "taken"\|"passed"}` | The public lead page's data and the sub's answer (no session; the token is the key) |
| `GET /api/sub/shared` | Leads primes passed to a sub's email |
| `GET/POST /api/quotes` `{deal, subId}`, `POST /api/quotes/:token/imported` | Your quote links: list, make one, mark a quote as pulled into the bid |
| `GET/POST /api/q/:token` | The public quote page's data and the sub's submission (no session; the token is the key) |
| `GET/PUT /api/account` | Role (prime or sub), trade, area, ZIPs, website, digest setting |
| `GET /api/sub/leads`, `GET /api/sub/quotes` | A sub's leads (weekly 10 or daily) and the quote requests sent to their email |
| `POST /api/sub/checkout`, `POST /api/sub/portal` | Stripe Checkout for the daily plan, and the billing portal |
| `POST /api/stripe/webhook` | Stripe events that switch a sub's plan (signature checked) |
| `GET/PUT /api/prospects`, `POST /api/prospects/run` `{website, kinds}` | AI finder results and status changes; a run streams NDJSON progress |
| `/api/auth/*` | Sign up, sign in, sign out (Better Auth: `POST /api/auth/sign-up/email`, `/sign-in/email`, `/sign-out`) |

Every endpoint except `/api/auth/*` needs a signed-in session cookie and only sees that account's data. From a terminal:

```bash
curl -s -c .tmp/jar -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}' http://localhost:3000/api/auth/sign-in/email
```

```bash
curl -s -b .tmp/jar 'http://localhost:3000/api/permits?state=TX&days=7&trade=fence&leadsOnly=1'
```

```bash
npm test
```

```bash
npm run typecheck
```

## Deploying

Accounts, bids, profiles and CRM contacts live in one SQLite file, `.data/kontract.db`; the SAM.gov index is `.data/sam-opportunities.jsonl`. Run it somewhere with a persistent disk: a VPS, or Railway/Render with a volume mounted and `DATA_DIR` pointing at it. `npm run build && npm start` runs the production server (it listens on `PORT`). It holds the notice index in memory (about 300–400 MB), and needs to reach sam.gov, usaspending.gov and the cities' open-data portals.

On Railway: one service from this repo, a volume mounted at `/data`, and these variables: `DATA_DIR=/data`, `BETTER_AUTH_URL` (the public `https://…` URL; quote links and invites use it), `TRUSTED_IP_HEADER=x-real-ip` (so sign-in rate limits are per visitor), plus whichever API keys you use. For the paid plan, point a Stripe webhook at `https://<your-domain>/api/stripe/webhook`. `BETTER_AUTH_SECRET` is optional there: without it a secret is generated once into the volume. Anyone with the URL can create an account, so share it with the people you want.

A bids file from before accounts existed (`.data/kontract.json`) is imported into the first account created, then renamed.

## Notes and limits

- Past award amounts are dollars obligated so far, so a contract still in progress shows less than its full value. "Typical per year" uses awards that ran about a year or more when there are enough of them.
- Opportunities come from SAM.gov's nightly file, so a notice posted today appears tomorrow. Amendments are merged into one notice (with an amendment count), and awarded or cancelled solicitations are dropped.
- Most notices don't list a place of performance; then the contracting office's location is shown and labeled as such.
- If the daily file can't be downloaded, you get sample opportunities labeled "Sample" with `DEMO-` numbers until it succeeds.
- Permits come from each city's open-data portal, re-pulled every 6 hours and cached for an hour. Most cities post a day or two after issuing; some (College Station, Collin County) post weekly, so pick 14 or 30 days there. Trade tags are rules over the permit's type and description, with a strength (strong, likely, possible): a good first pass, not a guarantee. Not every city lists the contractor or job value; the register lists each feed's gaps.
- State and local bids are re-pulled every 3 hours from five open-data feeds (Los Angeles RAMP, NYC City Record, Delaware, Montgomery County MD, Illinois CDB). Their documents live on each portal, linked from the bid.
- To add a city: find its building-permit dataset on a Socrata portal, check the column names (`https://<domain>/resource/<id>.json?$limit=1`), and add an entry to `src/lib/permit-sources.ts` mapping them (a city can have several feeds under one market). `npm test` checks every entry.
- Drafts are starting points. Read every proposal, replace every `[placeholder]`, and follow the solicitation's own instructions.
