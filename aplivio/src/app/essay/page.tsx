"use client";

import { useMemo, useState } from "react";
import { scoreEssayDraft } from "@/lib/essayScore";

export default function EssayPage() {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [coach, setCoach] = useState<string[]>([]);
  const [coachError, setCoachError] = useState<string | null>(null);

  const rubric = useMemo(() => scoreEssayDraft(draft), [draft]);

  async function runCoach() {
    setLoading(true);
    setCoachError(null);
    setCoach([]);
    try {
      const res = await fetch("/api/essay/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const data = (await res.json()) as { bullets?: string[]; message?: string };
      if (!res.ok) {
        setCoachError(data.message ?? "Request failed");
        return;
      }
      const bullets = data.bullets ?? [];
      if (bullets.length === 0 && data.message) {
        setCoachError(data.message);
        return;
      }
      setCoach(bullets);
    } catch {
      setCoachError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Essay studio</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Offline rubric scores instantly; optional AI coach uses{" "}
          <code className="rounded bg-[var(--surface2)] px-1">OPENAI_API_KEY</code> on the server.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">Draft</span>
        <textarea
          className="min-h-[220px] w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm leading-relaxed text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste your Common App personal statement draft…"
        />
      </label>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Rubric (0–100)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Metric label="Overall" value={rubric.overall} />
          <Metric label="Clarity" value={rubric.clarity} />
          <Metric label="Specificity" value={rubric.specificity} />
          <Metric label="Structure" value={rubric.structure} />
          <Metric label="Voice" value={rubric.voice} />
        </div>
        <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
          {rubric.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        disabled={loading || draft.trim().length < 40}
        onClick={() => void runCoach()}
        className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {loading ? "Coaching…" : "Run AI coach (optional)"}
      </button>

      {coachError && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {coachError}
        </p>
      )}
      {coach.length > 0 && (
        <ul className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
          {coach.map((c) => (
            <li key={c}>• {c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3 py-2">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
