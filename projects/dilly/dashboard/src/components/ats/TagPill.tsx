"use client";

export function TagPill({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const color =
    tone === "success" ? { bg: "rgba(34,197,94,0.15)", fg: "#22c55e" } :
    tone === "warning" ? { bg: "rgba(245,158,11,0.15)", fg: "#f59e0b" } :
    tone === "danger" ? { bg: "rgba(239,68,68,0.15)", fg: "#ef4444" } :
    tone === "info" ? { bg: "rgba(59,130,246,0.15)", fg: "#60a5fa" } :
    { bg: "var(--s3)", fg: "var(--t2)" };
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: color.bg, color: color.fg }}>
      {label}
    </span>
  );
}

