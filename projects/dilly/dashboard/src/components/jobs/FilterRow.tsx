"use client";

export type JobFilterKey = "all" | "ready" | "close_gap" | "internship" | "full_time";

const FILTERS: { key: JobFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready now" },
  { key: "close_gap", label: "Close gap" },
  { key: "internship", label: "Internship" },
  { key: "full_time", label: "Full-time" },
];

type Props = {
  active: JobFilterKey;
  onChange: (k: JobFilterKey) => void;
};

export function FilterRow({ active, onChange }: Props) {
  return (
    <div
      className="flex flex-row overflow-x-auto pb-0.5 mx-5 mb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      style={{ margin: "10px 20px 12px", gap: 8, paddingBottom: 2 }}
    >
      {FILTERS.map(({ key, label }) => {
        const isOn = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className="border flex-shrink-0 whitespace-nowrap"
            style={{
              borderRadius: 999,
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: isOn ? 700 : 500,
              background: isOn ? "var(--s3)" : "transparent",
              borderColor: isOn ? "var(--b2)" : "var(--b1)",
              color: isOn ? "var(--t1)" : "var(--t3)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
