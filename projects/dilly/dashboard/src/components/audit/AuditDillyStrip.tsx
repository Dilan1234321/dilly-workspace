"use client";

import { DillyAvatar } from "@/components/ats/DillyAvatar";
import Link from "next/link";

function parseMarkup(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} style={{ color: "var(--t1)", fontWeight: 600 }}>
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function AuditDillyStrip({
  text,
  show_cta = false,
  cta_label,
  cta_route,
}: {
  text: string;
  show_cta?: boolean;
  cta_label?: string;
  cta_route?: string;
}) {
  return (
    <div
      className="flex flex-row gap-2 items-start"
      style={{
        background: "var(--s3)",
        borderTop: "1px solid var(--b1)",
        padding: "10px 13px",
      }}
    >
      <DillyAvatar size={20} />
      <div className="min-w-0 flex-1">
        <p
          className="uppercase"
          style={{
            fontSize: 8,
            fontWeight: 700,
            color: "var(--blue)",
            letterSpacing: "0.07em",
            marginBottom: 2,
          }}
        >
          Dilly says
        </p>
        <p
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: "var(--t2)",
            lineHeight: 1.6,
          }}
        >
          {parseMarkup(text)}
        </p>
        {show_cta && cta_label && cta_route ? (
          <Link
            href={cta_route}
            className="inline-block mt-2 text-[11px] font-bold border-0 bg-transparent p-0"
            style={{ color: "var(--blue)" }}
          >
            {cta_label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
