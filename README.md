# Meridian Marketing Website

Professional marketing site for Meridian—the career center in your pocket. Built for college students.

## Static HTML (no server)

Multi-page site. All CSS and JavaScript are inline. Open `index.html` directly in your browser:

```bash
open projects/meridian/website/index.html
```

**Pages:**
- `index.html` — Home
- `tracks.html` — All cohorts (click to see majors)
- `track-pre-health.html`, `track-tech.html`, etc. — One page per cohort with majors listed

Works offline (except Google Fonts).

## Next.js version (optional)

```bash
cd projects/meridian/website
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

## Build (static export)

```bash
npm run build
```

Outputs to `out/` for static hosting (Vercel, Netlify, S3, etc.).

## Where things live (your domains)

- **meridian-careers.com** (or .org) — This marketing website. Deploy the static site here.
- **app.meridian-careers.com** — The audit app (Next.js dashboard in `projects/meridian/dashboard`). Users run resume audits, log in with .edu, get scores, Meridian Voice, etc. All “Start free” / “Run your audit” buttons on this site link here.

So: website = marketing; app subdomain = where the audit actually runs.

## Environment

- `NEXT_PUBLIC_APP_URL` — URL of the Meridian app (e.g. `https://app.meridian-careers.com`). All CTAs in the static HTML link to this.

## OG Image (social sharing)

Add `og-image.png` (1200×630px) to the website root for rich link previews on Twitter, LinkedIn, etc. The meta tags reference `https://meridian-careers.com/og-image.png`. Use your shareable score card or brand as the design.
