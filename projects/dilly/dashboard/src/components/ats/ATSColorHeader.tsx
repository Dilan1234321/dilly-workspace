"use client";

export function ATSColorHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <section className="rounded-[18px] p-4 mb-3" style={{ background: "var(--s2)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)", letterSpacing: "0.1em" }}>
        {eyebrow}
      </p>
      <h1 className="text-[20px] font-semibold leading-tight" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>
        {title}
      </h1>
      <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: "var(--t2)" }}>
        {subtitle}
      </p>
    </section>
  );
}

