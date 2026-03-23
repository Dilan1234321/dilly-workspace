#!/usr/bin/env python3
"""Apply shared Tailwind nav/footer/head to marketing HTML files (root only)."""
from __future__ import annotations

import html as html_lib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FAVICON = """<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect fill='%234f46e5' width='32' height='32' rx='6'/><text x='16' y='22' font-size='18' font-weight='bold' fill='white' text-anchor='middle' font-family='sans-serif'>D</text></svg>">"""

NAV = """  <header class="site-header sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-xl">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 md:px-8 md:py-4">
      <a href="index.html" class="relative z-[120] flex shrink-0 items-center">
        <img src="dilly-wordmark.png" alt="Dilly" class="site-header-logo shrink-0" width="612" height="408" decoding="async" />
      </a>
      <button type="button" class="relative z-[120] rounded-xl px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 md:hidden" id="navMenuToggle" aria-label="Open menu" aria-expanded="false" aria-controls="navMenuPanel">Menu</button>
      <div class="nav-menu-panel fixed inset-0 z-[100] hidden overflow-y-auto overscroll-contain border-0 bg-[#0a0a0a]/98 backdrop-blur-xl md:static md:inset-auto md:z-auto md:flex md:max-h-none md:flex-1 md:flex-row md:justify-end md:overflow-visible md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none" id="navMenuPanel">
        <nav class="mx-auto flex w-full max-w-lg flex-col gap-1 px-6 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(6.5rem,env(safe-area-inset-top,0px)+1.5rem)] md:mx-0 md:max-w-none md:flex-row md:items-center md:gap-0 md:rounded-full md:bg-zinc-900/90 md:p-1.5 md:pl-3 md:ring-1 md:ring-white/10 md:px-0 md:pb-0 md:pt-0">
          <a href="features.html" class="rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">Features</a>
          <a href="how-it-works.html" class="rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">How it works</a>
          <a href="tracks.html" class="rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">Tracks</a>
          <a href="pricing.html" class="rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">Pricing</a>
          <a href="https://app.trydilly.com" target="_blank" rel="noopener noreferrer" data-cta="nav" class="mt-4 inline-flex w-full min-h-[48px] items-center justify-center rounded-2xl bg-[#c5a353] px-5 py-3 text-base font-semibold text-zinc-950 shadow-lg shadow-black/20 transition hover:brightness-110 md:mt-0 md:ml-1 md:w-auto md:rounded-full md:py-2 md:text-sm">Get Your Dilly Score</a>
        </nav>
      </div>
    </div>
  </header>
"""

STICKY = """  <div class="fixed bottom-0 left-0 right-0 z-50 translate-y-full border-t border-white/10 bg-[#141416]/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-transform duration-300 md:py-4" id="sticky-cta">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-3">
      <span class="hidden text-sm font-medium text-zinc-400 sm:inline">Ready to see your score?</span>
      <a href="https://app.trydilly.com" target="_blank" rel="noopener noreferrer" data-cta="sticky" class="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-2xl bg-[#c5a353] px-6 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/30 transition hover:brightness-110 sm:flex-none">Get Your Dilly Score</a>
    </div>
  </div>
"""

FOOTER = """  <footer class="border-t border-white/10 bg-[#0a0a0a] py-12">
    <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 px-5 md:flex-row md:px-8">
      <a href="index.html" class="site-footer-brand inline-flex items-center">
        <img src="dilly-wordmark.png" alt="Dilly" class="site-footer-logo shrink-0" width="612" height="408" decoding="async" />
      </a>
      <div class="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-zinc-400">
        <a href="index.html" class="hover:text-white">Home</a>
        <a href="features.html" class="hover:text-white">Features</a>
        <a href="how-it-works.html" class="hover:text-white">How it works</a>
        <a href="the-app.html" class="hover:text-white">The app</a>
        <a href="your-journey.html" class="hover:text-white">Your journey</a>
        <a href="tracks.html" class="hover:text-white">Tracks</a>
        <a href="quiz.html" class="hover:text-white">Quiz</a>
        <a href="pricing.html" class="hover:text-white">Pricing</a>
        <a href="recruiters.html" class="hover:text-white">Recruiters</a>
        <a href="for-parents.html" class="hover:text-white">Parents</a>
        <a href="trust.html" class="hover:text-white">Trust</a>
        <a href="about.html" class="hover:text-white">About</a>
      </div>
    </div>
    <p class="mt-8 text-center text-xs text-zinc-500">© <span id="year"></span> Dilly. The career center in your pocket.</p>
  </footer>
"""

SCRIPTS = """  <script src="site-nav.js"></script>
  <script src="analytics.js"></script>
  <script src="site-page.js"></script>
"""

SKIP = {"index.html"}
# Rewritten by hand (Tailwind): tracks hub + per-track landings
ALSO_SKIP = {
    "tracks.html",
}


def extract_tag(html: str, name: str, default: str = "") -> str:
    m = re.search(rf"<{name}[^>]*>([\s\S]*?)</{name}>", html, re.IGNORECASE)
    raw = m.group(1).strip() if m else default
    return html_lib.unescape(raw)


def extract_meta(html: str, attr: str) -> str | None:
    m = re.search(
        rf'<meta\s+name=["\']{re.escape(attr)}["\']\s+content=["\']([^"\']*)["\']',
        html,
        re.IGNORECASE,
    )
    if m:
        return html_lib.unescape(m.group(1))
    m = re.search(
        rf'<meta\s+content=["\']([^"\']*)["\']\s+name=["\']{re.escape(attr)}["\']',
        html,
        re.IGNORECASE,
    )
    return html_lib.unescape(m.group(1)) if m else None


def extract_og(html: str, prop: str) -> str | None:
    m = re.search(
        rf'<meta\s+property=["\']{re.escape(prop)}["\']\s+content=["\']([^"\']*)["\']',
        html,
        re.IGNORECASE,
    )
    if m:
        return html_lib.unescape(m.group(1))
    m = re.search(
        rf'<meta\s+content=["\']([^"\']*)["\']\s+property=["\']{re.escape(prop)}["\']',
        html,
        re.IGNORECASE,
    )
    return html_lib.unescape(m.group(1)) if m else None


def extract_canonical(html: str) -> str | None:
    m = re.search(
        r'<link\s+rel=["\']canonical["\']\s+href=["\']([^"\']*)["\']',
        html,
        re.IGNORECASE,
    )
    return m.group(1) if m else None


def strip_scripts(html: str) -> tuple[str, list[str]]:
    scripts: list[str] = []
    pattern = re.compile(r"<script[^>]*>[\s\S]*?</script>", re.IGNORECASE)

    def grab(m: re.Match[str]) -> str:
        scripts.append(m.group(0))
        return ""

    content = pattern.sub(grab, html)
    return content.strip(), scripts


def build_head(title: str, description: str, canonical: str, og_url: str, og_title: str, og_desc: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{description}">
  <link rel="canonical" href="{canonical}">
  <meta property="og:url" content="{og_url}">
  <meta property="og:title" content="{og_title}">
  <meta property="og:description" content="{og_desc}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta property="og:image" content="https://trydilly.com/og-image.png">
  <meta name="twitter:image" content="https://trydilly.com/og-image.png">
  {FAVICON}
  <link rel="manifest" href="manifest.json">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="site-tailwind-config.js"></script>
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="site-styles.css">
</head>
<body class="bg-surface text-ink antialiased selection:bg-emerald-500/25 selection:text-white">
"""


def process_file(path: Path) -> None:
    raw = path.read_text(encoding="utf-8")
    if "<!-- CHROME_APPLIED -->" in raw:
        return

    if path.name in ALSO_SKIP:
        print(f"skip (manual): {path.name}", file=sys.stderr)
        return

    # Skip pages with large inline theme blocks (handled separately)
    if path.name.startswith("track-") and path.name != "track-template.html":
        head_snip = raw[:8000]
        if head_snip.count("<style") > 0 and len(re.findall(r"<style[^>]*>[\s\S]*?</style>", head_snip[:6000])) > 0:
            inner_style = re.search(r"<style[^>]*>[\s\S]*?</style>", head_snip)
            if inner_style and len(inner_style.group(0)) > 400:
                print(f"skip (inline styles): {path.name}", file=sys.stderr)
                return

    title = extract_tag(raw, "title") or "Dilly"
    description = extract_meta(raw, "description") or ""
    canonical = extract_canonical(raw) or f"https://trydilly.com/{path.name}"
    og_url = extract_og(raw, "og:url") or canonical
    og_title = extract_og(raw, "og:title") or title.replace("\n", " ").strip()
    og_desc = extract_og(raw, "og:description") or description

    title = html_lib.escape(title)
    description = html_lib.escape(description)
    canonical = html_lib.escape(canonical)
    og_url = html_lib.escape(og_url)
    og_title = html_lib.escape(og_title)
    og_desc = html_lib.escape(og_desc)

    m = re.search(r"<body[^>]*>([\s\S]*)</body>", raw, re.IGNORECASE)
    if not m:
        print(f"no body: {path.name}", file=sys.stderr)
        return
    body = m.group(1)
    body = re.sub(r"<nav[\s\S]*?</nav>", "", body, count=1, flags=re.IGNORECASE)
    body = re.sub(r"<footer[\s\S]*?</footer>", "", body, count=1, flags=re.IGNORECASE)

    body, scripts = strip_scripts(body)

    # Keep JSON-LD blocks
    ld_blocks = [s for s in scripts if "application/ld+json" in s]
    other_scripts = [s for s in scripts if "application/ld+json" not in s]

    main_open = (
        '<main class="mx-auto max-w-6xl px-5 pb-24 pt-8 md:px-8 md:pt-12" data-reveal>'
    )
    main_close = "</main>"

    ld_str = "\n  ".join(ld_blocks) if ld_blocks else ""

    out = []
    out.append(build_head(title, description, canonical, og_url, og_title, og_desc))
    out.append(NAV)
    out.append(main_open)
    out.append(body)
    out.append("  " + main_close)
    out.append(STICKY)
    out.append(FOOTER)
    if ld_str:
        out.append(ld_str)
    out.append(SCRIPTS)
    if other_scripts:
        for s in other_scripts:
            if "site-nav.js" in s or "analytics.js" in s:
                continue
            out.append("  " + s.strip())

    out.append("</body>\n</html>\n")
    result = "\n".join(out)
    result = "<!-- CHROME_APPLIED v1 -->\n" + result
    path.write_text(result, encoding="utf-8")
    print(f"ok: {path.name}")


def main() -> None:
    for p in sorted(ROOT.glob("*.html")):
        if p.name in SKIP:
            continue
        try:
            process_file(p)
        except Exception as e:
            print(f"err {p.name}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
