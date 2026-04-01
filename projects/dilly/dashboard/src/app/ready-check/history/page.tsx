"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppProfileHeader } from "@/components/career-center";
import { VerdictHistoryList } from "@/components/ready-check/VerdictHistoryList";
import { dilly } from "@/lib/dilly";
import { getCareerCenterReturnPath } from "@/lib/dillyUtils";
import type { ReadyCheck } from "@/types/dilly";

type Group = { company: string; checks: ReadyCheck[] };

export default function ReadyCheckHistoryPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    dilly.get<{ groups?: Group[] }>("/ready-check/history")
      .then((data) => {
        const rows = Array.isArray(data?.groups) ? data.groups : [];
        setGroups(rows as Group[]);
      })
      .catch(() => setGroups([]));
  }, []);

  return (
    <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="w-full max-w-[390px] mx-auto pb-32">
        <div className="px-4">
          <AppProfileHeader back={getCareerCenterReturnPath()} />
        </div>
        <header className="px-4 pt-2 pb-4">
          <h1 className="text-[18px] font-semibold" style={{ color: "var(--t1)" }}>
            Ready Check History
          </h1>
        </header>
        <VerdictHistoryList
          groups={groups}
          onOpen={(check) => router.push(`/ready-check/${check.id}`)}
        />
      </main>
    </div>
  );
}
