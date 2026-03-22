"use client";

import { useMe } from "@/components/MeProvider";

export function DisclaimerModal() {
  const { ready, disclaimerAcceptedAt, acceptDisclaimer } = useMe();
  const open = ready && !disclaimerAcceptedAt;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aplivio-disclaimer-title"
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
        <h2 id="aplivio-disclaimer-title" className="text-lg font-semibold">
          Before you continue
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          Aplivio uses <strong className="text-[var(--text)]">illustrative estimates</strong> and demo data.
          It is <strong className="text-[var(--text)]">not</strong> official admissions advice. Verify every
          deadline, requirement, and statistic on each college’s website. For regulated counseling where
          required, consult a licensed professional.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          See <a className="text-[var(--accent)] underline" href="/methodology">How estimates work</a> and{" "}
          <a className="text-[var(--accent)] underline" href="/privacy">Privacy</a>.
        </p>
        <button
          type="button"
          className="ap-btn mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white"
          onClick={() => void acceptDisclaimer()}
        >
          I understand
        </button>
      </div>
    </div>
  );
}
