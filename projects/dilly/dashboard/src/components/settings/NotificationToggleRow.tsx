"use client";

type NotificationToggleRowProps = {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  saving?: boolean;
};

export function NotificationToggleRow({ enabled, onToggle, saving }: NotificationToggleRowProps) {
  return (
    <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 min-h-[52px]">
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: "var(--t1)" }}>Career updates from Dilly</p>
          <p className="text-xs" style={{ color: "var(--t3)" }}>One message per day. Always specific to you.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          disabled={!!saving}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? "" : "opacity-60"} ${saving ? "opacity-70" : ""}`}
          style={{ background: enabled ? "var(--blue)" : "var(--s3)" }}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${enabled ? "left-7" : "left-1"}`} />
        </button>
      </div>
    </div>
  );
}

