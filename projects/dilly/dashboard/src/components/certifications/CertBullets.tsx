"use client";

function BulletRichText({ text }: { text: string }) {
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

export function CertBullets({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 13 }}>
      {items.map((line, idx) => (
        <div key={idx} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
          <span className="shrink-0" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green)", marginTop: 5 }} aria-hidden />
          <p style={{ fontSize: 13, fontWeight: 400, color: "var(--t2)", lineHeight: 1.55, margin: 0 }}>
            <BulletRichText text={line} />
          </p>
        </div>
      ))}
    </div>
  );
}
