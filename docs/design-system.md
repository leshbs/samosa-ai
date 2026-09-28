# SAMOSA Design System

**Version:** 1.0 (Claude Code Optimized)

A compact design system for implementing and maintaining SAMOSA's UI.

---

## 1. Product Philosophy

SAMOSA is a **report-building workspace**, not an analytics dashboard.

Design priorities:

1. Readability over density.
2. Evidence over decoration.
3. Trust over visual flair.
4. Fast path from upload → report → export.

**Never optimize for dashboard complexity. Optimize for producing a printable, explainable report.**

---

## 2. Brand Persona

### Voice

- Bahasa Indonesia.
- Sapaan **"kamu"**.
- Ringkas, jelas, faktual.
- Tidak menggunakan emoji di aplikasi.

### Identity Rules

- Refer only as **SAMOSA** or **asisten analisis feedback**.
- Never use first-person ("aku").
- Never behave like a chatbot character or mascot.

Good:

> 1.240 aspirasi siap dianalisis.

Bad:

> Hai! Aku SAMOSA 👋

---

## 3. Layout System

### Reading Spine

| Area | Width |
|------|------|
| Narrative text | 680px max |
| Charts / tables / explorer | 1100px max |

### Grid & Spacing

- Base unit: **4px**
- Section spacing: **48px**
- Internal spacing: **16–24px**

### Radius

| Component | Radius |
|-----------|--------|
| Card | 12px |
| Controls | 8px |
| Chip | 6px |

### Elevation

- Single shadow level only.
- Prefer border + whitespace over stacked shadows.
- Never nest cards inside cards.

### Sticky Rules

Allowed:
- Report header.

Not allowed:
- Sticky sidebar.
- Sticky filters.
- Sticky floating widgets.

---

## 4. Color System

### Palette

Primary palette remains **Forest Green**.

### Forbidden Effects

- Gradient backgrounds.
- Glassmorphism.
- Mesh/noise textures.
- Startup-style colorful dashboards.

### Charts

- Maximum three colors.
- Always include text labels.

### Dark Mode

Use warm dark surfaces instead of neutral gray inversion.

---

## 5. Navigation Rules

Always include:

- Breadcrumb.
- Visible back path.
- Wizard supports backward navigation without data loss.

### Permissions

Hide unavailable actions entirely.

Never show disabled buttons for unauthorized roles.

Roles:

- owner/admin
- member
- viewer

---

## 6. Report Page Architecture

Mandatory order:

1. Sticky report header.
2. Data condition strip.
3. Executive summary.
4. Insight cards.
5. Charts.
6. Topic disclosure.
7. Response explorer.
8. Provenance strip.

Do not reorder sections.

---

## 7. Interaction Principles

### P1 — Evidence First

Every metric must open its supporting evidence.

Interactions:

- Stat tile → Response Explorer.
- Insight chip → Quotes panel.
- Chart bar → Filter explorer.
- Quote → Full response.

Evidence opens inline.

---

### P2 — Surface Missing Data

Always display:

- analyzed responses
- failed responses
- responses without topic
- partial batch state

Use neutral information styling.

---

### P3 — Arithmetic Must Reconcile

- Charts account for all mentions.
- Always include **Lainnya** bucket.
- Never normalize incomplete totals.

---

### P4 — Privacy by Default

Upload defaults:

- Keep response text only.
- Additional columns unchecked.
- Explicit kept-column summary.

Display:

> Kolom lain tidak disimpan.

---

### P5 — Never Wait Silently

Progress pages always show:

- percentage
- processed count
- failed count
- current model
- running cost estimate
- status message

Never use spinner alone.

---

### P6 — Cost Before AI

Before every paid AI action:

> Estimasi Rp X–Y

Regenerate Summary explicitly states it triggers a new AI request.

Never auto-run regenerate on page load.

---

### P7 — Safe Destructive Actions

Delete confirmations specify exactly what is removed.

Prefer Undo over confirmation when recoverable.

---

### P8 — Accessible Without Color

Every chart requires:

- text labels
- printable table fallback
- keyboard navigation
- WCAG AA contrast
- black-and-white print readability

Sentiment cannot rely on color alone.

---

## 8. Response Explorer Specification

Required features:

- Search.
- Sentiment filter.
- Topic chips (top 12).
- Confidence sorting.
- Pagination (20/page).

No infinite scroll.

---

## 9. Data Visualization Rules

### Every Chart

Must provide:

- clickable interaction
- tooltip
- printable table fallback

### Required Charts

1. Sentiment distribution.
2. Top 10 topics.
3. Top keywords.
4. Topic × sentiment stacked bar.

---

## 10. States

### Empty State

Teach first action.

### Loading State

Always numeric progress.

### Error State

Explain:

1. What failed.
2. Why.
3. How to fix it.

### Partial State

Show warning badge and analyzed count.

---

## 11. Microcopy Rules

### Numbers

Never inflate.

Use exact percentages.

### Errors

Always include recovery action.

### Confidence

Low-confidence AI output must be labeled.

---

## 12. Accessibility

Minimum requirements:

- Keyboard accessible.
- Focus states visible.
- Contrast ≥ 4.5.
- Screen-reader tables.
- Mobile friendly.
- Print friendly.

---

## 13. Print Mode

Hide:

- Sidebar.
- Navigation.
- Floating controls.

Keep:

- Executive summary.
- Insight cards.
- Charts.
- Tables.
- Provenance.

---

## 14. Component Rules

### Cards

- Single surface.
- No nested cards.
- Section separation via whitespace/dividers.

### Buttons

Primary:
- Filled forest green.

Secondary:
- Outline.

Danger:
- Red only for destructive actions.

### Chips

Used for:

- Topics.
- Evidence.
- Filters.
- Status.

### Tables

- Sticky header only if needed.
- Zebra optional.
- Always printable.

---

## 15. Claude Code Constraints

Do not modify:

- Backend logic.
- Supabase schema.
- API contracts.
- Analysis pipeline.
- AI prompts.
- Authentication.
- Routing.
- Business logic.

Modify only:

- UI layout.
- Components.
- Typography.
- Spacing.
- Colors.
- States.
- Accessibility.
- Microcopy.
- Responsive behavior.

---

## 16. Design Review Checklist

- Every metric links to evidence.
- Failed/unknown data is visible.
- Totals reconcile.
- Privacy defaults are safe.
- Long tasks show numeric progress.
- Paid actions show cost first.
- Every page has a way back.
- Every page works without color and in print.

**Golden Rule:** Every screen should help users reach a report they can confidently defend in a meeting.
