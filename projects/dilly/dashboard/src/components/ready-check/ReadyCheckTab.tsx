"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppProfileHeader } from "@/components/career-center";
import { CompanyInput } from "@/components/ready-check/CompanyInput";
import { VerdictLoadingScreen } from "@/components/ready-check/VerdictLoadingScreen";
import { dilly } from "@/lib/dilly";
import type { MemoryItem, ReadyCheck } from "@/types/dilly";

export function ReadyCheckTab({
  onBack,
  initialCompany,
}: {
  onBack: () => void;
  initialCompany?: string | null;
}) {
  const router = useRouter();
  const [company, setCompany] = useState(initialCompany || "");
  const [chips, setChips] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    dilly.get<{ items: MemoryItem[] }>("/memory")
      .then((data) => {
        const items = Array.isArray(data?.items) ? data.items : [];
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
  }, []);

  // Reset company when initialCompany changes
  useEffect(() => {
    if (initialCompany) setCompany(initialCompany);
  }, [initialCompany]);

  const submit = async () => {
    if (!company.trim()) return;
    setLoading(true);
    try {
      const row = await dilly.post<ReadyCheck>("/ready-check", { company: company.trim() });
      router.push(`/ready-check/${row.id}`);
    } catch {
      // ignore submit errors
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
