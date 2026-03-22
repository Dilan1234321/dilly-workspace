"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useATSResult } from "@/hooks/useATSResult";

export function ATSTrendChart() {
  const { atsResult } = useATSResult();
  if (!atsResult?.score_history?.length) {
    return (
      <div className="rounded-xl p-3 text-[12px]" style={{ background: "var(--s3)", color: "var(--t3)" }}>
        Trend appears after multiple ATS scans.
      </div>
    );
  }
  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={atsResult.score_history} margin={{ top: 12, right: 12, bottom: 4, left: -12 }}>
            <XAxis dataKey="date" tick={{ fill: "var(--t3)", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: "var(--t3)", fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)", borderRadius: 10 }}
              labelStyle={{ color: "var(--t3)" }}
            />
            <Line type="monotone" dataKey="score" stroke="var(--blue)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--blue)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

