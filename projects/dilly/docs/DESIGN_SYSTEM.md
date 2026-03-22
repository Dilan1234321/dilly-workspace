# Meridian — Design System

One system for the whole app: onboarding (welcome → verify → theme → goals → Meridian explainer → resume → payment) and main app (Career Center, Hiring Manager, Meridian Voice). Use this so every screen feels like the same product.

---

## 1. Color

### Meridian base (logo-aligned)

The Meridian logo uses **dark grey** and **taupe/beige**. The UI follows this palette for a polished, professional look.

| Token | Hex | Use |
|-------|-----|-----|
| `--meridian-bg` | `#2a2a2a` | Main background |
| `--meridian-bg-deep` | `#1e1e1e` | Deeper surfaces, loading |
| `--meridian-surface` | `#3c3c3c` | Cards, raised surfaces |
| `--meridian-surface-raised` | `#454545` | Popovers, modals |
| `--meridian-taupe` | `#b3a79d` | Primary text, icons |
| `--meridian-taupe-bright` | `#c9bfb5` | Headings, emphasis |
| `--meridian-taupe-muted` | `#8a8279` | Muted text, labels |
| `--meridian-accent` | `#c9a882` | CTAs, primary buttons, key accents |
| `--meridian-accent-hover` | `#d4b896` | Button hover |
| `--meridian-border` | `rgba(179,167,157,0.18)` | Borders, dividers |

**CSS variables:** All tokens live in `globals.css` under `:root`. Use `var(--meridian-*)` for consistency.

### School theme (after verify)

When we know the user's school (e.g. from @spartans.ut.edu), we apply that school's theme. The base Meridian theme is used when no school is detected.

| Role | Use for |
|------|--------|
| **Primary** | Primary buttons, key accents, score highlights, links |
| **Secondary** | Badges, highlights, labels |
| **Background tint** | App background (dark) |

**Meridian base (default):**

- Primary: `#c9a882` (taupe accent)
- Secondary: `#b3a79d` (taupe)
- Background tint: `#2a2a2a`

**UTampa (school override):**

- Primary: `#C8102E` (UT Red)
- Secondary: `#FFCD00` (UT Golden Yellow)
- Background tint: `#0f172a`

Other schools: add to `dashboard/src/lib/schools.ts` with `primary`, `secondary`, `backgroundTint`.

### Neutrals (shared)

- Border: `var(--meridian-border)` or `var(--meridian-border-subtle)`
- Muted text: `var(--meridian-taupe-muted)`
- Error/destructive: `#e07a7a` or `var(--destructive)`

---

## 2. Typography

- **Font:** Geist Sans (or `var(--font-geist-sans)`), system-ui fallback. Already in use in dashboard.
- **Mono (labels, small caps):** Geist Mono.

**Scale (reference):**

| Use | Size | Weight |
|-----|------|--------|
| Hero / welcome headline | 2xl–4xl (1.5rem–2.25rem) | Bold (700) |
| Screen title | xl–2xl | Bold (700) |
| Section heading | base–lg | Semibold (600) |
| Body | sm–base (0.875rem–1rem) | Normal (400) |
| Supporting / captions | xs–sm | Normal or medium |
| Labels (e.g. uppercase) | 10px–xs | Medium, tracking-widest |

**Uppercase labels:** Small caps style for section labels (e.g. "Executive summary", "Cited from your resume"): `text-[10px] font-mono uppercase tracking-widest` with secondary or muted color.

**Capitalization:** Never use lowercase for user-facing text. Use Title Case for headings, labels, buttons, and nav items. Use Sentence case (first letter capitalized) for body copy. Placeholders use Title Case (e.g. "E.g. Jordan", "Add Deadline…").

**Punctuation (copy rule):** NEVER use em dashes (—) in user-facing or generated copy. They look unprofessional. Use a colon, period, or rephrase instead (e.g. "Grit: you demonstrated…" not "Grit—you demonstrated…").

---

## 3. Spacing and layout

- **Screen padding:** `p-4 sm:p-6 md:p-10` (mobile-first).
- **Section gap:** `space-y-6` or `space-y-8` between major blocks.
- **Card padding:** `p-5` to `p-8` depending on density.
- **Min touch target:** Buttons and tappable areas at least **44px** height (and width where appropriate) for mobile.

**Containers:** Max width for reading (e.g. `max-w-lg` or `max-w-xl`) for onboarding copy; full width for upload zones or nav.

---

## 4. Components

### Buttons

- **Primary:** Background = theme primary, text dark (for contrast), `rounded-xl`, `min-h-[44px]`, `font-semibold`. Hover: slight scale or shadow.
- **Secondary / outline:** Border = theme secondary or primary, text = theme color, transparent or subtle fill. Same min height and radius.
- **Destructive / cancel:** Muted or red; avoid primary color.

### Inputs (email, code, dropdown)

- **Search bar / email:** Rounded (e.g. `rounded-xl`), clear focus ring (theme primary or `var(--meridian-accent)`). Placeholder and label in muted when needed.
- **Verification code:** Same treatment; consider one input per digit or single field depending on UX.
- **Dropdown:** Same border/radius as inputs; option list styled for readability.

### Cards / surfaces

- **Background:** `var(--meridian-surface)` or `rgba(60, 60, 60, 0.5)`.
- **Border:** `1px` solid `var(--meridian-border)` or theme primary at low opacity.
- **Radius:** `rounded-xl` or `rounded-2xl` consistently.

### Logo

- Use `/dilly-logo.png` for branding. Logo is dark golden-brown serif "Dilly" text; works on `--meridian-bg` backgrounds.
- Header: `h-10 sm:h-12 w-auto`. Auth/welcome: `h-10 w-auto`.

---

## 5. Motion and delight

- **Transitions:** Use subtle transitions (e.g. `transition-colors`, `transition-opacity`, `0.2s cubic-bezier(0.4, 0, 0.2, 1)`) on buttons and interactive elements.
- **Animations:** `animate-fade-up`, `animate-score-in`, `voice-msg-ai`, `voice-msg-user` for polish.
- **School theme reveal:** Optional single motion when theme switches after verify. Keep it short.

---

## 6. Responsive and accessibility

- **Mobile-first:** Layout and touch targets (44px min) from 375px up.
- **No horizontal scroll:** `overflow-x-hidden`, `min-w-0` on flex/grid children where needed.
- **Contrast:** Ensure text on background and buttons meet minimum contrast; primary on dark or dark on primary.

---

## 7. Where this lives in code

- **Theme (school):** `dashboard/src/lib/schools.ts` — `SchoolTheme`, `SchoolConfig`, `MERIDIAN_BASE_THEME`, `getSchoolFromEmail`.
- **Globals:** `dashboard/src/app/globals.css` — `:root` Meridian vars, body, font, voice/calendar styles.
- **Usage:** Components use `theme.primary`, `theme.secondary`, `theme.backgroundTint` from school config (or `MERIDIAN_BASE_THEME` when no school).
- **Logo:** `dashboard/public/dilly-logo.png`.

When adding onboarding screens, reuse these tokens and components so the app feels like one product from welcome to Career Center.

---

*Updated for logo-aligned redesign. School overrides (e.g. UTampa) preserved.*
