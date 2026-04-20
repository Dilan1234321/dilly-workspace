"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { COHORTS } from "@/lib/cohorts";
import { INDUSTRIES } from "@/lib/industries";

type Item = {
  label: string;
  sub?: string;
  href: string;
  kind: "industry" | "cohort" | "action";
};

const ACTIONS: Item[] = [
  { label: "Today", sub: "Your daily learning pick", href: "/today", kind: "action" },
  { label: "Library", sub: "Videos you've saved", href: "/library", kind: "action" },
  { label: "Browse all cohorts", sub: "22 fields", href: "/#cohorts", kind: "action" },
  { label: "Pick your role", sub: "16 industries", href: "/#industries", kind: "action" },
];

const STATIC_ITEMS: Item[] = [
  ...ACTIONS,
  ...INDUSTRIES.map<Item>((i) => ({
    label: i.name,
    sub: i.tagline,
    href: `/industry/${i.slug}`,
    kind: "industry",
  })),
  ...COHORTS.map<Item>((c) => ({
    label: c.name,
    sub: c.tagline,
    href: `/cohort/${c.slug}`,
    kind: "cohort",
  })),
];

function score(q: string, item: Item): number {
  if (!q) return 0;
  const needle = q.toLowerCase();
  const label = item.label.toLowerCase();
  const sub = (item.sub || "").toLowerCase();
  if (label === needle) return 100;
  if (label.startsWith(needle)) return 80;
  if (label.includes(needle)) return 60;
  if (sub.includes(needle)) return 30;
  // Simple letter-sequence match as a last resort
  let li = 0;
  for (const ch of label) {
    if (ch === needle[li]) li++;
    if (li === needle.length) return 10;
  }
  return 0;
}

export function CommandTrigger({ label = "Search" }: { label?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      // "/" opens search when not typing in a field
      if (k === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full max-w-2xl items-center gap-3 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3 text-sm text-[color:var(--color-muted)] transition hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-text)] sm:gap-4 sm:py-3.5"
        aria-label="Open command palette"
      >
        <SearchIcon />
        <span className="flex-1 truncate text-left">{label}</span>
        <kbd className="hidden items-center gap-0.5 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-soft)] px-2 py-0.5 font-mono text-[0.7rem] text-[color:var(--color-dim)] sm:inline-flex">
          ⌘K
        </kbd>
      </button>
      {open && <CommandModal onClose={() => setOpen(false)} />}
    </>
  );
}

function CommandModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!q.trim()) {
      // Show actions + top picks when nothing is typed
      return STATIC_ITEMS.slice(0, 10);
    }
    const scored = STATIC_ITEMS
      .map((it) => ({ it, s: score(q, it) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 20)
      .map((x) => x.it);
    return scored;
  }, [q]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(results.length - 1, c + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const picked = results[cursor];
        if (picked) {
          router.push(picked.href);
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results, cursor, onClose, router]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${cursor}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[10vh] sm:pt-[16vh]"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-soft)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[color:var(--color-border)] px-4 py-3">
          <SearchIcon />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to a field, role, or page…"
            className="flex-1 bg-transparent text-[0.95rem] text-[color:var(--color-text)] outline-none placeholder:text-[color:var(--color-dim)]"
          />
          <kbd className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-1.5 py-0.5 font-mono text-[0.65rem] text-[color:var(--color-dim)]">
            Esc
          </kbd>
        </div>
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-auto py-1"
        >
          {results.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[color:var(--color-muted)]">
              Nothing matches {`"${q}"`}.
            </div>
          ) : (
            results.map((it, i) => (
              <button
                key={`${it.kind}:${it.href}`}
                data-index={i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => {
                  router.push(it.href);
                  onClose();
                }}
                className={
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition " +
                  (i === cursor ? "bg-[color:var(--color-surface-raised)]" : "")
                }
              >
                <Tag kind={it.kind} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[color:var(--color-text)]">{it.label}</div>
                  {it.sub && (
                    <div className="truncate text-xs text-[color:var(--color-muted)]">
                      {it.sub}
                    </div>
                  )}
                </div>
                {i === cursor && (
                  <kbd className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-1.5 py-0.5 font-mono text-[0.65rem] text-[color:var(--color-dim)]">
                    ↵
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[color:var(--color-border)] px-4 py-2 text-[0.65rem] text-[color:var(--color-dim)]">
          <span>
            <kbd className="font-mono">↑↓</kbd> to move ·{" "}
            <kbd className="font-mono">↵</kbd> to open ·{" "}
            <kbd className="font-mono">esc</kbd> to close
          </span>
          <span>Skill Lab</span>
        </div>
      </div>
    </div>
  );
}

function Tag({ kind }: { kind: Item["kind"] }) {
  const map: Record<Item["kind"], { label: string; cls: string }> = {
    action:   { label: "go",       cls: "text-[color:var(--color-dim)] bg-[color:var(--color-surface)]" },
    industry: { label: "role",     cls: "text-[color:var(--color-accent-soft)] bg-[rgba(123,159,255,0.12)]" },
    cohort:   { label: "cohort",   cls: "text-[color:var(--color-mint)] bg-[rgba(94,207,176,0.12)]" },
  };
  const { label, cls } = map[kind];
  return (
    <span
      className={
        "inline-flex w-14 shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider " +
        cls
      }
    >
      {label}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable
  );
}
