"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { LangCode } from "@/lib/i18n";
import { SUPPORTED_LANGS } from "@/lib/i18n";

type Props = {
  current: LangCode;
  label: string;
};

export function LanguagePicker({ current, label }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const lang = e.target.value;
    if (lang === current) return;
    const res = await fetch("/api/lang", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    if (res.ok) {
      startTransition(() => router.refresh());
    }
  }

  return (
    <label className="hidden items-center gap-1.5 sm:flex">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={current}
        onChange={onChange}
        disabled={pending}
        className="cursor-pointer rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--color-text)] outline-none transition hover:border-[color:var(--color-accent)] focus:border-[color:var(--color-accent)]"
      >
        {SUPPORTED_LANGS.map((l) => (
          <option
            key={l.code}
            value={l.code}
            className="bg-white text-[color:var(--color-text)]"
          >
            {l.flag} {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
