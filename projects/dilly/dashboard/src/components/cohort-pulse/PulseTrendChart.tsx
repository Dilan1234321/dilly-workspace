"use client";

type ScorePoint = {
  week_start: string;
  user_score: number;
  cohort_avg_score: number;
};

function toPoints(values: number[], width: number, height: number, pad: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values
    .map((v, i) => {
      const x = pad + (i * (width - pad * 2)) / Math.max(1, values.length - 1);
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

export function PulseTrendChart({
  points,
  accent = "var(--blue)",
}: {
  points: ScorePoint[];
  accent?: string;
}) {
  const sorted = [...points].sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)));
  const user = sorted.map((p) => Number(p.user_score || 0));
  const cohort = sorted.map((p) => Number(p.cohort_avg_score || 0));
  const all = [...user, ...cohort];
  if (all.length === 0) return null;
  const width = 100;
  const height = 52;
  const pad = 6;
  const userLine = toPoints(user, width, height, pad);
  const cohortLine = toPoints(cohort, width, height, pad);
  const lastIdx = Math.max(0, sorted.length - 1);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);
  const lastX = pad + (lastIdx * (width - pad * 2)) / Math.max(1, sorted.length - 1);
  const lastY = height - pad - ((user[lastIdx] - min) / span) * (height - pad * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[52px] w-full" role="img" aria-label="Cohort pulse trend">
      <polyline fill="none" stroke={accent} strokeWidth={1.5} points={userLine} />
      <polyline fill="none" stroke="var(--t3)" strokeWidth={1} strokeDasharray="3 3" points={cohortLine} />
      <circle cx={lastX} cy={lastY} r={3} fill={accent} />
    </svg>
  );
}

