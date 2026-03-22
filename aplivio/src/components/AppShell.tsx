"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Home, LineChart, PenLine, CalendarDays, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMe } from "@/components/MeProvider";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/match", label: "Match", icon: LineChart },
  { href: "/analysis", label: "AI", icon: Sparkles },
  { href: "/plan", label: "Plan", icon: ClipboardList },
  { href: "/essay", label: "Essay", icon: PenLine },
  { href: "/timeline", label: "Dates", icon: CalendarDays },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { error } = useMe();

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col pb-24">
      {error ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100">
          {error}
        </div>
      ) : null}
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-lg font-semibold tracking-tight text-[var(--text)]">
            Aplivio
          </Link>
          <Link
            href="/profile"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
          >
            Profile
          </Link>
        </div>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
      <footer className="border-t border-[var(--border)] px-4 py-3 text-center text-[11px] text-[var(--muted)]">
        <a href="/methodology" className="text-[var(--accent)] underline">
          Methodology
        </a>
        <span className="mx-2">·</span>
        <a href="/privacy" className="text-[var(--accent)] underline">
          Privacy
        </a>
      </footer>
      <nav
        className="fixed bottom-0 left-0 right-0 z-10 border-t border-[var(--border)] bg-[var(--bg)]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur"
        aria-label="Primary"
      >
        <ul className="mx-auto flex max-w-lg justify-between gap-0.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className={cn(
                    "ap-btn flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-medium sm:text-[11px]",
                    active ? "text-[var(--accent)]" : "text-[var(--muted)]",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
