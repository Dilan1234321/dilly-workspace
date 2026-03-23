#!/usr/bin/env python3
"""Replace site <header> and footer mark size with canonical markup (run from repo after nav changes)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Dark app-aligned bar + desktop nav pill (links + CTA grouped)
SITE_HEADER = """  <header class="site-header sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-xl">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 md:px-8 md:py-4">
      <a href="index.html" class="flex shrink-0 items-center">
        <span class="site-wordmark font-serif text-xl font-semibold tracking-[0.02em] text-zinc-100 md:text-2xl">Dilly</span>
      </a>
      <button type="button" class="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 md:hidden" id="navMenuToggle" aria-label="Open menu" aria-expanded="false" aria-controls="navMenuPanel">Menu</button>
      <div class="nav-menu-panel fixed inset-x-0 top-[5.5rem] z-40 hidden border-b border-zinc-800 bg-[#141416]/98 px-5 py-6 shadow-soft backdrop-blur-xl md:static md:inset-auto md:flex md:flex-1 md:justify-end md:border-0 md:bg-transparent md:p-0 md:shadow-none" id="navMenuPanel">
        <nav class="flex flex-col gap-2 md:flex-row md:items-center md:gap-0 md:rounded-full md:bg-zinc-900/90 md:p-1.5 md:pl-3 md:ring-1 md:ring-white/10">
          <a href="features.html" class="rounded-lg px-2 py-2 text-sm font-medium text-zinc-300 hover:text-white md:rounded-full md:px-3 md:py-2">Features</a>
          <a href="how-it-works.html" class="rounded-lg px-2 py-2 text-sm font-medium text-zinc-300 hover:text-white md:rounded-full md:px-3 md:py-2">How it works</a>
          <a href="tracks.html" class="rounded-lg px-2 py-2 text-sm font-medium text-zinc-300 hover:text-white md:rounded-full md:px-3 md:py-2">Tracks</a>
          <a href="pricing.html" class="rounded-lg px-2 py-2 text-sm font-medium text-zinc-300 hover:text-white md:rounded-full md:px-3 md:py-2">Pricing</a>
          <a href="https://app.trydilly.com" target="_blank" rel="noopener noreferrer" data-cta="nav" class="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-[#c5a353] px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-black/20 transition hover:brightness-110 md:mt-0 md:ml-1 md:rounded-full md:px-5 md:py-2">Get Your Dilly Score</a>
        </nav>
      </div>
    </div>
  </header>"""

HEADER_RE = re.compile(
    r'<header class="site-header sticky top-0 z-50[^"]*">[\s\S]*?</header>',
    re.MULTILINE,
)

FOOTER_MARK_OLD = 'src="dilly-logo.png" alt="" width="40" height="40" class="h-10 w-10"'
FOOTER_MARK_NEW = 'src="dilly-logo.png" alt="" width="48" height="48" class="h-12 w-12"'


def process(path: Path) -> bool:
    raw = path.read_text(encoding="utf-8")
    if "<header" not in raw:
        return False
    new = HEADER_RE.sub(SITE_HEADER, raw, count=1)
    new = new.replace(FOOTER_MARK_OLD, FOOTER_MARK_NEW)
    if new == raw:
        return False
    path.write_text(new, encoding="utf-8")
    return True


def main() -> None:
    dirs = [ROOT, ROOT / "public"]
    n = 0
    for d in dirs:
        if not d.is_dir():
            continue
        for path in sorted(d.glob("*.html")):
            if process(path):
                print(path.relative_to(ROOT))
                n += 1
    print(f"updated {n} files", file=sys.stderr)


if __name__ == "__main__":
    main()
