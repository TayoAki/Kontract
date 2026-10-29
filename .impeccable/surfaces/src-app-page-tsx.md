---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/components","src/app/q/[token]/page.tsx","src/app/l/[token]/page.tsx","src/app/join/page.tsx"]
---

# Kontract app shell and public pages

Scope: the whole signed-in app (prime and sub accounts) and the public pages subs open (quote request, shared lead, join, sign-in). Mode: Operate. Primary audience: primes at a desk on a laptop, daily; subs on phones second. Light only, by the owner's choice.

## Direction contract

THESIS: The category standard played straight, at shadcn/ui's craft level, in Kontract's off-white and green. Calm, flat, bordered surfaces where the data and the next action lead. Refuses decoration that competes with the work: no soft 3D (neumorphism was tried and rejected by the owner), no gradients, no glass.

OWN-WORLD: An off-white page (#f6f7f4) with white cards; 1px gray-green borders; faint shadows (shadow-xs on controls and cards, shadow-lg only on overlays). One green (#15803d) for primary actions, selected states and money; green-black ink. Amber and red only for deadlines, warnings and errors. Geist throughout, tabular figures for money. Radii: md (6px) on controls, xl (12px) on cards. Muted track tabs with a white active tab.

STORY: A prime sees what's due, opens a bid, prices it, gets quotes from subs and submits. Selected things carry a soft green tint; the next action is the one green button.

FIRST VIEWPORT: Find opportunities at 1440 wide. A white icon rail at left with the active view tinted green. A white list column with search and filters, the selected notice tinted. The bid's tab track (muted, white active tab) above its title, facts and green primary action, with the bid snapshot column at right. The status line along the bottom.

FORM: The standing exit, the category canon, chosen by the owner in plain words ("make it feel like shadcn"); the reference product is shadcn/ui. seed: none (canon chosen by the owner; no roll).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

None.
