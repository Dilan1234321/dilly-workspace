"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE, AUTH_TOKEN_KEY, getCareerCenterReturnPath } from "@/lib/dillyUtils";
import { getSchoolFromEmail } from "@/lib/schools";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { LoaderOne } from "@/components/ui/loader-one";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CompanyListItem = {
  slug: string;
  display_name: string;
  source: string;
  dilly_scores?: { min_smart?: number; min_grit?: number; min_build?: number; min_final_score?: number; track?: string };
  criteria_source?: string;
  confidence?: string;
};

type RoleTypeFilter = "all" | "internship" | "job";

export default function CompaniesPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<{ email: string; subscribed: boolean } | null>(null);
  const [school, setSchool] = useState<ReturnType<typeof getSchoolFromEmail>>(null);
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [roleTypeFilter, setRoleTypeFilter] = useState<RoleTypeFilter>("all");

  const theme = { primary: school?.theme?.primary ?? "#C8102E" };

  const industries = useMemo(() => {
    const tracks = new Set<string>();
    companies.forEach((c) => {
      const t = c.dilly_scores?.track?.trim();
      if (t) tracks.add(t);
    });
    return Array.from(tracks).sort((a, b) => a.localeCompare(b));
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    let list = companies;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          (c.display_name || "").toLowerCase().includes(q) ||
          (c.source || "").toLowerCase().includes(q)
      );
    }
    if (industryFilter !== "all") {
      list = list.filter((c) => (c.dilly_scores?.track || "").toLowerCase() === industryFilter.toLowerCase());
    }
    return list;
  }, [companies, searchQuery, industryFilter]);

  useEffect(() => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) {
      setAuthLoading(false);
      router.replace("/");
      return;
    }
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const u = { email: data?.email ?? "", subscribed: !!data?.subscribed };
        setUser(u);
        if (!u.subscribed) router.replace("/");
        setSchool(getSchoolFromEmail(u.email));
      })
      .catch(() => router.replace("/"))
      .finally(() => setAuthLoading(false));
  }, [router]);

  useEffect(() => {
    fetch(`${API_BASE}/companies`)
      .then((res) => (res.ok ? res.json() : { companies: [] }))
      .then((data) => setCompanies(Array.isArray(data?.companies) ? data.companies : []))
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false));
  }, []);

  if (authLoading || !user?.subscribed) {
    return (
      <LoadingScreen message="Loading…" className="m-app app-talent" />
    );
  }

  return (
    <div
      className={`m-app app-talent min-h-screen flex flex-col items-center ${school?.id === "utampa" ? "school-theme-ut" : ""}`}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <header className="m-header shrink-0 w-full max-w-[375px]">
        <div className="m-header-inner">
          <Link href={getCareerCenterReturnPath()} className="cc-btn cc-btn-ghost flex items-center justify-center w-9 h-9 shrink-0" aria-label="Back">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="te-hero-title text-base truncate">Companies we know</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="flex-1 overflow-auto w-full max-w-[375px] min-w-0 pt-0 px-4 pb-24">
        <p className="text-sm cc-text-muted mb-4">
          Dilly has verified hiring criteria for these employers. Open a company to see score requirements, open roles, and recruiter advice.
        </p>

        {/* Search */}
        <div className="mb-4">
          <Input
            type="search"
            placeholder="Search companies…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] rounded-lg border-[var(--te-border)] bg-[var(--te-bg-card)] text-slate-100 placeholder:text-slate-500 focus-visible:ring-[var(--te-border-gold)]"
            aria-label="Search companies"
          />
        </div>

        {/* Industry filter */}
        {industries.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Industry</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setIndustryFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  industryFilter === "all"
                    ? "bg-[var(--te-gold)] text-[var(--te-bg-deep)]"
                    : "bg-white/10 text-slate-300 hover:bg-white/15 border border-[var(--te-border)]"
                }`}
              >
                All
              </button>
              {industries.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setIndustryFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    industryFilter === t
                      ? "bg-[var(--te-gold)] text-[var(--te-bg-deep)]"
                      : "bg-white/10 text-slate-300 hover:bg-white/15 border border-[var(--te-border)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Role type (for jobs link) */}
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Role type</p>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "internship", "job"] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleTypeFilter(role)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  roleTypeFilter === role
                    ? "bg-[var(--te-gold)] text-[var(--te-bg-deep)]"
                    : "bg-white/10 text-slate-300 hover:bg-white/15 border border-[var(--te-border)]"
                }`}
              >
                {role === "all" ? "All roles" : role === "internship" ? "Internships" : "Jobs"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="loading-spinner-gradient" aria-hidden />
            <p className="text-[13px] text-[var(--m-text-3)]">Loading companies…</p>
          </div>
        ) : companies.length === 0 ? (
          <p className="text-slate-500 text-sm">No companies with verified criteria yet.</p>
        ) : filteredCompanies.length === 0 ? (
          <p className="text-slate-500 text-sm">No companies match your filters. Try a different search or industry.</p>
        ) : (
          <ul className="space-y-3">
            {filteredCompanies.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/companies/${encodeURIComponent(c.slug)}`}
                  className="cc-card block p-4 min-h-[44px] transition-colors"
                >
                  <p className="font-medium cc-text-soft">{c.display_name}</p>
                  {c.dilly_scores?.min_final_score != null && (
                    <p className="text-xs cc-text-muted mt-0.5">
                      Bar: Smart {c.dilly_scores.min_smart ?? "—"} · Grit {c.dilly_scores.min_grit ?? "—"} · Build {c.dilly_scores.min_build ?? "—"} (overall {c.dilly_scores.min_final_score})
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6">
          <Link
            href={
              roleTypeFilter === "internship"
                ? "/?tab=resources&view=jobs&type=internship"
                : roleTypeFilter === "job"
                  ? "/?tab=resources&view=jobs&type=job"
                  : "/?tab=resources&view=jobs"
            }
          >
            <Button variant="outline" size="sm" className="min-h-[44px] m-rounded-tight border-[var(--ut-border)] text-slate-200 text-xs">
              View all jobs
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
