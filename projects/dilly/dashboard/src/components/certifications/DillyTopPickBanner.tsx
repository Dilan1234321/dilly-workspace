"use client";

function StarIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
    </svg>
  );
}

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

export function DillyTopPickBanner({ reason }: { reason: string }) {
  return (
    <div
      style={{
        background: "var(--s2)",
        borderRadius: 12,
        padding: "10px 13px",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        borderLeft: "2px solid var(--amber)",
        marginBottom: 8,
      }}
    >
      <div
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          background: "var(--adim)",
          border: "1px solid var(--abdr)",
          borderRadius: 8,
        }}
      >
        <StarIcon size={14} color="var(--amber)" />
      </div>
      <div className="min-w-0 flex-1">
        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", margin: "0 0 1px" }}>Dilly&apos;s top pick for your profile</p>
        <p style={{ fontSize: 10, fontWeight: 400, color: "var(--t2)", margin: 0, lineHeight: 1.55 }}>
          <CommentaryRichText text={reason} />
        </p>
      </div>
    </div>
  );
}
