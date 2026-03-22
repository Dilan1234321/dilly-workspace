"use client";

export type NotificationHistoryItem = {
  id: string;
  message: string;
  sent_at: string;
  opened: boolean;
  deep_link?: string;
};

function formatRelativeDate(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((nMid - dMid) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type NotificationHistoryListProps = {
  items: NotificationHistoryItem[];
  onTap: (item: NotificationHistoryItem) => void;
};

export function NotificationHistoryList({ items, onTap }: NotificationHistoryListProps) {
  return (
    <div className="rounded-[18px] overflow-hidden" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
      {items.length === 0 ? (
        <div className="px-4 py-4 text-sm" style={{ color: "var(--t3)" }}>No notifications yet.</div>
      ) : (
        items.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTap(item)}
            className="w-full text-left flex items-center justify-between gap-3 px-4 py-3.5 min-h-[52px]"
            style={{ borderBottom: idx === items.length - 1 ? "none" : "1px solid var(--b1)" }}
          >
            <span className="text-xs shrink-0" style={{ color: "var(--t3)" }}>{formatRelativeDate(item.sent_at)}</span>
            <span className="min-w-0 flex items-center gap-2 justify-end">
              {!item.opened ? <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--blue)" }} /> : null}
              <span className="text-sm truncate" style={{ color: "var(--t1)" }}>{item.message}</span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}

