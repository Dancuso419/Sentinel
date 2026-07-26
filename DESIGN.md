---
name: Sentinel
description: Crime reporting and case tracking — an operational board, not a government pamphlet.
colors:
  canvas: "#F2F1ED"
  surface: "#FFFFFF"
  ink: "#0E0E0E"
  ink-hover: "#262626"
  ink-soft: "#575757"
  ink-mute: "#6B6A65"
  on-ink: "#FFFFFF"
  on-ink-hover: "#E8E8E8"
  hairline: "#E4E2DD"
  hairline-strong: "#D6D3CC"
  hairline-hover: "#BFBBB2"
  tile-peach: "#FBE6D6"
  tile-peach-ink: "#7A3D14"
  tile-mint: "#DFF1E4"
  tile-mint-ink: "#1D5B33"
  tile-ice: "#DCEBF5"
  tile-ice-ink: "#14506E"
  tile-lilac: "#E9E8EF"
  tile-lilac-ink: "#3E3B56"
  positive: "#1B8A4B"
  danger: "#B3261E"
  danger-tile: "#F8E2E0"
  danger-tile-hover: "#F2D0CD"
typography:
  display:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(2.75rem, 6vw, 5rem)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  stat:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 3rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.03em"
  stat-sm:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 2.1vw, 1.75rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.025em"
  page-title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2.4vw, 2rem)"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.028em"
  task-title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.25rem)"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  closing:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  heading:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 2vw, 1.75rem)"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  lead:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  base:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.005em"
  small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.06em"
  micro:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.07em"
  nano:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(0.5625rem, 2.7vw, 0.625rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.02em"
  identifier:
    fontFamily: "Spline Sans Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  identifier-lg:
    fontFamily: "Spline Sans Mono, ui-monospace, monospace"
    fontSize: "clamp(1.25rem, 2.6vw, 1.75rem)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.01em"
  receipt-id:
    fontFamily: "Spline Sans Mono, ui-monospace, monospace"
    fontSize: "clamp(1.5rem, 4vw, 2.25rem)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "22px"
  xl: "28px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "64px"
  section: "104px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "14px 26px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "#262626"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "13px 25px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
  stat-tile:
    backgroundColor: "{colors.tile-peach}"
    textColor: "{colors.tile-peach-ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  stat-tile-emphasis:
    backgroundColor: "{colors.ink}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "24px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "28px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
  rail:
    backgroundColor: "{colors.ink}"
    textColor: "#FFFFFF"
    rounded: "{rounded.xl}"
    width: "76px"
---

# Sentinel Design System

## Overview

Sentinel is a crime reporting and case tracking system. The interface refuses the civic-portal default — navy banner, crest, dense grey tables — and instead reads as a modern **operational board**: a warm off-white canvas, floating white cards, pure-black emphasis, and pastel tiles that carry data by category.

The organising idea: **the system shows itself working.** Rather than claiming reliability in prose, surfaces display live state — real counts, a real case ID, a real status trail. This is why the landing page opens as a system overview rather than a marketing hero.

Two registers share one vocabulary:

- **Public surfaces** (landing, report, track, auth) — lighter, more air, larger type, a single obvious action per screen. The visitor may be stressed, one-time, on a phone.
- **Signed-in surfaces** (citizen, officer, admin dashboards) — an app shell with a floating black rail, denser tables, filters, inline controls. The user is working a queue.

The officer and admin dashboards share the shell but must not share a composition. The officer's question is *what do I work next*, so that screen opens on the four status tiles, which double as queue filters. The admin's question is *who is on this system and where is the load*, so that screen opens on plain-tile headcounts and pushes status down into a chart. If the two screens open with the same tile row, the admin screen has no reason to exist.

## Colors

Strategy: **Restrained ground, committed accents.** The canvas is a warm neutral (`canvas`) and carries no color; color arrives in whole tiles that own their region — never as scattered accents on grey.

- `canvas` `#F2F1ED` — page ground. Warm, not blue-grey. Never pure white.
- `surface` `#FFFFFF` — cards, tables, inputs. Reads as paper lifted off the canvas.
- `ink` `#0E0E0E` — primary text, and the fill for the single emphasis tile per group.
- `ink-soft` / `ink-mute` — secondary and tertiary text. On a pastel tile, secondary text is tinted from that tile's own hue (`*-ink` at reduced opacity), never grey.

**The four data tiles** are a fixed set, used in a consistent order (peach → mint → ice → lilac), each with its own darkened ink for text:

| Tile | Use |
|---|---|
| `tile-peach` | Pending / incoming |
| `tile-mint` | Resolved / positive completion |
| `tile-ice` | Active / in progress |
| `tile-lilac` | Total, and any neutral non-status metric |

Status outranks category: because three of the four tiles are spoken for by the status
mapping below, a "total" figure takes `tile-lilac`. A totals tile in peach would put the
pending colour on a number that is not pending.

**Status mapping is fixed and semantic** — the same three colors mean the same three things on every surface:

- `pending` → peach
- `investigating` → ice
- `resolved` → mint

Status is never communicated by color alone; the label always accompanies the tint.

`positive` is reserved for genuine positive deltas. `danger` is reserved for destructive actions (withdraw) and error states.

## Typography

**Archivo** (variable, 100–900) for everything, self-hosted from `/fonts/`. A grotesk with enough presence to carry a 5rem landing headline and enough discipline to stay readable at 11px in a table header — and, unlike the faces every generated interface converges on, it reads as engineered rather than generic.

**Spline Sans Mono** exclusively for identifiers and data: case IDs, audit-trail timestamps, filter dates, metric values. Mono is never a "technical" costume here — a case ID is the citizen's only key, and a monospaced face disambiguates `0`/`O` and `1`/`l` when someone copies it off a screen by hand or reads it down a phone line.

Scale steps are obvious, not incremental: `display` for the landing thesis, `stat` for tile numbers, `heading` for section and card titles, `body` for prose, `label` for uppercase tracked eyebrows on tiles and table headers.

Tracking tightens as size grows (down to `-0.035em` at display). Body measure stays 65–75ch.

`nano` is the one exception to the fixed ramp, and has exactly one use: the name under
an icon in the mobile tab bar, the smallest text in the product. It is fluid
(`clamp`) because six tab items on a 320px screen leave each label about 46px, where
`micro` truncates "Standings" mid-word, while at 390px the larger end is the more
comfortable read. Fluid keeps that as one documented step rather than two fixed sizes
either side of a breakpoint. Do not reach for it anywhere else — text this small is
legible only as a label attached to an icon that already carries the meaning.

## Layout

- **Public surfaces:** centered column, `max-width: 1180px`, generous vertical rhythm (`section` spacing between major bands).
- **Signed-in surfaces:** floating rail (`ink`, `rounded.xl`) with a 16px gutter on all sides so it visibly floats rather than sticking to the viewport edge. It **retracts**: 76px icon-only, or 234px with labels. One custom property, `--rail-current`, drives both the rail's width and the content offset so the two can never disagree, and the open class is written to `<html>` by an inline head script so the state is right on first paint rather than snapping open after load. The choice persists in `localStorage`. Content sits in the remaining space with its own padding.
- **Tile rows** are a 4- or 5-up grid that collapses to 2-up at 900px and 1-up only at 360px. They stay paired on phones on purpose: on the officer queue the four status tiles *are* the filter control, and stacking them puts three screens of scrolling between the officer and the queue they filter.
- Rhythm rule: more space above a heading than below it.
- The rail collapses to a horizontal bottom bar under 860px; it never becomes a hamburger.

## Elevation & Depth

Depth is minimal and physical. Cards sit on the canvas via a **hairline border plus a soft, offset shadow** — never a zero-offset halo, never a glow.

- Resting card: `0 1px 2px rgba(14,14,14,0.04), 0 8px 24px -12px rgba(14,14,14,0.10)`
- Raised (hover on interactive cards): shadow deepens and the card lifts 1px.
- The black rail and black emphasis tile carry a slightly stronger shadow because they are visually heaviest.

No glass, no backdrop blur, no gradient fills.

## Shapes

Heavy, consistent rounding is a signature of this system — corners are the main non-color identity carrier.

- Tiles and cards: `lg` (22px) / `xl` (28px)
- Inputs and small controls: `sm` (12px)
- Buttons, chips, status pills, filter controls: `pill`
- The rail: `xl`

Nothing is square except table cell dividers (hairlines).

## Components

- **Stat tile** — pastel fill, uppercase `label` eyebrow, large `stat` number, one line of context beneath. Exactly one tile per row may be the black `stat-tile-emphasis`; that tile carries the row's primary action, not a metric. Secondary text on a tile sits at `opacity: .85` — below that the 12px label drops under 4.5:1 against peach and mint.
- **Stat tile as control** — on the officer queue the status tiles are `<button>`s that filter the queue, marked with `aria-pressed` and an inset ring in the tile's own ink. A tile becomes a control only when its number and the filter it applies are the same fact; it is never a decorative click target.
- **Card** — white, `xl` radius, hairline border, soft shadow. Cards are containers for real content. **Never nest a card in a card.**
- **Status pill** — pill radius, tile fill per the fixed status mapping, `label` type, always with its text label.
- **Table** — white surface, hairline row dividers, `label` type for headers, mono for case IDs. Rows have a hover tint (`canvas`). No zebra striping.

  **Aligned columns are the tablet-and-up form.** At 620px and above a wide table scrolls horizontally inside `.table-wrap` rather than collapsing — an officer reading a queue wants the columns aligned, and that is worth a sideways pan. Below 620px it inverts: eight columns (officer queue) or ten (standings) cannot hold their alignment on a phone, and panning sideways to reach a status control is not a queue anyone can work. Each row becomes a card whose cells name themselves, `thead` moves out of flow but stays in the accessibility tree, and the column labels are mirrored onto cells as `data-label` by `js/table-cards.js`. Nothing is dropped: same cells, same order, same controls, only the axis changes. A column hidden on a phone is a fact an officer would have to reach a desk to learn.
- **Rail** — black, retractable, active item marked by an inverted white pill behind the icon. Collapsed it is icon-only and each item carries a hover tooltip; expanded the tooltips are suppressed because the labels are already visible. It collapses to a horizontal bottom bar under 860px, where retracting is meaningless and the toggle is removed.
- **Plain tile** (`tile-plain`) — white paper with a hairline, same shape and type as a pastel tile. For figures that are not statuses: headcounts, account totals. Using a status pastel on a headcount would assert a meaning the number does not have.
- **Trail / timeline** — the audit trail rendered as connected dots with mono timestamps; this is the system's signature component and appears on both the landing page and the officer dashboard. It carries four event types, not just status moves: a status transition, a revision of the resolution note, the reporter's verdict, and admin sign-off. Each row names its actor. Where an event has text (a note, a reporter's comment) that text sits in a `trail-detail` block beneath it, so a revised note and the wording it replaced are both readable in sequence.
- **Verdict pills** — `confirmed` takes mint, `disputed` takes the danger tile, `awaiting` takes lilac. A disputed resolution is the strongest signal in the system and is never hidden behind an expander: it shows in the officer queue's status cell and sorts to the top of the admin sign-off queue.
- **Choice set** — a radio group as full-width bordered rows rather than bare radios, used where the choice changes what the system does with the answer (affected vs. witness). The selected row takes the ink border via `:has(input:checked)`.

## Do's and Don'ts

**Do**

- Show real system state instead of describing it. Live counts, real case IDs, real status.
- Keep exactly one black emphasis element per view group — its scarcity is what makes it read as primary.
- Tint secondary text on a pastel tile from that tile's own hue.
- Pair every status color with its written label.
- Use mono for identifiers and timestamps only.

**Don't**

- Don't use the navy/white government-portal palette. It was the previous direction and is explicitly retired.
- Don't build page structure out of a row of same-size icon-heading-text cards. Vary density instead: a tile row earns a quiet prose band; a table earns whitespace.
- Don't add a tracked uppercase eyebrow to every section. Eyebrows belong on tiles and table headers, where they're a system.
- Don't nest cards, use gradient text, glass, or a colored border-left as decoration.
- Don't invent proof. No adoption figures, no testimonials, no agency crest, no claim of official police affiliation — the seeded database is small and the honest framing is "live system status," never "trusted by thousands."
- Don't let color alone carry status, and don't rely on hover to reveal essential information.
