# High priority: Master UI/UX

**Status:** In progress. Shared components added; onboarding partially migrated.

**Goal:** One consistent, polished UI/UX for onboarding and main app. Same component language and design tokens everywhere — no patchwork.

---

## Done so far

- **shadcn/ui initialized:** `dashboard/components.json` exists (style: base-nova, Tailwind v4, cssVariables). To add or replace components: `npx shadcn@latest add button input card label` (choose overwrite when prompted if replacing existing).
- **shadcn theme in globals.css:** `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--border`, `--radius`, etc. are set to Meridian/UTampa design system (dark app).
- **Shared UI components** in `dashboard/src/components/ui/`: `Button`, `Input`, `Card`, `Label` (design-system tokens, `cn()` from `@/lib/utils`). Can be gradually replaced with shadcn versions via `shadcn add` with overwrite.
- **Design tokens** in `globals.css`: `--meridian-primary`, `--meridian-secondary` (map to `--ut-red`, `--ut-gold`).
- **Onboarding** (partial): Welcome and Verify screens use `Button` + `Input`; School theme and Name step use `Button` + `Input`. Remaining steps still use raw `<button>`/`<input>` — migrate as you touch them.
- **Dependencies:** `tailwind-merge`, `clsx`, `class-variance-authority` in `package.json`; run `npm install` if needed.

---

## Why it’s high priority

- Onboarding and main app should feel like **one product** (same buttons, inputs, cards, spacing, typography).
- Phase 2 (Career Center, Hiring Manager, Meridian Voice) will be built next; building it on a shared component system from the start avoids rework.
- Design system already exists (`DESIGN_SYSTEM.md`); we need the code to use it consistently.

---

## Concrete steps

1. **Add shadcn/ui to the dashboard**
   - From `projects/meridian/dashboard`: `npx shadcn@latest init`
   - Add: `button`, `input`, `card`, `label` (and others as needed).

2. **Theme with the design system**
   - In `globals.css` (or shadcn theme layer): set CSS variables from `DESIGN_SYSTEM.md`.
   - Primary → UTampa red `#C8102E` (and school theme when we add more schools).
   - Secondary → UTampa gold `#FFCD00`.
   - Background / neutrals / borders → existing `--ut-*` and design system values.

3. **Use shared components everywhere**
   - **Onboarding:** Replace raw `<button>` and `<input>` with shadcn `Button`, `Input`, `Label`. Keep existing layout and UTampa onboarding layout (sunset, silhouettes); only swap primitives.
   - **Main app (Phase 2):** Build shell and sections (Career Center, Hiring Manager, Meridian Voice) with the same `Button`, `Input`, `Card`, and tokens.

4. **One source of truth**
   - All UI primitives come from the shared set. New screens use the same components and tokens. No one-off styles for “just this page.”

---

## Next (optional)

- Migrate remaining onboarding steps (Major, Pre-prof, Track, Goals, What is Meridian, Bridge, Resume, Payment) to use `Button` and `Input` where applicable.
- When building Phase 2 (main app shell), use `Button`, `Input`, `Card`, `Label` from `@/components/ui` from day one.

---

## References

- **Design system:** `docs/DESIGN_SYSTEM.md`
- **Copy and voice:** `docs/MERIDIAN_ONBOARDING_COPY.md`
- **School theme (code):** `dashboard/src/lib/schools.ts`
- **Roadmap:** `docs/ROADMAP.md` (High priority section)

---

*Added: March 2025. Treat as P0 until the shared component system is in place and used in both onboarding and main app.*
