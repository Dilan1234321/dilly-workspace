"use client";

export function ATSKeywordRow({
  keyword,
  count,
  inContext,
  bareList,
}: {
  keyword: string;
  count: number;
  inContext: number;
  bareList: number;
}) {
  return (
    <div className="rounded-xl border p-3" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold" style={{ color: "var(--t1)" }}>{keyword}</p>
        <p className="text-[11px] tabular-nums" style={{ color: "var(--t3)" }}>{count} total</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg p-2" style={{ background: "var(--s3)" }}>
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>In context</p>
          <p className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--green)" }}>{inContext}</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: "var(--s3)" }}>
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>Bare list</p>
          <p className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--amber)" }}>{bareList}</p>
        </div>
      </div>
    </div>
  );
}

