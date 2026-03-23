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
      <a href="index.html" class="relative z-[120] flex shrink-0 items-center">
        <img src="dilly-wordmark.png" alt="Dilly" class="site-header-logo shrink-0" width="612" height="408" decoding="async" />
      </a>
      <button type="button" class="relative z-[120] rounded-xl px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 md:hidden" id="navMenuToggle" aria-label="Open menu" aria-expanded="false" aria-controls="navMenuPanel">Menu</button>
      <div class="nav-menu-panel fixed inset-0 z-[100] hidden flex flex-col overflow-y-auto overscroll-contain border-0 bg-[#0a0a0a]/98 backdrop-blur-xl md:static md:inset-auto md:z-auto md:flex md:max-h-none md:flex-1 md:flex-row md:justify-end md:overflow-visible md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none" id="navMenuPanel">
        <nav class="mx-auto flex w-full max-w-lg flex-col gap-1 px-6 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(6.5rem,env(safe-area-inset-top,0px)+1.5rem)] md:mx-0 md:max-w-none md:flex-row md:items-center md:gap-0 md:rounded-full md:bg-zinc-900/90 md:p-1.5 md:pl-3 md:ring-1 md:ring-white/10 md:px-0 md:pb-0 md:pt-0">
          <a href="features.html" class="rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">Features</a>
          <a href="how-it-works.html" class="rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">How it works</a>
          <a href="tracks.html" class="rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">Tracks</a>
          <a href="pricing.html" class="rounded-xl px-4 py-4 text-lg font-medium text-zinc-100 hover:bg-zinc-800/80 md:rounded-full md:px-3 md:py-2 md:text-sm md:font-medium md:text-zinc-300 md:hover:bg-transparent md:hover:text-white">Pricing</a>
          <a href="https://app.trydilly.com" target="_blank" rel="noopener noreferrer" data-cta="nav" class="mt-4 inline-flex w-full min-h-[48px] items-center justify-center rounded-2xl bg-[#c5a353] px-5 py-3 text-base font-semibold text-zinc-950 shadow-lg shadow-black/20 transition hover:brightness-110 md:mt-0 md:ml-1 md:w-auto md:rounded-full md:py-2 md:text-sm">Get Your Dilly Score</a>
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
