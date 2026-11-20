# 27 — NOORDWYK DPS Design System

Official identity: **NOORDWYK DPS** · _Dental Practice Management System_ · punchline **"Better care. Smarter practice."**
Strings live in one place, `apps/web/src/lib/brand.ts`. Do not add alternative slogans.

Personality: modern clinical, minimal, professional. Forest-green navigation, bright white workspace.
Stack: Next.js 15, Tailwind 3, `class-variance-authority`, Lucide icons, Inter (self-hosted via
`@fontsource-variable/inter`; the CSP only allows same-origin fonts, so no Google Fonts request is made).

## 1. Tokens (single source: `apps/web/src/app/globals.css`, mapped in `tailwind.config.ts`)

| Token                   | Hex                             | Use                                                                |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `forest` / `sidebar`    | `#174D36`                       | Sidebar, modal backdrop tint, brand headings                       |
| `brand`                 | `#239B65`                       | Active-nav indicator, focus ring, tab underline, icons, brand mark |
| `primary`               | `#1B7F52`                       | **Button fills and links that carry text** (see contrast note)     |
| `accent` (fresh mint)   | `#DDF3E6`                       | Selected backgrounds, avatars, KPI icon tiles                      |
| `muted` (soft sage)     | `#EDF4EF`                       | Secondary surfaces, table headers, segmented-tab track             |
| `card`                  | `#FFFFFF`                       | Workspace surfaces                                                 |
| `background` (canvas)   | `#F7FAF8`                       | Application background                                             |
| `foreground` (charcoal) | `#26352D`                       | Primary text                                                       |
| `muted-foreground`      | `#5B6B62`                       | Secondary text (5.4:1 on canvas)                                   |
| `border` / `input`      | `#D5E2DA` / form-control border | Green-tinted borders                                               |
| `sidebar-active`        | `#216147`                       | Lighter green for the active nav item                              |
| `sidebar-muted`         | ≈`#BCD0C3`                      | Sidebar captions (>5:1)                                            |

### Contrast note — a deliberate deviation to review

White text on the official healthcare green `#239B65` is **3.53:1**, below the WCAG AA minimum of 4.5:1
for normal text, and the app's automated axe scans enforce AA. So `#239B65` is used for **non-text**
indicators (≥3:1 is the non-text requirement), while **filled buttons and link text use `#1B7F52`
(5.0:1)**, visibly the same green family. If the brand owner requires `#239B65` on buttons, text on them
would have to be dark/large, or the accessibility target relaxed — a decision for the client.

### Status semantics (never reuse a tone for another meaning)

| Tone                                 | Meaning                                 | Examples                                                |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------- |
| success (green, distinct from brand) | completed / confirmed / paid / settled  | Completed appointment, posted invoice, payment recorded |
| warning (amber)                      | pending / needs attention / in progress | Checked-in, "Patient owes", active finding on tooth     |
| danger (red)                         | critical / failed / overdue             | Severe allergy alert, no-show, reversed payment         |
| info (blue)                          | informational                           | Scheduled appointment                                   |
| brand / mint                         | selected or contextual                  | Practice badges                                         |
| neutral                              | no status                               | Cancelled                                               |

Appointment status mapping is centralised in `lib/status.ts`. Financial state (payment status) and
clinical state (chart findings) intentionally use different shapes (badges vs tooth markers).

## 2. Typography, spacing, radii

- Inter variable; page title 24px/semibold; section/card title 14px/semibold; body 14px; captions 12px.
- Numerics use `tabular-nums`; money is formatted `R 1 234,56` by `lib/money.ts`.
- Radii: `sm 6 · md 8 · lg 10px`. Controls 40px tall (sm 32, lg 44). Cards 20px padding. Page padding 16/24/32px.
- Shadows: `shadow-card` (hairline) and `shadow-pop` (dialogs/toasts) only. No gradients.

## 3. Components (`apps/web/src/components`)

| Component                                   | File                                                                   | Notes                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Button (+ `buttonVariants` for links)       | `ui/button.tsx`                                                        | default · secondary · outline · ghost · danger; sm/default/lg/icon                                         |
| Input, Select, Field                        | `ui/input.tsx`, `select.tsx`, `field.tsx`                              | Visible border ≥3:1, hover, disabled, `aria-invalid`                                                       |
| Card                                        | `ui/card.tsx`                                                          |                                                                                                            |
| Badge                                       | `ui/badge.tsx`                                                         | neutral · brand · success · warning · danger · info                                                        |
| Table                                       | `ui/table.tsx`                                                         | Scrolls horizontally on small screens; `numeric` right-aligns                                              |
| Tabs                                        | `ui/tabs.tsx`                                                          | WAI-ARIA tabs, arrow/Home/End keys; panels stay mounted; `underline` (primary) and `pills` (secondary)     |
| Dialog                                      | `ui/dialog.tsx`                                                        | Native `<dialog>`: focus trap, Esc, inert background (available; existing flows still use browser confirm) |
| PageHeader, StatCard                        | `ui/page-header.tsx`, `ui/stat-card.tsx`                               |                                                                                                            |
| Toast (notifications)                       | `toast.tsx`                                                            | Single live-region feedback channel                                                                        |
| Empty / Error / Loading states, Skeleton    | `ui/states.tsx`, `ui/skeleton.tsx`                                     |                                                                                                            |
| AppShell, Breadcrumbs, AppFooter, BrandMark | `app-shell.tsx`, `breadcrumbs.tsx`, `app-footer.tsx`, `brand-mark.tsx` |                                                                                                            |

Icons: Lucide only; no emoji. The N monogram is an original SVG (`brand-mark.tsx`).

## 4. Layout

- **Sidebar** (forest): brand, grouped navigation (Practice · Management · Account) filtered by the
  user's permissions, lighter-green active item with a brand-green indicator bar, collapse to an icon rail on
  desktop (preference remembered in `localStorage`), off-canvas drawer below 1024px. A closed drawer is
  `visibility:hidden`, so its links are not reachable by keyboard or screen reader.
- **Header**: breadcrumbs (route-derived, never show IDs), signed-in user + role, sign out.
- **Footer**: `NOORDWYK DPS · Better care. Smarter practice.` on every authenticated page and the sign-in
  page; hidden when printing.
- **Patient area**: persistent patient header (identity, age, mobile, practice, **severe-allergy alert**) with
  Overview · Clinical record · Billing section tabs; the record is loaded once and shared.

## 5. Responsive behaviour

Desktop is primary. Laptop: full sidebar. Tablet (≈820px): drawer navigation; dental chart quadrants side by
side. Mobile (≈390px): drawer, 2×2 KPI grid, stacked chart quadrants (8 teeth per row, ≥36px targets), tables
scroll horizontally, patient header wraps. Verified by e2e (`05-design.spec.ts`): no horizontal page scroll at
390/820/1366px on main screens, drawer behaviour, and tooth target sizes.

## 6. Clinical safety rules for design changes

Severe-allergy alert stays in the persistent patient header on every patient tab. FDI order and quadrant
orientation (patient's right on the viewer's left) must not change. Never trade tooth-button size for density.
Do not add fabricated figures to any screen; dashboard tiles show only data the API returns for the user's role.

## 7. Screens redesigned

Sign-in · Overview (role-aware dashboard) · Patient directory · Patient header + Overview (personal details,
emergency contacts, medical history and allergies) · Clinical record (encounters, dental chart, treatment
plans, imaging) · Billing and account · Appointments. All other screens (practices, staff, reports, audit,
password, two-factor, register patient, duplicate review, printable invoice/statement) inherit the new tokens,
buttons, inputs, badges, cards, shell and footer but were **not individually redesigned**.

## 8. Known limitations

- **Notifications:** there is no notification feature in the system, so the header has no bell; one would be
  fake. Add it when a real notification source exists.
- **Dashboard metrics:** total registered patients, active treatment plans and "recent patient activity" have
  no supported API aggregate, so they are not shown. Tiles shown: today's appointments, new patients (30 days),
  outstanding invoices, payments received (30 days), plus per-practice performance and, for audit readers,
  recent audited actions. The former "Delivery roadmap" developer card was removed from the dashboard.
- **Directory filters:** the API supports name/phone/ID and date of birth only; there is no status or
  practice filter (search returns active patients only). Mobile number was added to results (additive API field).
- **Calendar:** day and week list views only (no hour-grid); `window.confirm/prompt` still used for post-invoice and
  reverse-payment confirmation (the Dialog component exists for a later migration).
- Manual screen-reader testing, a visual-regression suite and non-Chromium browsers remain untested.
