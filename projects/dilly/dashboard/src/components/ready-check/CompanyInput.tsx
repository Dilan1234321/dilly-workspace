"use client";

export function CompanyInput({
  value,
  onChange,
  chips,
  onPickChip,
  onSubmit,
  onOpenHistory,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  chips: string[];
  onPickChip: (name: string) => void;
  onSubmit: () => void;
  onOpenHistory: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="px-4">
      <label className="block text-[11px] mb-1.5" style={{ color: "var(--t3)" }}>
        Company
      </label>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Goldman Sachs"
          className="flex-1 rounded-[14px] px-3 py-2.5 border text-[14px]"
          style={{ background: "var(--s2)", borderColor: "var(--bbdr)", color: "var(--t1)" }}
        />
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={onSubmit}
          className="rounded-[12px] px-3 py-2.5 text-[12px] font-semibold disabled:opacity-60"
          style={{ background: "var(--blue)", color: "#fff" }}
        >
          Check
        </button>
      </div>
      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.slice(0, 8).map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onPickChip(chip)}
              className="px-2.5 py-1.5 rounded-full border text-[11px]"
              style={{ background: "var(--s2)", borderColor: "var(--bbdr)", color: "var(--t2)" }}
            >
              {chip}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onOpenHistory}
        className="mt-3 text-[12px] font-semibold"
        style={{ color: "var(--blue)" }}
      >
        Recent checks →
      </button>
    </section>
  );
}

