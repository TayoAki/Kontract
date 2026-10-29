---
target: the whole app (src/components)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 5
target_identity: "file:/home/user/Kontract/src/components"
timestamp: 2026-10-29T01-37-04Z
slug: src-components
closed: true
---
Method: dual-agent (A: design-review subagent · B: detector + browser subagent)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Copied quote link shows "Link sent"; arriving quote is a 3.5s toast only |
| 2 | Match System / Real World | 2 | Env-var names shown to users; broken template text ("cfo janitorial", "bidding on a check the notice…") |
| 3 | User Control and Freedom | 2 | "Tracking" untracks + deletes with no confirm/undo; trash has no confirm; Esc doesn't close modal |
| 4 | Consistency and Standards | 3 | Fit 90 in list vs 80/100 in panel; two Track primaries; three names for "quoted" |
| 5 | Error Prevention | 2 | Mark as submitted with no proposal/$0/13 blanks; quote link with "[your company name]" |
| 6 | Recognition Rather Than Recall | 3 | Bid title only on Overview tab; none on phone |
| 7 | Flexibility and Efficiency | 1 | No shortcuts, no arrow-key tabs, no bulk quote links |
| 8 | Aesthetic and Minimalist Design | 2 | Duplicated totals/trade counts; snapshot re-appended per tab on phone; dev status bar |
| 9 | Error Recovery | 2 | Raw "HTTP 500" errors; untracked bid unrecoverable; no password reset |
| 10 | Help and Documentation | 3 | Strong inline coaching; no help entry; NAICS/PSC/SDVOSB unexplained |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict
LLM: content model and copy are product-specific (weekly rhythm, "Where it says so" citations, hunger check, permit reach plan); visual layer is category-interchangeable (system font, blue accent, white rounded cards, stat-tile rows, three-pane shell). The money story (sub cost → your price → past-award band) is buried.
Detector: CLI 1 finding (side-tab, globals.css:116 blockquote; false positive). Browser on 6 views: low-contrast dominated by --ink-3 #8b93a1 (2.8–3.1:1, 173 uses; 320 hits on Permit leads = one row pattern); undersized-ui-text (10px rail captions — borderline; bench stage labels PermitMarket.tsx:103 — real); tiny-text 11px stacked with ink-3 (fit reasons RightPanel.tsx:145); cramped-padding (feed-gap sentences in Badge, PermitMarket.tsx:146); line-length 117ch (PermitDetail.tsx:408). Doc-editor line-length/straggler/unbalanced-heading: noise. text-occlusion: overlay artifact. Headless run: no user-visible overlay. No console errors.

## Priority Issues
1. [P1] Destructive actions unguarded: "Tracking" untracks/deletes with no undo; trash no confirm; Mark as submitted unguarded. Fix: undo toast, confirm on quoted subs, submit dialog listing failing checks. Command: /impeccable harden
2. [P1] Placeholders and broken template text reach subs and contracting officers ("A contractor", "[your company name]", "check the notice…" interpolated, lowercased solicitation, "Link sent" when copied). Fix: company-name warning + preview before quote link, keep casing, drop unknown clauses, "Link copied". Command: /impeccable clarify
3. [P1] Developer plumbing shown to end users (env vars in Settings/Overview/Proposal/Find customers; dev status bar). Fix: outcome language, owner-only setup section, quieter status bar. Command: /impeccable distill
4. [P1] Phone layout is desktop squeezed (top-left rail, icon-only tabs, no bid title off Overview, ~22 filters before first lead, sign-in below fold, quote page asks prices before scope, 28px targets). Fix: bottom tab bar, bid title on every tab, filters sheet, form first, scope first on /q/, 40px+ targets. Command: /impeccable adapt
5. [P1] Muted text fails contrast (ink-3 2.8–3.1:1 light, 3.8–4.3:1 dark; 10–11px). Fix: darken token (~#646c7a), lighten dark token, 10px→11px. Command: /impeccable polish

## Persona Red Flags
Jordan: three primaries on new Home incl. "Open my bids" with 0 bids; unexplained NAICS/PSC/SDVOSB; snow-removal comps for window washing; Start here ticks proposal step without a proposal; no password reset.
Alex: no shortcuts; Esc doesn't close modal; one-at-a-time quote links; Apply-to-filter vs instant sort.
Casey: top-left rail, icon tabs, ~480px of filters before leads, 28px targets, Close at top of a 1,500px lead.
Sam: ink-3 contrast; modal lacks focus management/Esc; unlabeled "+" past-winner button; tabs without tabpanels; silent untrack.

## Minor Observations
Empty header row in proposal company table; inconsistent phone formats; raw "submitted" stage badge; "Natalie Services LLC" placeholder; two Track buttons; four disagreeing progress models; invite pitches "$99/month" while plan says coming soon; identical pool-fence reason on all fence leads; "Construction cleaning: Strong" on a street-lighting permit.

## Questions to Consider
Sticky bid header with deadline + money line, tabs as steps? Quote page as the most deliberate screen? Find customers for trades = permit signals, not funded startups?
