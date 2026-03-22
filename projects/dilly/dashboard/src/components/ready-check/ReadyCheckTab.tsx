"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppProfileHeader } from "@/components/career-center";
import { CompanyInput } from "@/components/ready-check/CompanyInput";
import { VerdictLoadingScreen } from "@/components/ready-check/VerdictLoadingScreen";
import { API_BASE, AUTH_TOKEN_KEY } from "@/lib/dillyUtils";
import type { MemoryItem, ReadyCheck } from "@/types/dilly";

export function ReadyCheckTab({
  onBack,
  initialCompany,
}: {
  onBack: () => void;
  initialCompany?: string | null;
}) {
  const router = useRouter();
  const token = useMemo(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null),
    [],
  );
  const [company, setCompany] = useState(initialCompany || "");
  const [chips, setChips] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/memory`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const items = Array.isArray(data?.items) ? (data.items as MemoryItem[]) : [];
        const targets = items
          .filter((item) => item.category === "target_company")
          .map((item) => item.value || item.label)
          .filter(Boolean);
        const unique = Array.from(new Set(targets));
        setChips(unique);
        if (!company && unique.length > 0) setCompany(unique[0]);
      })
      .catch(() => setChips([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Reset company when initialCompany changes
  useEffect(() => {
    if (initialCompany) setCompany(initialCompany);
  }, [initialCompany]);

  const submit = async () => {
    if (!token || !company.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ready-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ company: company.trim() }),
      });
      if (!res.ok) return;
      const row = (await res.json()) as ReadyCheck;
      router.push(`/ready-check/${row.id}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <VerdictLoadingScreen />;

  return (
    <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="w-full max-w-[390px] mx-auto pb-32">
        <div className="px-4">
          <AppProfileHeader back={onBack} />
        </div>
        <header className="px-4 pt-2 pb-4">
          <h1 className="text-[18px] font-semibold" style={{ color: "var(--t1)" }}>
            Am I Ready?
          </h1>
          <p className="text-[12px] mt-1" style={{ color: "var(--t3)" }}>
            Get a recruiter-style verdict, roadmap, and re-check trajectory.
          </p>
        </header>
        <CompanyInput
          value={company}
          onChange={setCompany}
          chips={chips}
          onPickChip={setCompany}
          onSubmit={submit}
          onOpenHistory={() => router.push("/ready-check/history")}
        />
      </main>
    </div>
  );
}
