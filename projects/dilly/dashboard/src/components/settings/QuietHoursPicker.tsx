"use client";

function hourToTimeValue(hour: number): string {
  const h = Math.max(0, Math.min(23, hour));
  return `${String(h).padStart(2, "0")}:00`;
}

function timeValueToHour(value: string): number {
  const raw = (value || "").split(":")[0];
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(23, n));
}

type QuietHoursPickerProps = {
  startHour: number;
  endHour: number;
  onStartChange: (nextHour: number) => void;
  onEndChange: (nextHour: number) => void;
  saving?: boolean;
};

export function QuietHoursPicker({
  startHour,
  endHour,
  onStartChange,
  onEndChange,
  saving,
}: QuietHoursPickerProps) {
  return (
    <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
      <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--b1)" }}>
        <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Quiet hours</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>No proactive pushes during this window.</p>
      </div>
      <div className="px-4 py-3.5 grid grid-cols-2 gap-3">
        <label className="block min-w-0">
          <span className="block text-xs mb-1.5" style={{ color: "var(--t3)" }}>From</span>
          <input
            type="time"
            step={3600}
            value={hourToTimeValue(startHour)}
            onChange={(e) => onStartChange(timeValueToHour(e.target.value))}
            disabled={!!saving}
            className="w-full rounded-[12px] px-3 py-2 text-sm border outline-none"
            style={{ background: "var(--s3)", borderColor: "var(--b1)", color: "var(--t1)" }}
          />
        </label>
        <label className="block min-w-0">
          <span className="block text-xs mb-1.5" style={{ color: "var(--t3)" }}>To</span>
          <input
            type="time"
            step={3600}
            value={hourToTimeValue(endHour)}
            onChange={(e) => onEndChange(timeValueToHour(e.target.value))}
            disabled={!!saving}
            className="w-full rounded-[12px] px-3 py-2 text-sm border outline-none"
            style={{ background: "var(--s3)", borderColor: "var(--b1)", color: "var(--t1)" }}
          />
        </label>
      </div>
    </div>
  );
}

