"use client";

export function ATSContactRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b last:border-b-0" style={{ borderColor: "var(--b1)" }}>
      <span className="text-[11px]" style={{ color: "var(--t3)" }}>{label}</span>
      <span className="text-[12px] text-right break-words" style={{ color: "var(--t1)" }}>{value || "—"}</span>
    </div>
  );
}

