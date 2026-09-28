# SAMOSA — Design System

**Version:** 1.0 · 27 September 2026
**Status:** Accepted — implementation reference for `components/`, `app/`, and public pages
**Target stack:** Next.js 15 · Tailwind CSS · shadcn/ui · Recharts
**Typography:** Plus Jakarta Sans (UI) · JetBrains Mono (data & micro labels)

> This document is the *source of truth* for SAMOSA's color, typography, spacing, components, and layout.
> For the *why* behind interaction decisions (depth ladder, data honesty, persona rules),
> see `SAMOSA-UIUX-PRINCIPLES.md`. This document is the *how*.

> **Translation note:** The SAMOSA product UI is in Indonesian. Literal UI strings (labels, headlines, eyebrows, status names, microcopy) are kept in the original Indonesian, with an English gloss in parentheses where useful.

---

## Table of contents

1. [Design direction](#1-design-direction)
2. [Color system](#2-color-system)
3. [Gradients](#3-gradients)
4. [Typography](#4-typography)
5. [Spacing, radius, elevation](#5-spacing-radius-elevation)
6. [Motion](#6-motion)
7. [Layout & grid](#7-layout--grid)
8. [Navigation — full list of buttons](#8-navigation--full-list-of-buttons)
9. [Components](#9-components)
10. [Page: Dashboard](#10-page-dashboard)
11. [Page: Landing](#11-page-landing)
12. [Do & Don't](#12-do--dont)
13. [Implementation: tokens & Tailwind](#13-implementation-tokens--tailwind)
14. [Review checklist](#14-review-checklist)

---

## 1. Design direction

### 1.1 In one sentence

> **A warm workspace with a calm dark side** — a friendly cream canvas, a focused charcoal sidebar, and a single fire color that appears only where it truly matters.

### 1.2 Three visual characteristics

**Warm, not corporate.** The app canvas is not sterile white but a warm cream (`#FDF7F2`). Every neutral in this system has a brown undertone — there is no pure neutral gray anywhere. The reason: its users are students and event committees, not bank analysts. A warm workspace feels safe for uploading their peers' aspirations.

**Bold contrast, not soft gradients everywhere.** A near-black charcoal sidebar sits directly against the cream canvas. This sharp difference is what keeps the navigation's position always clear — important for users who only log in four times a year and have already forgotten the UI.

**One fire color, used sparingly.** Ember (orange) is the only color allowed to "shout." If it appears in more than three places on one screen, it stops meaning anything. Rule of thumb: **one primary action per screen gets Ember; all other actions are neutral.**

### 1.3 Color role allocation

| Color | Role | Appears in |
|---|---|---|
| **Ember** (orange) | Action & brand emphasis | Primary buttons, logo, hero numbers, active links |
| **Teal** | Positive data & secondary accent | Charts, status badges, statistics, info chips |
| **Sand** (cream–tan) | Surfaces | Canvas, banners, cards, dividers |
| **Ink** (warm charcoal) | Structure & text | Sidebar, text, dark secondary buttons |
| **Amber** | Attention / neutral | `partial` status, neutral sentiment |
| **Rosella** | Negative | Negative sentiment, destructive errors |

**Key decision:** negative sentiment does **not** use red-orange, because it would be confused with Ember (the brand color). Negative uses Rosella — a red leaning toward pink/plum, clearly distinct from orange in both normal vision and deuteranopia color deficiency.

---

## 2. Color system

### 2.1 Full ramps

#### Ember — Primary

| Token | Hex | Usage |
|---|---|---|
| `ember-50` | `#FEF4ED` | Soft chip background, row hover |
| `ember-100` | `#FDE6D5` | Badge background, subtle highlight |
| `ember-200` | `#FAC9A9` | Accent border, illustration |
| `ember-300` | `#F7A674` | Illustration, chart tier 3 |
| `ember-400` | `#F4883F` | Light gradient stop, chart tier 2 |
| **`ember-500`** | **`#F26B24`** | **Brand base** — logo, icons, text ≥24px, chart fill |
| `ember-600` | `#C24E16` | Dark stop of button gradient, text on cream |
| `ember-700` | `#9E3F11` | Button hover, small text on cream |
| `ember-800` | `#7A300C` | Pressed, dense text |
| `ember-900` | `#561F07` | Accent in dark mode |

#### Teal — Secondary

| Token | Hex | Usage |
|---|---|---|
| `teal-50` | `#ECF8F6` | "Feedback Intelligence" chip background, info panel |
| `teal-100` | `#D2EFE9` | Badge background, highlight |
| `teal-200` | `#A6DFD4` | Border, chart tier 3 |
| `teal-300` | `#71C9BA` | Chart tier 2, light gradient stop |
| `teal-400` | `#4BB3A2` | Chart fill, indicator |
| **`teal-500`** | **`#3A9E8D`** | **Base** — chart fill, icons, statistic numbers |
| `teal-600` | `#2F8172` | Dark gradient stop |
| `teal-700` | `#27685C` | **Teal text on cream** (contrast 5.9:1) |
| `teal-800` | `#1F5149` | Dense text |
| `teal-900` | `#173B35` | Dark-mode accent surface |

#### Sand — Warm neutrals (surfaces)

| Token | Hex | Usage |
|---|---|---|
| **`sand-25`** | **`#FDF7F2`** | **App canvas** — main background for all pages |
| `sand-50` | `#FBF2EA` | Alternate section background, surface hover |
| `sand-100` | `#F6E9DD` | Secondary card, input background |
| **`sand-200`** | **`#EFDCCB`** | **Hero banner**, highlight block |
| `sand-300` | `#E3CBB4` | Strong border, divider in tan areas |
| `sand-400` | `#C9AC90` | Disabled icons in tan areas |

#### Ink — Dark neutrals (structure & text)

| Token | Hex | Usage |
|---|---|---|
| `ink-200` | `#DDD4C9` | Subtle border on cream (**default border**) |
| `ink-300` | `#C0B5AA` | Input border, strong divider |
| `ink-400` | `#9C9085` | Placeholder, inactive icons |
| **`ink-500`** | **`#7A6E64`** | **Secondary / muted text** (contrast 4.8:1) |
| `ink-600` | `#5A5048` | Tertiary text, labels |
| `ink-700` | `#3D362F` | Strong text |
| `ink-800` | `#2A2521` | Secondary dark surface |
| **`ink-900`** | **`#1A1613`** | **Primary text**, dark buttons |
| **`ink-950`** | **`#12100E`** | **Sidebar**, dark-mode background |

#### Semantic colors

| Token | Hex | Usage |
|---|---|---|
| `positive` | `#3A9E8D` (teal-500) | Positive sentiment, success |
| `positive-fg` | `#27685C` (teal-700) | Positive text on light |
| `attention` | `#E8A63C` | Neutral sentiment, `partial` status |
| `attention-fg` | `#8A5D12` | Attention text on light |
| `negative` | `#BE4A63` | Negative sentiment |
| `negative-fg` | `#8F2F44` | Negative text on light |
| `danger` | `#B4322E` | Destructive action (delete) |
| `info` | `#3A7EA1` | Neutral notes, informational tooltips |

> `negative` (sentiment) and `danger` (delete action) are deliberately distinguished. Negative sentiment is **data**, not a warning — using an alarm color for data would make reports feel accusatory.

### 2.2 Contrast table (WCAG 2.1)

All pairs used for text have been verified:

| Foreground | Background | Ratio | Passes |
|---|---|---|---|
| `ink-900` `#1A1613` | `sand-25` `#FDF7F2` | 15.8:1 | AAA ✓ |
| `ink-500` `#7A6E64` | `sand-25` | 4.8:1 | AA ✓ |
| `ink-400` `#9C9085` | `sand-25` | 2.9:1 | ✕ — **decorative icons only** |
| `ember-600` `#C24E16` | `sand-25` | 4.9:1 | AA ✓ |
| `ember-500` `#F26B24` | `sand-25` | 3.1:1 | AA Large only (≥24px) |
| `teal-700` `#27685C` | `sand-25` | 5.9:1 | AA ✓ |
| `teal-500` `#3A9E8D` | `sand-25` | 3.0:1 | AA Large only |
| `white` | `ember-600` `#C24E16` | 4.7:1 | AA ✓ |
| `white` | `ember-500` `#F26B24` | 3.0:1 | ✕ — **not for button labels** |
| `ink-900` | `ember-500` | 5.8:1 | AA ✓ |
| `white` | `ink-900` | 16.4:1 | AAA ✓ |
| `sand-25` | `ink-950` `#12100E` | 17.1:1 | AAA ✓ |

**Practical consequences that must be followed:**

- Primary buttons must **not** be `ember-500` + white text. Use the `ember-500 → ember-600` gradient with **`ink-900` text**, or solid `ember-600`/`ember-700` with white text.
- `teal-500` and `ember-500` are **fill colors**, not small-text colors. For text use the `-600`/`-700` variants.

### 2.3 Chart palette

Category order (maximum 6 series; beyond that, merge into `Lainnya` / "Other"):

```
1. #3A9E8D   teal-500      2. #F26B24   ember-500
3. #4A7FA5   steel blue     4. #E8A63C   amber
5. #8B6BA8   muted purple   6. #7A6E64   ink-500  (always for "Lainnya" / "Other")
```

Sentiment scale (**always** in this order, never reversed):

```
Positive  #3A9E8D      Neutral  #E8A63C      Negative  #BE4A63
```

Sequential scale (heatmap, topic intensity) — teal:
```
#ECF8F6 → #D2EFE9 → #A6DFD4 → #71C9BA → #4BB3A2 → #3A9E8D → #2F8172
```

**Chart rules:**
- Maximum 3 colors per chart unless the categories genuinely need more.
- Sentiment is never distinguished **only** by color — there is always a label or pattern.
- `Lainnya` ("Other") is always `ink-500` and always in the last position.
- Bar charts start at zero. Always.

### 2.4 Dark mode

Dark mode is not an inversion. Cream does not become gray — it becomes warm charcoal.

| Role | Light | Dark |
|---|---|---|
| Canvas | `sand-25` `#FDF7F2` | `#14110F` |
| Card surface | `#FFFFFF` | `#1C1815` |
| Raised surface | `sand-100` `#F6E9DD` | `#252019` |
| Sidebar | `ink-950` `#12100E` | `#0D0B0A` |
| Primary text | `ink-900` | `#F5EDE4` |
| Muted text | `ink-500` | `#A79A8E` |
| Border | `ink-200` | `#332C26` |
| Primary | `ember-500` | `#F5854A` (raised so contrast still passes) |
| Teal | `teal-500` | `#4FB8A6` |

In dark mode, **raise the lightness of brand colors by ±12%**; do not use the same hex. Minimum contrast remains 4.5:1 for text.

---

## 3. Gradients

Gradients in this system serve as **atmospheric depth**, not decoration. They are used on large surfaces to add warmth, never on small elements.

### 3.1 Hard rules

1. **Minimum size 120px** on the shortest side. Gradients on chips, badges, or small icons look like compression artifacts.
2. **Maximum 2 stops** for UI surfaces; 3 stops only for the *hero glow*.
3. **One hue family only.** Ember→Ember, Sand→Sand. Never Ember→Teal (produces muddy brown in the middle).
4. **Maximum lightness difference of 20%.** A gradient should feel like lighting, not like two different colors.
5. **Text on a gradient must pass contrast at the lightest point**, not the average.
6. **Always provide a flat fallback** for print and `forced-colors`.
7. **Never in data areas.** Charts, tables, and report numbers use solid fills — gradients alter the perception of magnitude.

### 3.2 Gradient tokens

```css
/* Primary button — white text passes 4.7:1 at the lightest stop */
--grad-primary:        linear-gradient(135deg, #C24E16 0%, #9E3F11 100%);
--grad-primary-hover:  linear-gradient(135deg, #D15A1C 0%, #AC4614 100%);

/* Bright primary button variant — MUST use ink-900 text */
--grad-primary-bright: linear-gradient(135deg, #F4883F 0%, #E05E1C 100%);

/* App hero banner (large tan block) */
--grad-banner:         linear-gradient(145deg, #F4E5D6 0%, #EBD7C2 60%, #E5CDB4 100%);

/* Sidebar — dark with a little light at the top */
--grad-sidebar:        linear-gradient(180deg, #1A1613 0%, #12100E 45%, #0F0D0B 100%);

/* Landing hero glow — radial, very subtle, behind the headline */
--grad-hero-glow:      radial-gradient(ellipse 80% 55% at 50% 0%,
                         rgba(242,107,36,0.14) 0%,
                         rgba(242,107,36,0.05) 45%,
                         transparent 75%);

/* Statistic / KPI cards */
--grad-stat-teal:      linear-gradient(160deg, #F0FAF8 0%, #DFF2EE 100%);
--grad-stat-ember:     linear-gradient(160deg, #FEF6F0 0%, #FBE7D8 100%);

/* Divider line that fades at both ends */
--grad-divider:        linear-gradient(90deg, transparent 0%, #DDD4C9 18%,
                                        #DDD4C9 82%, transparent 100%);

/* Gradient text — ONLY for display ≥40px, weight ≥700 */
--grad-text-ember:     linear-gradient(120deg, #F26B24 0%, #C24E16 100%);

/* Dark overlay on top of images/screenshots */
--grad-scrim:          linear-gradient(180deg, transparent 0%, rgba(18,16,14,0.72) 100%);
```

### 3.3 Where gradients are allowed and forbidden

| Element | Gradient? | Notes |
|---|---|---|
| Primary button | ✓ | `--grad-primary` |
| Dashboard hero banner | ✓ | `--grad-banner` |
| Sidebar | ✓ | `--grad-sidebar`, very subtle |
| Landing hero background | ✓ | `--grad-hero-glow` behind text |
| KPI cards | ✓ | Very soft tint |
| Display headline ≥40px | ✓ | One word only, not the whole sentence |
| Bar/area chart | ✕ | Solid fill — gradients falsify magnitude |
| Badge, chip, tag | ✕ | Too small |
| Table rows | ✕ | Interferes with scanning |
| Border | ✕ | Except card hover border, 1px, ≥200px long |
| Text < 40px | ✕ | Contrast is uncontrolled |
| Icons | ✕ | `currentColor` only |
| Anything on a print page | ✕ | All gradients become flat under `@media print` |

> **Revision note:** `SAMOSA-UIUX-PRINCIPLES.md` §6 prohibits gradients in general. The rules in this section supersede it — that prohibition targeted decorative gradients (mesh, glassmorphism, rainbow), which remain prohibited. Controlled gradients on large surfaces are allowed.

---

## 4. Typography

### 4.1 Typefaces

```
UI & content    Plus Jakarta Sans    400, 500, 600, 700, 800
Data & micro    JetBrains Mono       400, 500
```

Plus Jakarta Sans was chosen because it is warm yet firm, and because it is an Indonesian typeface — relevant for a product whose entire interface is in Indonesian. JetBrains Mono is reserved for things that must read as *data*: dates, IDs, prompt versions, costs, uppercase micro labels.

### 4.2 Type scale

| Token | Size / line-height | Weight | Tracking | Usage |
|---|---|---|---|---|
| `display-xl` | 60 / 1.02 | 800 | −0.035em | Landing hero |
| `display-lg` | 48 / 1.05 | 800 | −0.03em | Landing section headline |
| `display-md` | 36 / 1.1 | 800 | −0.025em | Dashboard greeting |
| `h1` | 30 / 1.15 | 700 | −0.02em | Page title |
| `h2` | 24 / 1.25 | 700 | −0.015em | Section title |
| `h3` | 20 / 1.3 | 700 | −0.01em | Card title |
| `h4` | 17 / 1.4 | 600 | −0.005em | Subtitle, strong label |
| `body-lg` | 17 / 1.6 | 400 | 0 | Landing paragraphs, executive summary |
| `body` | 15 / 1.6 | 400 | 0 | Base UI text |
| `body-sm` | 13.5 / 1.5 | 400 | 0 | Secondary text, captions |
| `label` | 13 / 1.4 | 600 | 0 | Form labels, buttons |
| `micro` | 11 / 1.4 | 500 | 0.01em | Metadata, timestamps |
| `eyebrow` | 11 / 1.3 | 600 | **0.14em** | **MONO, UPPERCASE** — section label |
| `mono-data` | 12.5 / 1.5 | 500 | 0.01em | Numbers, IDs, versions, costs |
| `stat` | 34 / 1 | 700 | −0.02em | Large KPI numbers |

### 4.3 Typography rules

- The **eyebrow** is this system's visual signature. Every section has one: `JetBrains Mono, 11px, uppercase, tracking 0.14em`. Color: `ember-600` on landing, `ink-500` in the app.
- **Tabular numerals are mandatory** (`font-variant-numeric: tabular-nums`) on all changing numbers — KPIs, tables, progress. Without this, numbers "jump" on update.
- **Maximum prose line length is 68–72 characters** (≈680px). Applies to executive summaries, insight details, and all landing body text.
- **No text below 11px**, anywhere.
- Weight 800 only for `display-*`. H1–H3 stop at 700 — 800 at small sizes looks heavy and closes letter counters.
- Percentages always have one decimal when below 10% (`8,1%`), rounded when above (`78%`). Decimal separator is a comma, thousands separator is a period — Indonesian format.

---

## 5. Spacing, radius, elevation

### 5.1 Spacing — 4px base

| Token | px | Usage |
|---|---|---|
| `space-1` | 4 | Icon–text gap |
| `space-2` | 8 | Chip padding, gap between tags |
| `space-3` | 12 | Small control padding |
| `space-4` | 16 | Standard card padding, tight grid gap |
| `space-5` | 20 | Gap between elements within a card |
| `space-6` | 24 | Large card padding, grid gap |
| `space-8` | 32 | Gap between sub-sections |
| `space-12` | 48 | **Gap between main sections** |
| `space-16` | 64 | Landing section vertical padding (mobile) |
| `space-24` | 96 | Landing section vertical padding (desktop) |
| `space-32` | 128 | Landing hero breathing room |

### 5.2 Radius

| Token | px | Usage |
|---|---|---|
| `radius-xs` | 4 | Micro chips, mono badges |
| `radius-sm` | 6 | Badges, tags, small inputs |
| `radius-md` | 8 | Inputs, selects, small buttons |
| `radius-lg` | 10 | Standard buttons, nav items |
| `radius-xl` | 14 | **Cards** |
| `radius-2xl` | 20 | **Hero banners, large panels** |
| `radius-full` | 9999 | Avatars, pills, progress tracks |

### 5.3 Elevation

This system **relies on borders more than shadows**. Cards on the cream canvas use an `ink-200` border; shadows are only for elements that genuinely float.

| Token | Value | Usage |
|---|---|---|
| `shadow-none` | — | **Default for all cards** |
| `shadow-xs` | `0 1px 2px rgba(26,22,19,0.05)` | Interactive cards on hover |
| `shadow-sm` | `0 2px 8px rgba(26,22,19,0.07)` | Dropdowns, popovers |
| `shadow-md` | `0 8px 24px rgba(26,22,19,0.10)` | Modals, user card in sidebar |
| `shadow-lg` | `0 20px 48px rgba(26,22,19,0.14)` | Floating report mockup in banner |

**One card level only.** No cards inside cards. Sub-sections are separated by `ink-200` lines and whitespace.

### 5.4 Border

```
Default         1px solid ink-200 (#DDD4C9)
Strong          1px solid ink-300 (#C0B5AA)
Focus           2px solid ember-500, offset 2px
On dark areas   1px solid rgba(255,255,255,0.08)
On tan areas    1px solid sand-300 (#E3CBB4)
```

---

## 6. Motion

| Token | Duration | Easing | Usage |
|---|---|---|---|
| `dur-instant` | 100ms | `ease-out` | Color hover, focus |
| `dur-fast` | 160ms | `cubic-bezier(.2,0,.2,1)` | Buttons, chips, tooltips |
| `dur-base` | 220ms | `cubic-bezier(.2,0,.2,1)` | Panels, disclosures, dropdowns |
| `dur-slow` | 340ms | `cubic-bezier(.16,1,.3,1)` | Chart entry, modals |
| `dur-chart` | 600ms | `cubic-bezier(.16,1,.3,1)` | Bar chart growing on first appearance |

**Rules:**
- No bounce, no overshoot, no spring. Motion in this system is calm.
- Charts animate **once** on first appearance, not on every re-render.
- The analysis progress bar moves linearly and honestly — it never "jumps to 90% and then waits."
- `@media (prefers-reduced-motion: reduce)` → all durations become `1ms`, opacity transitions only.

---

## 7. Layout & grid

### 7.1 App shell

```
┌───────────────┬──────────────────────────────────────────────┐
│               │                                              │
│   SIDEBAR     │   CONTENT AREA                               │
│   ink-950     │   sand-25                                    │
│   gradient    │                                              │
│               │   ┌────────────────────────────────────┐     │
│   288px       │   │  padding 40px                      │     │
│   fixed       │   │  content max-width 1180px          │     │
│               │   │                                    │     │
│   ┌────────┐  │   │   ┌──────────────────────────┐    │     │
│   │ logo   │  │   │   │ reading spine 680px      │    │     │
│   └────────┘  │   │   │ (prose, insights)        │    │     │
│               │   │   └──────────────────────────┘    │     │
│   nav items   │   │   ┌────────────────────────────┐  │     │
│               │   │   │ data escape 1100px         │  │     │
│               │   │   │ (charts, tables, explorer) │  │     │
│   ┌────────┐  │   │   └────────────────────────────┘  │     │
│   │ user   │  │   │                                    │     │
│   │ card   │  │   └────────────────────────────────────┘     │
│   └────────┘  │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

**Specifications:**
- Sidebar **288px**, `position: fixed`, full height, background `--grad-sidebar`
- Content `margin-left: 288px`, padding `40px`, `max-width: 1180px`
- **Reading spine 680px** for prose — reports are read, not scanned
- **Data escape up to 1100px** for charts and tables
- No top bar. The page header serves that role.
- Sidebar disappears entirely under `@media print`

### 7.2 Breakpoints

| Name | Width | Behavior |
|---|---|---|
| `xs` | < 640px | Sidebar becomes a drawer (hamburger). 1-column grid. Charts → table or horizontal scroll. |
| `sm` | ≥ 640px | 2-column grid for KPIs. |
| `md` | ≥ 768px | Sidebar still a drawer. Content padding 24px. |
| `lg` | ≥ 1024px | **Permanent sidebar**, optional collapse to 72px (icons only). |
| `xl` | ≥ 1280px | Full layout, padding 40px. |
| `2xl` | ≥ 1536px | Content stays max 1180px, centered. |

The primary target is desktop (reports are compiled on laptops), but mobile must **genuinely work** — committees often check analysis status from their phones.

### 7.3 Landing grid

- Container `max-width: 1200px`, horizontal padding 24px (mobile) / 40px (desktop)
- Hero text block `max-width: 720px`, centered
- 12-column feature grid; text block 5 columns, visual 6 columns, 1-column gap
- Section vertical padding: 64px (mobile) / 96–128px (desktop)

---

## 8. Navigation — full list of buttons

### 8.1 App sidebar

**Block 1 — Brand (top)**

| Element | Detail |
|---|---|
| Logo mark | Ember triangle 34×34, `radius-md`, fill `--grad-primary-bright` |
| Wordmark | `SAMOSA` — 17px / 800 / white, + `AI` 11px / 600 / `ember-500` |
| Click target | Entire lockup → `/` (Beranda / Home) |

**Block 2 — Main navigation** (eyebrow `WORKSPACE`)

| # | Label | Icon (lucide) | Route | Role | Badge |
|---|---|---|---|---|---|
| 1 | **Beranda** (Home) | `layout-grid` | `/` | all | — |
| 2 | **Dataset** | `database` | `/datasets` | all | dataset count |
| 3 | **Laporan** (Reports) | `bar-chart-3` | `/reports` | all | report count |
| 4 | **Analisis Baru** (New Analysis) | `plus` | `/datasets/new` | owner, admin, member | — |
| 5 | **Pengaturan** (Settings) | `settings` | `/settings` | all | Ember dot when something needs attention |

> **IA decision:** the `/analysis/[id]` page is **not** a nav item. It is a transitional state reached from a dataset, and it disappears once finished. Users think in terms of "what I uploaded" → "the report I got," not in terms of "jobs." Showing jobs as a nav item would force them to understand our plumbing.

> **Role rule:** `viewer` **does not see** "Analisis Baru" (New Analysis) at all — not even in a disabled state. A dead button is more confusing than a button that isn't there.

**Block 3 — User card (bottom, floating)**

White card, `radius-xl`, `shadow-md`, 16px margin, on top of the dark sidebar background.

| Element | Detail |
|---|---|
| Name | 14px / 700 / `ink-900` |
| Email | 12px / 400 / `ink-500`, truncate |
| Divider | 1px `ink-200` |
| **Profil / Pengaturan** (Profile / Settings) | icon `user`, → `/settings/profile` |
| **Tema** (Theme) | icon `sun`/`moon`, inline toggle (does not change page) |
| **Keluar** (Log out) | icon `log-out`, `ink-700`; hover → `danger` |

**Block 4 — Organization indicator (very bottom)**

24px avatar + organization name + chevron. Click → organization picker popover if the user is a member of more than one; if only one, show as static text without a chevron.

### 8.2 Page header (inside content, not a top bar)

| Element | When it appears |
|---|---|
| Breadcrumb | All inner pages — `Laporan / Pensi 2026` (Reports / Pensi 2026) |
| Page title | Always |
| Status badge | Dataset, analysis, and report pages |
| **Ekspor PDF** (Export PDF) | Report page · outline · icon `file-text` |
| **Ekspor CSV** (Export CSV) | Report page · outline · icon `download` |
| **Buat ulang ringkasan** (Regenerate summary) | Report page · ghost · icon `refresh-cw` · **must state the cost** |
| **Analisis** (Analyze) | Dataset page · primary · shows cost estimate |
| **Hapus** (Delete) | Dataset page · ghost-danger · icon `trash-2` · owner/admin only |

The report header is **sticky**; other page headers are not.

### 8.3 Landing navbar (public)

| Position | Element | Type | Target |
|---|---|---|---|
| Left | Logo + wordmark | link | `/` |
| Center | **Fitur** (Features) | text link | `#fitur` |
| Center | **Cara Kerja** (How It Works) | text link | `#cara-kerja` |
| Center | **Harga** (Pricing) | text link | `/harga` |
| Center | **Blog** | text link | `/blog` |
| Right | **Masuk** (Log in) | ghost | `/login` |
| Right | **Mulai gratis** (Start free) | primary (gradient) | `/signup` |
| Mobile | Hamburger | icon `menu` | drawer |

Navbar is `sticky`, 68px tall, background `rgba(253,247,242,0.82)` + `backdrop-blur: 12px`; the `ink-200` bottom border appears only after scrolling > 8px.

### 8.4 Landing footer

Four columns: **Produk** (Product: Fitur/Features, Harga/Pricing, Changelog) · **Sumber** (Resources: Blog, Dokumentasi/Documentation, Panduan/Guides) · **Perusahaan** (Company: Tentang/About, Kontak/Contact) · **Legal** (Privasi/Privacy, Ketentuan/Terms — bilingual). Bottom row: logo, copyright, ID/EN language picker.

---

## 9. Components

### 9.1 Buttons

| Variant | Background | Text | Border | Usage |
|---|---|---|---|---|
| **primary** | `--grad-primary` | white | — | One per screen. Primary action. |
| **primary-bright** | `--grad-primary-bright` | **`ink-900`** | — | Landing hero only |
| **dark** | `ink-900` | `sand-25` | — | Secondary CTA on light areas |
| **secondary** | white | `ink-900` | `ink-200` | Companion action |
| **ghost** | transparent | `ink-700` | — | Tertiary action |
| **ghost-danger** | transparent | `danger` | — | Delete |
| **link** | — | `ember-600` | — | Inline, underline on hover |

**Sizes:**

| Size | Height | Padding-x | Text | Radius |
|---|---|---|---|---|
| `sm` | 34px | 12px | 13px / 600 | `radius-md` |
| `md` | 42px | 18px | 14px / 600 | `radius-lg` |
| `lg` | 50px | 26px | 15px / 600 | `radius-lg` |

**Behavior:**
- Hover: gradient shifts to `--grad-primary-hover`, `transform: translateY(-1px)`, `dur-fast`
- Active: `translateY(0)`, gradient 6% darker
- Focus: ring `2px ember-500` offset `2px` — **never removed**
- Loading: spinner replaces the icon, label changes to a progressive form ("Menganalisis…" / "Analyzing…"), button width is locked so it doesn't jump
- Disabled: opacity 0.45, `cursor: not-allowed` — only for temporary states (incomplete form), **not** for role restrictions

### 9.2 Sidebar navigation item

| State | Background | Text | Icon |
|---|---|---|---|
| Default | transparent | `rgba(255,255,255,0.68)` | same |
| Hover | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.92)` | same |
| **Active** | `rgba(255,255,255,0.10)` | white 600 | **`ember-500`** |
| Active (indicator) | 3px `ember-500` bar on the left, `radius-full` | | |

Height 44px, padding-x 14px, `radius-lg`, icon–label gap 12px, icon 18px.

### 9.3 Card

```
Background  #FFFFFF
Border      1px ink-200
Radius      radius-xl (14px)
Padding     24px
Shadow      none (default) → shadow-xs on hover if interactive
```

Variants: **`flat`** (background `sand-50`, no border — for information blocks), **`banner`** (background `--grad-banner`, `radius-2xl`, padding 40px), **`stat`** (background `--grad-stat-*`, padding 20px).

### 9.4 Badges & chips

| Type | Form |
|---|---|
| Status `siap` (ready) | `teal-500` dot + `teal-700` text · `teal-50` background · `radius-full` |
| Status `berjalan` (running) | pulsing `ember-500` dot + `ember-700` text · `ember-50` background |
| Status `sebagian` (partial) | `attention` dot + `attention-fg` text · `#FDF3E2` background |
| Status `gagal` (failed) | `negative` dot + `negative-fg` text · `#FBEEF1` background |
| Topic chip | `sand-100` background, `ink-700` text, `radius-full`, 12px — active: `ink-900` background, `sand-25` text |
| Evidence chip | `ember-100` background, `ember-700` text, `radius-sm`, **mono** 11px |
| Eyebrow chip | `teal-50` background, `teal-700` text, mono uppercase 11px, tracking 0.12em |

Badges **always** have a dot or icon beside the text — never color alone.

### 9.5 Charts (Recharts)

```
Grid            horizontal lines only, 1px, ink-200, no vertical lines
Axes            no axis lines; labels 12px ink-500
Bar radius      4px on top end only
Bar gap         28% of category width
Tooltip         white card, ink-200 border, shadow-sm, radius-md, padding 12px
Legend          top-left, 12px, 8px radius-full dot
Fill            SOLID — never gradient
Animation       600ms ease-out, once only on mount
Fallback        every chart must have an sr-only <table> that is shown in print
```

### 9.6 Empty, loading, error states

**Empty** — 40px line icon in `ink-300`, `h3` title, one explanatory sentence in `ink-500`, one primary button. The text teaches the first step rather than stating absence.

**Loading** — `sand-100` skeleton with a subtle 1.4s shimmer. **Not a spinner** for content. Spinners only inside buttons.

**Error** — background `#FBEEF1`, 1px `negative` border, `radius-lg`. Content: what happened, why, and **one concrete next step**. Always include a retry button if the operation can be repeated.

---

## 10. Page: Dashboard

Follows the direction of the reference image, with gradients added and hierarchy adjusted to the real features.

### 10.1 Arrangement

```
┌─ SIDEBAR ─┬─ CONTENT ───────────────────────────────────────┐
│           │                                                 │
│  [logo]   │  Minggu, 27 September 2026        ← mono, muted │
│           │  Selamat datang, Lesharo ✦        ← display-md  │
│  WORKSPACE│  Ubah aspirasi jadi keputusan.    ← body, muted │
│  ▸ Beranda│                              [+ Analisis Baru]  │
│  ▸ Dataset│                                                 │
│  ▸ Laporan│  ╔═══════════════════════════════════════════╗  │
│  ▸ Analisis  ║  BANNER — --grad-banner, radius-2xl        ║  │
│    Baru   │  ║                                           ║  │
│  ▸ Pengatur  ║  [teal chip: FEEDBACK INTELLIGENCE]        ║  │
│           │  ║                          ┌──────────────┐ ║  │
│           │  ║  Ubah feedback            │ report       │ ║  │
│           │  ║  jadi keputusan.          │ mockup       │ ║  │
│           │  ║  ↑ "keputusan" Ember      │ (white,      │ ║  │
│           │  ║                           │  tilted 3°,  │ ║  │
│           │  ║  Dari temuan ke bukti,    │  shadow-lg)  │ ║  │
│           │  ║  pola, prioritas.         └──────────────┘ ║  │
│  ┌──────┐ │  ║                                           ║  │
│  │ user │ │  ║  [Analisis feedback kamu →]  ← dark btn    ║  │
│  │ card │ │  ╚═══════════════════════════════════════════╝  │
│  └──────┘ │                                                 │
│           │  RUANG KERJA KAMU              ← mono eyebrow   │
│  [org ▾]  │  Analisis terbaru          [Lihat semua →]      │
│           │  ─────────────────────────────────────────────  │
│           │  [◫] Feedback Orientasi 2026                    │
│           │      22 Agu 2026 · Sekolah                      │
│           │                    310 respons  28%  ● Siap  ›  │
│           │  ─────────────────────────────────────────────  │
└───────────┴─────────────────────────────────────────────────┘
```

*UI copy glosses:* "Minggu, 27 September 2026" = Sunday, 27 September 2026 · "Selamat datang, Lesharo" = Welcome, Lesharo · "Ubah aspirasi jadi keputusan." = Turn aspirations into decisions. · "Ubah feedback jadi keputusan." = Turn feedback into decisions. · "Dari temuan ke bukti, pola, prioritas." = From findings to evidence, patterns, priorities. · "Analisis feedback kamu" = Analyze your feedback · "RUANG KERJA KAMU" = YOUR WORKSPACE · "Analisis terbaru" = Recent analyses · "Lihat semua" = See all · "Sekolah" = School · "respons" = responses · "Siap" = Ready.

### 10.2 Per-block details

**Greeting.** Date in JetBrains Mono 11px `ink-500`, full Indonesian format. User's name in `display-md` 800 followed by a ✦ glyph in `ember-500` — a brand motif, appearing only here and in the logo. One-sentence sub-line in `body` `ink-500`.

**New Analysis button.** Primary gradient, size `lg`, `plus` icon on the left, aligned to the greeting's baseline, at the far right.

**Banner.** `--grad-banner`, `radius-2xl`, padding 40px, height ±280px. Two columns: text 52%, visual 48%.
- Teal eyebrow chip on top
- Headline `display-lg`, two lines, second word colored `ember-500` (not gradient text — the size isn't large enough for that)
- Body one–two sentences, maximum 48 characters per line
- `dark` button, size `lg`, `arrow-right` icon on the right
- Visual: white report mockup, rotated 2–3°, `shadow-lg`, partially extending past the banner's right edge (`overflow: hidden` on the banner clips it — giving a sense of depth)
- The mockup contains **real** data from the user's latest report if available; a static example only for new accounts

**Recent analyses list.** Mono eyebrow `RUANG KERJA KAMU` (YOUR WORKSPACE), `h2` title, "Lihat semua" (See all) link in `ember-600` on the right. Rows are separated by `ink-200` lines, not separate cards. Each row: 40px `teal-50` square icon, name + meta, then on the right the response count, percentage (`teal-700`, mono, tabular), status badge, chevron.

Maximum 5 rows. Beyond that → "Lihat semua" (See all).

### 10.3 KPI cards (appear once the user has ≥1 report)

Four cards above the banner, 4-column grid (2 on tablet, 1 on mobile):

| Card | Content | Gradient |
|---|---|---|
| Total aspirations analyzed | `stat` number + this month's delta | `--grad-stat-teal` |
| Reports created | `stat` number | `--grad-stat-ember` |
| Average positive sentiment | percentage + mini sparkline | `--grad-stat-teal` |
| Estimated cost this month | Rupiah, mono | plain white |

The cost card is deliberately **not** gradient — money figures must feel factual, not promotional.

---

## 11. Page: Landing

The structure takes its rhythm from the reference: centered hero → product proof → trust strip → numbered how-it-works → alternating features → testimonials → results gallery → closing CTA.

### 11.1 Section order

```
01  NAVBAR            sticky, blur
02  HERO              headline, sub, CTA, social proof, gradient glow
03  SCREENSHOT        app mockup in a browser frame
04  TRUST STRIP       school/organization logos, grayscale
05  HOW IT WORKS      3 numbered steps 01 02 03
06  CORE FEATURES     3 alternating text/visual blocks
07  HONESTY           dark block: limitations & privacy
08  TESTIMONIALS      2-column grid
09  REPORT GALLERY    real report examples
10  CLOSING CTA       warm gradient
11  FOOTER            4 columns
```

### 11.2 Per-section specifications

**02 · Hero** — background `sand-25` + `--grad-hero-glow` behind the text (14% Ember radial at the top).
- Headline `display-xl`, two lines, centered, maximum 9 words
  → *"Ubah ratusan aspirasi jadi laporan siap-cetak."* (Turn hundreds of aspirations into print-ready reports.)
  The words "laporan siap-cetak" (print-ready reports) use `--grad-text-ember` (60px meets the gradient-text requirement)
- Sub `body-lg` `ink-500`, maximum 2 lines, max-width 620px
- CTA: primary `lg` **"Mulai gratis"** (Start free) + small text beside it *"— tanpa kartu kredit"* (— no credit card)
- Social proof: row of stacked avatars (4, 2px white ring) + `body-sm` `ink-500` text
  → *"Dipakai 120+ OSIS dan panitia di seluruh Indonesia"* (Used by 120+ student councils and committees across Indonesia)
- Vertical padding 128px top, 96px bottom

**03 · Product screenshot** — report page mockup in a browser frame (three mac dots, empty address bar), `radius-xl`, `shadow-lg`, max-width 1080px, shifted up `-64px` so it breaks through the hero's edge. What's shown: the full report page with insights + charts, not an empty screen.

**04 · Trust strip** — eyebrow `DIPAKAI OLEH` (USED BY), one row of grayscale logos at `opacity: 0.55`, 48px gap, `sand-50` background. Slow marquee if there are more than 6 logos.

**05 · How it works** — eyebrow `CARA KERJA` (HOW IT WORKS), `display-lg` headline *"Dari ekspor Google Forms ke laporan, tiga langkah."* (From Google Forms export to report, in three steps.), three-card grid.

Each card: ghost number `01` `02` `03` (48px, 800, `sand-300`), `h3` title, `body-sm` `ink-500` body, and **one real technical detail** that proves we're serious:

| # | Title | Detail mentioned |
|---|---|---|
| 01 | Unggah CSV atau Excel (Upload CSV or Excel) | Maximum 10 MB, 5,000 responses. Columns other than the aspiration text are not stored unless you tick them. |
| 02 | Satu klik analisis (One-click analysis) | Sentiment, topics, and keywords for every aspiration. Progress and cost visible in real time. |
| 03 | Baca, telusuri, ekspor (Read, explore, export) | Every number can be clicked through to its original quote. Export PDF or CSV. |

**06 · Core features** — eyebrow `FITUR` (FEATURES), headline *"Dibuat untuk laporan yang akan dipertanyakan orang."* (Built for reports that people will question.)

Three alternating blocks (text left / visual right, then reversed, then back again). Each block contains: a small eyebrow, `h2` title, 2–3 sentence body, a 3-line checklist (`check` icon `teal-500` 14px), and a ghost link-button with an `arrow-right` icon.

| Block | Title | Checklist |
|---|---|---|
| 1 | Setiap angka ada buktinya (Every number has evidence) | Insights quote original aspirations · Click through to the quote · Explore all responses |
| 2 | Yang tidak diketahui, disebutkan (What's unknown is stated) | Failure count shown · Aspirations without a topic are counted · Prompt version recorded |
| 3 | Laporan yang siap dibawa ke rapat (Reports ready to take to a meeting) | Paginated PDF export · CSV with full tags · Every chart has a table |

Each block's visual is a real slice of UI (insight card with evidence chips, data condition strip, export dialog) — not an illustration.

**07 · Honesty block** — background `ink-950` with `--grad-sidebar`, `radius-2xl`, padding 64px, `sand-25` text. Eyebrow `YANG PERLU KAMU TAHU` (WHAT YOU NEED TO KNOW). Two columns:
- Left: **Current limits** — maximum 5,000 responses per dataset, CSV/Excel only, Google Forms API coming later
- Right: **About your data** — other columns are not stored, the original file is deleted along with the dataset, isolation between organizations at the database level

Stating limitations on the landing page filters out users who would be disappointed — and that is beneficial. This block is also the most direct embodiment of the product's character.

**08 · Testimonials** — 2-column grid, `sand-50` cards without border, `radius-xl`, padding 28px. Quote in `body`, then 36px avatar + name 600 + role `body-sm` `ink-500`. Four cards.

**09 · Report gallery** — eyebrow `DIBUAT DENGAN SAMOSA` (MADE WITH SAMOSA), headline + sub. 3-column grid; each card: report thumbnail (alternating tint backgrounds `ember-50` / `teal-50` / `sand-100`), title, organization, response count. Anonymized if necessary.

**10 · Closing CTA** — background `--grad-banner`, `radius-2xl`, padding 80px, centered. `display-lg` headline, one-sentence sub, primary `lg` button, with a micro line below it *"Gratis untuk 3 analisis pertama · Tanpa kartu kredit"* (Free for the first 3 analyses · No credit card).

**11 · Footer** — background `ink-950`, text `sand-25`/`ink-400`, padding 64px top 32px bottom. Four columns + bottom row.

### 11.3 Section background rhythm

Alternating so the eye gets a rest:

```
Hero          sand-25 + glow
Screenshot    sand-25
Trust         sand-50
How it works  sand-25
Features      sand-50
Honesty       ink-950 (gradient)
Testimonials  sand-25
Gallery       sand-50
CTA           --grad-banner
Footer        ink-950
```

---

## 12. Do & Don't

### Color

**Do**
- Limit Ember to one primary action per screen
- Use `-600`/`-700` for colored text, `-500` for fills
- Give sentiment a text label beside its color
- Use `ink-500` for secondary text, not `ink-400`
- Raise brand color lightness in dark mode

**Don't**
- Don't use white text on `ember-500` (contrast 3.0:1)
- Don't use `ember` for negative sentiment — it's the brand color
- Don't use pure neutral grays; all neutrals have a warm undertone
- Don't use more than 3 colors in one chart unless the categories demand it
- Don't use color as the sole carrier of meaning

### Gradients

**Do**
- Limit to surfaces ≥120px
- Stay within one hue family
- Verify text contrast at the lightest point
- Provide a flat fallback for print

**Don't**
- Don't use gradients on chips, badges, icons, borders, or table rows
- Don't use gradients on chart fills — they falsify the perception of magnitude
- Don't do Ember→Teal (produces muddy brown in the middle)
- Don't use gradient text below 40px
- Don't use mesh, noise, or glassmorphism

### Layout

**Do**
- Keep prose at 680px, let charts widen up to 1100px
- Leave 48px between main sections
- Use borders as the primary separator, shadows only as needed
- Turn the sidebar into a drawer below 1024px

**Don't**
- No cards inside cards
- No more than one sticky element per page
- No infinite scroll in the response explorer — pagination can be cited
- Don't hide important info behind hover

### Components & language

**Do**
- Hide actions the role isn't permitted to perform
- State the cost estimate before any action that calls the model
- Write error messages that state the fix
- Use tabular numerals for all changing numbers

**Don't**
- Don't show disabled buttons for role restrictions
- Don't use spinners for content — use skeletons
- Don't use emoji in the product UI
- Never have SAMOSA introduce itself as a character, friend, or any persona. It is only "SAMOSA — asisten analisis feedback" (SAMOSA — feedback analysis assistant)

---

## 13. Implementation: tokens & Tailwind

### 13.1 CSS variables

```css
:root {
  /* Ember */
  --ember-50:#FEF4ED; --ember-100:#FDE6D5; --ember-200:#FAC9A9;
  --ember-300:#F7A674; --ember-400:#F4883F; --ember-500:#F26B24;
  --ember-600:#C24E16; --ember-700:#9E3F11; --ember-800:#7A300C;
  --ember-900:#561F07;

  /* Teal */
  --teal-50:#ECF8F6;  --teal-100:#D2EFE9; --teal-200:#A6DFD4;
  --teal-300:#71C9BA; --teal-400:#4BB3A2; --teal-500:#3A9E8D;
  --teal-600:#2F8172; --teal-700:#27685C; --teal-800:#1F5149;
  --teal-900:#173B35;

  /* Sand */
  --sand-25:#FDF7F2;  --sand-50:#FBF2EA;  --sand-100:#F6E9DD;
  --sand-200:#EFDCCB; --sand-300:#E3CBB4; --sand-400:#C9AC90;

  /* Ink */
  --ink-200:#DDD4C9; --ink-300:#C0B5AA; --ink-400:#9C9085;
  --ink-500:#7A6E64; --ink-600:#5A5048; --ink-700:#3D362F;
  --ink-800:#2A2521; --ink-900:#1A1613; --ink-950:#12100E;

  /* Semantic */
  --positive:#3A9E8D;  --positive-fg:#27685C;
  --attention:#E8A63C; --attention-fg:#8A5D12;
  --negative:#BE4A63;  --negative-fg:#8F2F44;
  --danger:#B4322E;    --info:#3A7EA1;

  /* Surface roles */
  --canvas:var(--sand-25);
  --surface:#FFFFFF;
  --surface-raised:var(--sand-100);
  --sidebar:var(--ink-950);
  --text:var(--ink-900);
  --text-muted:var(--ink-500);
  --border:var(--ink-200);

  /* Gradients */
  --grad-primary:linear-gradient(135deg,#C24E16 0%,#9E3F11 100%);
  --grad-primary-hover:linear-gradient(135deg,#D15A1C 0%,#AC4614 100%);
  --grad-primary-bright:linear-gradient(135deg,#F4883F 0%,#E05E1C 100%);
  --grad-banner:linear-gradient(145deg,#F4E5D6 0%,#EBD7C2 60%,#E5CDB4 100%);
  --grad-sidebar:linear-gradient(180deg,#1A1613 0%,#12100E 45%,#0F0D0B 100%);
  --grad-hero-glow:radial-gradient(ellipse 80% 55% at 50% 0%,
      rgba(242,107,36,.14) 0%, rgba(242,107,36,.05) 45%, transparent 75%);
  --grad-stat-teal:linear-gradient(160deg,#F0FAF8 0%,#DFF2EE 100%);
  --grad-stat-ember:linear-gradient(160deg,#FEF6F0 0%,#FBE7D8 100%);
  --grad-text-ember:linear-gradient(120deg,#F26B24 0%,#C24E16 100%);

  /* Radius */
  --radius-xs:4px; --radius-sm:6px;  --radius-md:8px;
  --radius-lg:10px; --radius-xl:14px; --radius-2xl:20px;

  /* Shadow */
  --shadow-xs:0 1px 2px rgba(26,22,19,.05);
  --shadow-sm:0 2px 8px rgba(26,22,19,.07);
  --shadow-md:0 8px 24px rgba(26,22,19,.10);
  --shadow-lg:0 20px 48px rgba(26,22,19,.14);

  /* Motion */
  --dur-instant:100ms; --dur-fast:160ms; --dur-base:220ms;
  --dur-slow:340ms;    --dur-chart:600ms;
  --ease-out:cubic-bezier(.2,0,.2,1);
  --ease-soft:cubic-bezier(.16,1,.3,1);
}

.dark {
  --canvas:#14110F;
  --surface:#1C1815;
  --surface-raised:#252019;
  --sidebar:#0D0B0A;
  --text:#F5EDE4;
  --text-muted:#A79A8E;
  --border:#332C26;
  --ember-500:#F5854A;
  --teal-500:#4FB8A6;
  --grad-banner:linear-gradient(145deg,#2A211A 0%,#221B15 100%);
}

@media (prefers-reduced-motion: reduce) {
  *,*::before,*::after {
    animation-duration:1ms !important;
    transition-duration:1ms !important;
  }
}

@media print {
  [class*="grad-"], .banner, .btn-primary { background-image:none !important; }
  .sidebar { display:none !important; }
  .chart-fallback-table { display:table !important; }
}
```

### 13.2 Tailwind config

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ember: { 50:'#FEF4ED',100:'#FDE6D5',200:'#FAC9A9',300:'#F7A674',
                 400:'#F4883F',500:'#F26B24',600:'#C24E16',700:'#9E3F11',
                 800:'#7A300C',900:'#561F07' },
        teal:  { 50:'#ECF8F6',100:'#D2EFE9',200:'#A6DFD4',300:'#71C9BA',
                 400:'#4BB3A2',500:'#3A9E8D',600:'#2F8172',700:'#27685C',
                 800:'#1F5149',900:'#173B35' },
        sand:  { 25:'#FDF7F2',50:'#FBF2EA',100:'#F6E9DD',
                 200:'#EFDCCB',300:'#E3CBB4',400:'#C9AC90' },
        ink:   { 200:'#DDD4C9',300:'#C0B5AA',400:'#9C9085',500:'#7A6E64',
                 600:'#5A5048',700:'#3D362F',800:'#2A2521',900:'#1A1613',
                 950:'#12100E' },
        positive:'#3A9E8D', attention:'#E8A63C',
        negative:'#BE4A63', danger:'#B4322E', info:'#3A7EA1',
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl':['60px',{lineHeight:'1.02',letterSpacing:'-0.035em',fontWeight:'800'}],
        'display-lg':['48px',{lineHeight:'1.05',letterSpacing:'-0.03em', fontWeight:'800'}],
        'display-md':['36px',{lineHeight:'1.1', letterSpacing:'-0.025em',fontWeight:'800'}],
        'stat':      ['34px',{lineHeight:'1',   letterSpacing:'-0.02em', fontWeight:'700'}],
        'eyebrow':   ['11px',{lineHeight:'1.3', letterSpacing:'0.14em',  fontWeight:'600'}],
        'micro':     ['11px',{lineHeight:'1.4', letterSpacing:'0.01em',  fontWeight:'500'}],
      },
      borderRadius: {
        xs:'4px', sm:'6px', md:'8px', lg:'10px', xl:'14px', '2xl':'20px',
      },
      boxShadow: {
        xs:'0 1px 2px rgba(26,22,19,.05)',
        sm:'0 2px 8px rgba(26,22,19,.07)',
        md:'0 8px 24px rgba(26,22,19,.10)',
        lg:'0 20px 48px rgba(26,22,19,.14)',
      },
      backgroundImage: {
        'grad-primary':       'var(--grad-primary)',
        'grad-primary-hover': 'var(--grad-primary-hover)',
        'grad-primary-bright':'var(--grad-primary-bright)',
        'grad-banner':        'var(--grad-banner)',
        'grad-sidebar':       'var(--grad-sidebar)',
        'grad-hero-glow':     'var(--grad-hero-glow)',
        'grad-stat-teal':     'var(--grad-stat-teal)',
        'grad-stat-ember':    'var(--grad-stat-ember)',
      },
      maxWidth: { spine:'680px', data:'1100px', shell:'1180px' },
      transitionDuration: { instant:'100ms', fast:'160ms', base:'220ms', slow:'340ms' },
    },
  },
} satisfies Config
```

### 13.3 Button component example

```tsx
// components/ui/button.tsx — additional variants on top of shadcn
const variants = {
  primary:
    'bg-grad-primary text-white shadow-none hover:bg-grad-primary-hover ' +
    'hover:-translate-y-px active:translate-y-0 transition-all duration-fast',
  primaryBright:
    'bg-grad-primary-bright text-ink-900 hover:brightness-105 ' +
    'transition-all duration-fast',
  dark:
    'bg-ink-900 text-sand-25 hover:bg-ink-800 transition-colors duration-fast',
  secondary:
    'bg-white text-ink-900 border border-ink-200 hover:bg-sand-50 ' +
    'transition-colors duration-fast',
  ghost:
    'text-ink-700 hover:bg-sand-100 transition-colors duration-fast',
  ghostDanger:
    'text-danger hover:bg-[#FBEEF1] transition-colors duration-fast',
}

const sizes = {
  sm: 'h-[34px] px-3 text-[13px] font-semibold rounded-md',
  md: 'h-[42px] px-[18px] text-sm font-semibold rounded-lg',
  lg: 'h-[50px] px-[26px] text-[15px] font-semibold rounded-lg',
}

// Focus ring is mandatory on all variants:
const focus =
  'focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ember-500 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-sand-25'
```

---

## 14. Review checklist

Before a page is considered done:

**Color & contrast**
- [ ] All text passes 4.5:1 (3:1 for ≥24px)
- [ ] No white text on `ember-500`
- [ ] Sentiment is readable without color
- [ ] Ember appears at most three times on one screen

**Gradients**
- [ ] No gradients on elements < 120px
- [ ] No gradients on chart fills, badges, or borders
- [ ] Text contrast verified at the gradient's lightest point
- [ ] Page still correct with gradients turned off (print)

**Layout**
- [ ] Prose ≤ 680px, charts ≤ 1100px
- [ ] No cards inside cards
- [ ] Works at 375px
- [ ] Sidebar disappears and charts have tables when printed

**Behavior**
- [ ] Actions not permitted for the role are hidden, not disabled
- [ ] Every costed action states its estimate
- [ ] Every process > 3 seconds shows numeric progress
- [ ] Focus ring visible on all interactive elements
- [ ] The whole page can be operated by keyboard

**Persona**
- [ ] There is not a single place where SAMOSA introduces itself as something

---
