"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dilly } from "@/lib/dilly";
import { getCareerCenterReturnPath } from "@/lib/dillyUtils";
import { AppProfileHeader } from "@/components/career-center";
import { NotificationToggleRow } from "@/components/settings/NotificationToggleRow";
import { QuietHoursPicker } from "@/components/settings/QuietHoursPicker";
import { NotificationHistoryList, type NotificationHistoryItem } from "@/components/settings/NotificationHistoryList";
import { hapticLight } from "@/lib/haptics";

type NotificationPreferences = {
  enabled: boolean;
  quiet_hours_start: number;
  quiet_hours_end: number;
  timezone: string;
};

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  quiet_hours_start: 22,
  quiet_hours_end: 8,
  timezone: "America/New_York",
};

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [prefsRes, historyRes] = await Promise.all([
          dilly.fetch("/notifications/preferences"),
          dilly.fetch("/notifications/history?limit=7"),
        ]);
        if (!cancelled && prefsRes.ok) {
          const p = await prefsRes.json();
          setPrefs({
            enabled: !!p?.enabled,
            quiet_hours_start: Number.isFinite(p?.quiet_hours_start) ? Number(p.quiet_hours_start) : 22,
            quiet_hours_end: Number.isFinite(p?.quiet_hours_end) ? Number(p.quiet_hours_end) : 8,
            timezone: typeof p?.timezone === "string" ? p.timezone : "America/New_York",
          });
        }
        if (!cancelled && historyRes.ok) {
          const h = await historyRes.json();
          setHistory(Array.isArray(h?.items) ? h.items : []);
        }
      } catch {
        // Keep local defaults on network errors.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchPrefs = async (patch: Partial<NotificationPreferences>) => {
    setSaving(true);
    try {
      const res = await dilly.fetch("/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const next = await res.json();
        setPrefs({
          enabled: !!next?.enabled,
          quiet_hours_start: Number(next?.quiet_hours_start ?? 22),
          quiet_hours_end: Number(next?.quiet_hours_end ?? 8),
          timezone: String(next?.timezone || "America/New_York"),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const openHistoryItem = async (item: NotificationHistoryItem) => {
    hapticLight();
    if (!item.opened) {
      try {
        await dilly.post("/notifications/opened", { notification_id: item.id });
        setHistory((prev) => prev.map((row) => (row.id === item.id ? { ...row, opened: true } : row)));
      } catch {
        // Ignore opened tracking failures.
      }
    }
    router.push(item.deep_link || "/dashboard");
  };

  return (
    <div className="career-center-talent min-h-screen" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
      <main className="w-full max-w-[390px] mx-auto px-4 pb-40 min-w-0">
        <AppProfileHeader back={getCareerCenterReturnPath()} />
        <header className="py-6 mb-2">
          <h1 className="text-[18px] font-semibold mb-0.5" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>Notifications</h1>
          <p className="text-[13px]" style={{ color: "var(--t3)" }}>One proactive Dilly message per day, max.</p>
        </header>
        {loading ? (
          <div className="rounded-[18px] p-4 text-sm" style={{ background: "var(--s2)", color: "var(--t3)" }}>
            Loading notification settings...
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Preferences</h2>
              <NotificationToggleRow
                enabled={prefs.enabled}
                saving={saving}
                onToggle={(next) => {
                  setPrefs((prev) => ({ ...prev, enabled: next }));
                  void patchPrefs({ enabled: next });
                }}
              />
            </section>

            <section>
              <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Quiet Hours</h2>
              <QuietHoursPicker
                startHour={prefs.quiet_hours_start}
                endHour={prefs.quiet_hours_end}
                saving={saving}
                onStartChange={(nextHour) => {
                  setPrefs((prev) => ({ ...prev, quiet_hours_start: nextHour }));
                  void patchPrefs({ quiet_hours_start: nextHour });
                }}
                onEndChange={(nextHour) => {
                  setPrefs((prev) => ({ ...prev, quiet_hours_end: nextHour }));
                  void patchPrefs({ quiet_hours_end: nextHour });
                }}
              />
            </section>

            <section>
              <h2 className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: "var(--t3)" }}>Recent</h2>
              <NotificationHistoryList items={history} onTap={openHistoryItem} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
