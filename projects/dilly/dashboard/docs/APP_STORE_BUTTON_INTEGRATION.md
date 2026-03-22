# App Store Button — Integration Notes

This project already supports the integration:

- **shadcn-style structure**: `components.json` with `@/components`, `@/lib/utils`, `@/components/ui`
- **Tailwind CSS**: via `tailwindcss` and `src/app/globals.css`
- **TypeScript**: enabled

## Default paths

| Purpose        | Path                    |
|----------------|-------------------------|
| UI components  | `src/components/ui/`    |
| Utils (e.g. `cn`) | `src/lib/utils.ts`  |
| Styles         | `src/app/globals.css`   |

## Why `src/components/ui` matters

- **shadcn CLI** installs components into `components/ui` by default. Using the same path keeps add-ons and custom components (like `AppStoreButton`) in one place and avoids alias/import mismatches.
- If your project used a different path (e.g. `src/components/buttons/`), you’d either:
  1. Configure shadcn to use that path in `components.json` → `aliases.ui`, or  
  2. Create `src/components/ui` and put shadcn + shared UI there so `@/components/ui` stays the single source for design-system components.

## What was added

1. **`src/components/ui/app-store-button.tsx`**  
   - Uses existing `Button` and `buttonVariants`, `cn` from `@/lib/utils`.  
   - Optional `href`: when set, renders an `<a>` styled like the button (for App Store link).  
   - No extra NPM deps (CVA and Button already in the app).

2. **`src/components/ui/play-store-button.tsx`**  
   - Same pattern: uses `Button` and `buttonVariants`, optional `href` for Google Play link. "GET IT ON" + "Google Play" label and Play Store icon (inline SVG).

3. **Demo page**: `src/app/app-store-demo/page.tsx`  
   - Route: `/app-store-demo`.  
   - Renders `AppStoreButton` with `href="https://apps.apple.com"`; replace with your app’s App Store URL when ready.

## Usage

```tsx
import { AppStoreButton } from "@/components/ui/app-store-button";

// As a link (recommended for App Store)
<AppStoreButton href="https://apps.apple.com/app/your-app/id123" />

// As a button (e.g. for “coming soon”)
<AppStoreButton />
```

**Play Store:** `import { PlayStoreButton } from "@/components/ui/play-store-button";` — Use `<PlayStoreButton href="https://play.google.com/store/apps/details?id=your.package" />` for a link, or `<PlayStoreButton />` as a button.

## If starting from a project without shadcn

1. **Tailwind**: `npm install -D tailwindcss postcss autoprefixer` and run `npx tailwindcss init`.  
2. **TypeScript**: `npm install -D typescript @types/react @types/node` and add `tsconfig.json`.  
3. **shadcn**: `npx shadcn@latest init` and choose the default `components/ui` so the App Store button (and any shadcn components) live under `@/components/ui`.  
4. **Dependencies for Button + this component**: `npm install class-variance-authority clsx tailwind-merge`; if you use Radix Slot in Button, add `@radix-ui/react-slot`.
