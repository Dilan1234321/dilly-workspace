"use client";

import { useEffect, useState } from "react";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["/"], label: "Jump to search" },
  { keys: ["g", "h"], label: "Go home" },
  { keys: ["g", "l"], label: "Go to library" },
  { keys: ["g", "t"], label: "Go to today" },
  { keys: ["?"], label: "This help" },
  { keys: ["esc"], label: "Close any modal" },
];

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let gPressed = false;
    let gTimer: number | null = null;

    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if (e.key === "?") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
      }

      // Simple g-prefix navigation shortcuts
      if (e.key === "g" && !gPressed) {
        gPressed = true;
        if (gTimer) window.clearTimeout(gTimer);
        gTimer = window.setTimeout(() => {
          gPressed = false;
        }, 800);
        return;
      }
      if (gPressed) {
        const k = e.key.toLowerCase();
        if (k === "h") { gPressed = false; window.location.href = "/"; }
        else if (k === "l") { gPressed = false; window.location.href = "/library"; }
        else if (k === "t") { gPressed = false; window.location.href = "/today"; }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-xl border border-[color:var(--color-border-strong)] bg-[color:var(--color-bg-soft)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="eyebrow">Keyboard</div>
        <h3 className="editorial mt-2 text-xl font-semibold tracking-tight text-[color:var(--color-text)]">
          Shortcuts
        </h3>
        <ul className="mt-4 space-y-2 text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3">
              <span className="text-[color:var(--color-muted)]">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-1.5 py-0.5 font-mono text-[0.7rem] text-[color:var(--color-text)]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 text-[0.7rem] text-[color:var(--color-dim)]">
          Press <kbd className="font-mono">?</kbd> anytime.
        </div>
      </div>
    </div>
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
