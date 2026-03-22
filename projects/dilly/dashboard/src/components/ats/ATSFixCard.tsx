"use client";

export function ATSFixCard({
  original,
  rewritten,
  reason,
  onCopy,
}: {
  original: string;
  rewritten: string;
  reason: string;
  onCopy: () => void;
}) {
  return (
    <article className="rounded-xl border p-3 space-y-2" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
      <div>
        <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--t3)" }}>Original</p>
        <p className="text-[12px]" style={{ color: "var(--t2)" }}>{original || "—"}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--t3)" }}>Rewrite</p>
        <p className="text-[12px]" style={{ color: "var(--t1)" }}>{rewritten || "—"}</p>
      </div>
      <p className="text-[11px]" style={{ color: "var(--t3)" }}>{reason}</p>
      <button
        type="button"
        onClick={onCopy}
        className="min-h-[40px] px-3 rounded-lg text-[12px] font-semibold"
        style={{ background: "var(--blue)", color: "#fff" }}
      >
        Copy rewrite
      </button>
    </article>
  );
}

