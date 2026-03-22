"use client";

import { useMemo, useState } from "react";
import { AP_COURSES } from "@/data/apCourses";
import { cn } from "@/lib/cn";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
};

export function ApCoursePicker({ value, onChange }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return AP_COURSES;
    return AP_COURSES.filter((c) => c.label.toLowerCase().includes(s));
  }, [q]);

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
        placeholder="Search AP courses…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />
      <div
        className="max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-1"
        role="listbox"
        aria-label="AP courses"
      >
        {filtered.map((c) => {
          const checked = value.includes(c.id);
          return (
            <label
              key={c.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 text-sm leading-snug",
                checked ? "bg-[var(--accent)]/15" : "hover:bg-white/5",
              )}
            >
              <input
                type="checkbox"
                className="ap-btn mt-0.5 shrink-0 accent-[var(--accent)]"
                checked={checked}
                onChange={() => toggle(c.id)}
              />
              <span>{c.label}</span>
            </label>
          );
        })}
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-sm text-[var(--muted)]">No matches.</p>
        ) : null}
      </div>
      <p className="text-xs text-[var(--muted)]">
        Selected: <strong className="text-[var(--text)]">{value.length}</strong> — feeds rigor + STEM alignment
        for STEM majors.
      </p>
    </div>
  );
}
