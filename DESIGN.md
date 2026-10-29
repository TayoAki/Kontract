---
name: Kontract
description: Find government contracts, price them against past awards, line up subcontractors, and draft proposals.
colors:
  page: "#f6f7f4"
  panel: "#ffffff"
  panel-2: "#eff1ed"
  line: "#e2e6e0"
  line-strong: "#d4d9d2"
  ink: "#101814"
  ink-2: "#4a544e"
  ink-3: "#636d67"
  accent: "#15803d"
  accent-ink: "#166534"
  accent-soft: "#e6f4ea"
  on-accent: "#ffffff"
  selection: "#cdebd6"
  good: "#166534"
  good-soft: "#e6f4ea"
  warn: "#92400e"
  warn-soft: "#fdf1d8"
  bad: "#b91c1c"
  bad-soft: "#fde5e3"
  print-ink: "#111"
  print-rule: "#ddd"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.375
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  body-control:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  caption:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
  figure:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.55
    fontFeature: "\"tnum\""
  document:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.65
  print-heading:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body-control}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-ink}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.panel-2}"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.bad}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-danger-hover:
    backgroundColor: "{colors.bad-soft}"
  button-sm:
    typography: "{typography.label}"
    padding: "0 12px"
    height: "32px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.xl}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  badge-neutral:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  badge-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  badge-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  badge-bad:
    backgroundColor: "{colors.bad-soft}"
    textColor: "{colors.bad}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.full}"
    padding: "0 10px"
    height: "28px"
  chip-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
  tab-track:
    backgroundColor: "{colors.panel-2}"
    rounded: "{rounded.lg}"
    padding: "3px"
    height: "36px"
  tab-active:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  nav-rail-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    size: "56px x 48px"
  toast:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
---

# Design System: Kontract

## Overview

**Creative North Star: "The Bid Desk"**

Kontract plays the category standard straight: the shadcn/ui way of building an app, in Kontract's own off-white and green. White, flat cards with 1px borders sit on an off-white page. Shadows are barely there. The data and the next action carry each screen. The owner chose this look in plain words ("make it feel like shadcn"). Neumorphism was tried and the owner rejected it, and the build has no glass and no decorative gradients. The app is light only, by choice.

Screens are dense the way a working desk is dense. On desktop a prime sees a 64px icon rail, a 300px list column, the bid with its muted tab track, and a 320px bid snapshot column, all at once. Type is small and steady: 13px body, 15px section titles, and one 24px page heading. On phones the same places move into bottom tabs, the list becomes a drawer, and every control grows to finger size.

Colour is a grammar, not decoration. Green marks what you can do, what is selected, links, and money. Amber and red appear only for deadlines, warnings and errors. Anything selected gets a soft green tint, and the next step is the one green button.

**Key Characteristics:**
- Off-white page, white bordered cards, faint shadow-xs; a large shadow only on things that float.
- One green; amber and red reserved for time pressure and failure.
- Geist throughout; tabular figures for every number that is money or a count.
- 6px radius on controls, 12px on cards, full rounding on chips, avatars and switches.
- Muted tab tracks where the active segment is a white tab.
- Light only.

## Colors

A cool off-white and green-black neutral set with one forest green and two alert hues used sparingly.

### Primary
- **Ledger Green** (accent): primary buttons, the switch when on, the bottom-tab indicator, focus rings, the text caret, links and money. 4.7:1 on the page, 5.0:1 on white; white text on it is 5.0:1.
- **Deep Ledger Green** (accent-ink): the hover fill for primary buttons, and the text colour on any green tint (selected rail item, accent badges, notes, active chips, step numbers).
- **Mint Wash** (accent-soft): the tint behind selected things: rail item, list row (at 70%), active chip, accent badge, accent note, selected table cell in the proposal editor.
- **On Green** (on-accent): text and icons on a green fill.
- **Selection Mint** (selection): the colour of selected text.

### Secondary
- **Good** (good / good-soft): success states, "Sent" confirmations, good fit levels, positive stats, the live-status dot. Shares its values with Deep Ledger Green and Mint Wash.

### Tertiary
- **Deadline Amber** (warn / warn-soft): deadlines 5 to 9 days out, the "due this week" count in the status line, warning notes, and unfilled `[placeholders]` in the proposal document. Text is at least 4.5:1 on its tint.
- **Alarm Red** (bad / bad-soft): deadlines under 5 days, the due-count dot on the rail, error notes, negative stats, and destructive buttons. Text is at least 4.5:1 on its tint.

### Neutral
- **Field Off-White** (page): the page background and the browser theme colour.
- **Paper** (panel): cards, the rail, the list column, the top bars, fields, the active tab.
- **Pale Sage** (panel-2): tab tracks, filter bars, hover fills, avatars, neutral badges, blockquotes and table headers.
- **Hairline** (line): every 1px border and divider.
- **Hairline Strong** (line-strong): field borders, the dashed border on empty states, the switch when off, scrollbar thumbs.
- **Green-Black Ink** (ink): headings, values, body text.
- **Slate Ink** (ink-2): secondary text, labels, inactive nav.
- **Quiet Ink** (ink-3): metadata, hints, placeholders, the status line. Still at least 4.5:1 on page and white.

### Named Rules
**The One Green Rule.** Each view has exactly one green primary action. Everything else is secondary (white and bordered) or ghost.

**The Green Means Go Rule.** Green is only for primary actions, selected states, links and money. Amber and red are only for deadlines, warnings and errors. Never use them for decoration or for categories.

**The Tint Carries Ink Rule.** Text on any soft tint uses that tint's ink: accent-ink on accent-soft, warn on warn-soft, bad on bad-soft. Never put the bright accent on its own tint.

## Typography

**Display Font:** Geist (self-hosted via next/font; falls back to ui-sans-serif, system-ui)
**Body Font:** Geist
**Label/Mono Font:** Geist for labels; ui-monospace only for inline code in the proposal document.

**Character:** One neutral grotesk at every level. Hierarchy comes from size and weight (400, 500 and 600), never from a second face.

### Hierarchy
- **Display** (600, 24px, 1.25, balanced wrap): one per page, used for page names ("This week", "Settings") and a bid's title (20px on phones, 24px from sm up). The sign-in headline steps to 30px from sm up.
- **Headline** (600, 20px, 1.375): detail titles on narrower layouts, such as the permit type and the lead address.
- **Title** (600, 15px): section headings, paired with a 13px ink-2 subtitle.
- **Body** (400, 13px, 1.5): the working text size for list rows, notes, descriptions and toggles. Measure is capped by the content column (max-w-3xl or 4xl).
- **Control** (500, 14px): button and field text. Fields are 16px on touch screens.
- **Label** (500, 12px): field labels in ink-2, stat labels, small buttons, chips.
- **Caption** (500, 11px): rail and tab captions, badges, the status line, stat hints.
- **Figure** (600, 18px, tabular): stat values. Every money or count figure uses tabular numerals.
- **Document** (400, 13.5px, 1.65): the proposal editor. Headings are 1.6, 1.35 and 1.1em at weight 650/600; the h3 has a hairline underline.

### Named Rules
**The Sentence Case Rule.** Headings and labels are sentence case, in plain words. There are no uppercase tracked labels and no eyebrows above headings.

**The Tabular Money Rule.** Any figure a prime compares (price, cost, profit, counts) is set with tabular numerals so columns line up.

## Layout

The app fills the viewport as fixed columns that scroll on their own. From md up there is a 64px white icon rail on the left, with a 1px right border. Next comes the work area. On list views this is a 300px list column and a detail pane. The bid detail adds a 320px "Bid snapshot" aside from xl up; below xl, the snapshot content moves under the main content. A 28px status line runs along the bottom on desktop.

Responsive rules, as built:
- **< md:** the rail and status line are hidden and the same places become bottom tabs (56px tall, padded for the safe area).
- **< lg:** the list column becomes a drawer that slides in over a black/20 scrim with shadow-lg. A ghost "List" button reopens it.
- **< sm:** inactive tab labels collapse to screen-reader text and the active tab widens.
- **Touch (pointer: coarse):** controls grow to 40 to 44px and fields go to 16px text so phones don't zoom.

Content panes centre in max-w-3xl (settings, deadlines, sub views, public pages) or max-w-4xl (bid and permit detail). They are padded 16px, or 24px from sm up, with 20 to 24px above. Spacing follows the 4px Tailwind step. The common gaps are 4, 6, 8 and 12px inside components; 12px between a section heading and its body; 24 to 40px between sections. Public pages (quote, lead, join) use a white header bar with the green K mark and one centred max-w-3xl column.

## Elevation & Depth

Flat and bordered. Depth comes from the page/panel/panel-2 tonal steps and 1px hairlines, not from shadows. Tailwind's shadow scale is used in three steps, each with one job.

### Shadow Vocabulary
- **Rest** (`shadow-xs`: `0 1px 2px 0 rgb(0 0 0 / 0.05)`): cards, stats, fields, secondary and primary buttons, inactive chips, the switch track.
- **Raised segment** (`shadow-sm`: `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): only the active segment inside a muted track (tabs, list mode, stage and day pickers).
- **Floating** (`shadow-lg`: `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): only for things above the page: the toast, dialogs, the list drawer when open.

Scrims: black/40 behind modal dialogs and black/20 behind the list drawer.

### Named Rules
**The Float-Only-When-Floating Rule.** shadow-lg is only for surfaces that sit above the layout. Nothing in the flow gets more than shadow-xs, except the active segment of a track.

## Shapes

Gently rounded and consistent. Controls (buttons, fields, badges, tabs, rail items) use 6px. Notes, error notes, tab tracks, the toast and dialogs use 8px. Cards, stats and empty states use 12px. Chips, avatars, the switch, step numbers and status dots are fully round. Inline code and placeholder highlights use 4px or less. Borders are always 1px, in line or line-strong. Empty states use a dashed line-strong border. Icons are Lucide line icons at 16px in controls and 20px in navigation.

## Components

### Buttons
Quiet and compact; the colour does the talking.
- **Shape:** 6px radius; 36px tall with 16px side padding (small: 32px, 12px, 12px text). On touch screens they are 44px (small: 40px).
- **Primary:** green fill, white text, shadow-xs; the hover deepens to accent-ink. Only one per view.
- **Secondary (default):** white with a 1px hairline and shadow-xs; the hover fills panel-2.
- **Ghost:** no chrome, ink-2 text; the hover fills panel-2 and the text darkens to ink.
- **Danger:** a secondary button with red text; the hover is a red tint.
- **Focus / busy / disabled:** a 2px solid green outline offset 2px; while busy, a spinner sits before the label and the button is disabled; disabled is 50% opacity with a not-allowed cursor.

### Chips
- **Style:** fully round, 28px tall (40px on touch), 12px medium text, white with a hairline and shadow-xs.
- **State:** active chips take a mint wash, accent-ink text and a 40% green border, with aria-pressed set.

### Badges
6px radius, 11px medium text, 2px by 6px padding. Five tones: neutral (panel-2, hairline), accent, good, warn and bad (each a soft tint with its own ink). Deadline badges pick their tone from days left: under 5 is red, under 10 is amber, otherwise good.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** white on the off-white page.
- **Shadow Strategy:** shadow-xs at rest (see Elevation).
- **Border:** 1px hairline.
- **Internal Padding:** 12 to 16px. Stats are 14px by 12px. A `flat` stat drops its own chrome when several stats share one card.

### Inputs / Fields
- **Style:** white, 1px line-strong border, 6px radius, shadow-xs, 36px tall, 14px text with ink-3 placeholders. Textareas are relaxed-leading. Number fields are right-aligned and tabular, with an optional ink-3 prefix.
- **Focus:** the border turns green with a 3px green ring at 20%.
- **Labels:** 12px medium ink-2 above the field, with an optional ink-3 hint.
- **Touch:** 44px tall and 16px text.

### Toggle
A 32 by 18px fully round track (line-strong off, green on) with a white 14px knob that slides. The label is 13px ink-2.

### Navigation
- **Rail (md and up):** 64px wide, white, hairline right border. At the top is a green K mark in a 32px tile. Items are 56 by 48px with an icon over an 11px caption. The active item has a mint wash and accent-ink semibold; the hover is panel-2. A red count dot marks bids due this week. The company avatar sits at the bottom.
- **Bottom tabs (< md):** the same items stretched evenly, 56px tall. The active tab has accent-ink text and a 2px green bar along its top edge.
- **Status line (md and up):** 28px, white, 11px ink-3, with green or grey status dots and the amber "due this week" count.

### Tab Track (signature)
A 36px panel-2 track with 8px radius and 3px padding. Segments are 13px medium ink-2. The active segment is a white tab with ink text and shadow-sm. Counts sit in small mint badges, and a check marks a drafted proposal. The same track pattern is used for the list mode switch, CRM stages and the permit day picker.

### List Rows
Full-width rows with a hairline bottom border and 12 by 10px padding. Each has a 30px initials avatar, a two-line 13px medium title, a 12px ink-3 meta line, and badges for days left and fit. The selected row has a mint wash at 70%; the hover is panel-2.

### Toast
A white panel with a hairline, 8px radius and shadow-lg, with 14px medium text. It is centred at the bottom, 80px up on phones and 40px up on desktop, and enters with the enter animation. It sits bottom-centre on purpose, not bottom-right as in shadcn's Sonner, because the bottom tabs and status line already use the bottom edge.

### Dialog
A native dialog, max-w-2xl and up to 85dvh tall: a white panel with a hairline, 8px radius and shadow-lg over a black/40 scrim. The scrim is black/40 on purpose, lighter than shadcn's black/50, so the bid stays readable behind it.

### Notes and Empty States
Notes are 8px tinted blocks in 12.5px text: accent by default, warn when something needs attention. Error notes are red-tinted, with an XCircle icon and role="alert". Empty states are a dashed, 12px-round box with a 32px ink-3 icon, a 14px medium title, 13px ink-2 copy and an optional action.

### Paper Output

Print-to-PDF and the printed lead letter are paper, not screen: neutral print ink (#111) and #ddd rules on white, system fonts, a 16px section heading. They leave the screen palette on purpose so the page prints clean and grey-scale safe. The Word export follows the same neutral rule.

### Motion
The enter animation is 160ms from 4px down at 98% scale, eased cubic-bezier(0.16, 1, 0.3, 1). It applies only to dialogs and notices and is removed under prefers-reduced-motion. Everything else uses colour and box-shadow transitions only.

## Do's and Don'ts

### Do:
- **Do** put one green primary button in each view; make every other action secondary or ghost.
- **Do** show selection with the mint wash and accent-ink text: rail item, list row, chip, tab badge.
- **Do** use the 2px solid green focus outline, offset 2px, on every interactive element; fields use the green border with a 3px ring at 20%.
- **Do** use white 12px-radius cards with a 1px hairline and shadow-xs on the off-white page.
- **Do** set money and counts in tabular numerals.
- **Do** give touch screens 40 to 44px controls and 16px field text.
- **Do** keep the toast bottom-centre, clear of the bottom tabs and status line.
- **Do** use black/40 behind dialogs and black/20 behind the list drawer.

### Don't:
- **Don't** add a dark theme; Kontract is light only by choice.
- **Don't** use neumorphic soft 3D, glass or decorative gradients; the owner rejected them.
- **Don't** use amber or red for anything except deadlines, warnings and errors.
- **Don't** use shadow-lg on anything that sits in the page flow.
- **Don't** add uppercase eyebrows or kickers above headings; write sentence-case headings in plain words.
- **Don't** put the bright accent as text on a green tint; use accent-ink.
- **Don't** add a second typeface; Geist does every role.
