# Launch Dilly marketing site (GoDaddy domain)

You have the domain on GoDaddy. Next: **host the files** and **point the domain** to that host.

---

## Option A: Vercel (recommended, free)

1. **Push your code to GitHub** (if not already).
2. **Go to [vercel.com](https://vercel.com)** → Sign in with GitHub.
3. **New Project** → Import your repo.
4. **Configure:**
   - **Root Directory:** `projects/dilly/website` (or the folder that contains `index.html`, `styles.css`, etc.)
   - **Framework Preset:** Other (static)
   - Deploy.
5. **Add your domain:** Project → Settings → Domains → Add `trydilly.com` and `www.trydilly.com`.
6. **In GoDaddy (DNS):**
   - Go to [GoDaddy Domain Manager](https://dcc.godaddy.com/) → your domain → DNS or Manage DNS.
   - Either:
     - **Use Vercel nameservers:** Replace GoDaddy nameservers with the ones Vercel shows (e.g. `ns1.vercel-dns.com`, `ns2.vercel-dns.com`), **or**
     - **Keep GoDaddy DNS:** Add these records:
       - Type **A**, Name **@**, Value **76.76.21.21**
       - Type **CNAME**, Name **www**, Value **cname.vercel-dns.com**
   - Save. DNS can take a few minutes up to 48 hours.
7. Vercel will issue a free SSL certificate; your site will be `https://trydilly.com`.

---

## Option B: Netlify (free)

1. **Go to [netlify.com](https://netlify.com)** → Sign in (e.g. with GitHub).
2. **Add new site** → Import from Git (or “Deploy manually” and drag the `website` folder).
3. If from Git: set **Base directory** to `projects/dilly/website`, **Publish directory** to `.` (or leave default).
4. Deploy.
5. **Domain:** Site settings → Domain management → Add custom domain → `trydilly.com` and `www.trydilly.com`.
6. **In GoDaddy DNS:** Netlify will show what to add. Usually:
   - **A** record: Name **@**, Value **75.2.60.5**
   - **CNAME**: Name **www**, Value **your-site-name.netlify.app**
7. Netlify provisions SSL automatically.

---

## Option C: Cloudflare Pages (free)

1. **Go to [pages.cloudflare.com](https://pages.cloudflare.com)** → Create project → Connect to Git.
2. Select repo, set **Build** to “None” (static), **Build output directory** to `projects/dilly/website` (or upload the folder).
3. Deploy.
4. **Add domain:** Pages project → Custom domains → Add `trydilly.com`.
5. **In GoDaddy:** Change nameservers to the ones Cloudflare gives you (e.g. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`). Then in Cloudflare, DNS is managed there; SSL is automatic.

---

## After DNS propagates

- Open `https://trydilly.com` and `https://www.trydilly.com`.
- In your site, all links already use `https://trydilly.com` and `https://app.trydilly.com` for the app; no code change needed for the domain.

## Checklist

- [ ] Code pushed to GitHub (or zip of `website` folder for manual deploy).
- [ ] Static site deployed on Vercel / Netlify / Cloudflare Pages.
- [ ] Custom domain added in the host’s dashboard.
- [ ] GoDaddy DNS updated (A + CNAME, or nameservers).
- [ ] Wait for DNS (often 5–60 minutes).
- [ ] Test https://trydilly.com and https://www.trydilly.com.
