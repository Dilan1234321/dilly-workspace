"use client";

import { DillyAvatar } from "@/components/ats/DillyAvatar";

function CommentaryRichText({ text }: { text: string }) {
  const parts = text.split(/\*\*/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} style={{ color: "var(--t1)", fontWeight: 600 }}>
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function DillyCommentaryStrip({ commentary }: { commentary: string }) {
  return (
    <div
      style={{
        background: "var(--s2)",
        borderRadius: 16,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 9,
        border: "1px solid var(--bbdr)",
        marginBottom: 10,
      }}
    >
      <div className="shrink-0" style={{ marginTop: 1 }}>
        <DillyAvatar size={24} />
      </div>
      <p style={{ fontSize: 12, fontWeight: 400, color: "var(--t2)", lineHeight: 1.6, margin: 0, flex: 1, minWidth: 0 }}>
        <CommentaryRichText text={commentary} />
      </p>
    </div>
  );
}
