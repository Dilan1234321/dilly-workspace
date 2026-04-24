import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Overview = {
  totalUsers: number;
  totalFacts: number;
  totalConversations: number;
  usersWithFacts: number;
  lastUserSignup: string | null;
  lastFactAdded: string | null;
};

type SignupRow = { day: string; newUsers: number; totalUsers: number };
type FactRow = { day: string; factsAdded: number; totalFacts: number; activeUsers: number };
type CategoryRow = { category: string; count: number };
type UserRow = { id: number; label: string; track: string; factCount: number; conversations: number };
type TrackRow = { track: string; count: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function categoryLabel(cat: string) {
  const map: Record<string, string> = {
    goal: "Goal", skill: "Skill", life_context: "Background",
    skill_unlisted: "Skill (unlisted)", achievement: "Achievement",
    strength: "Strength", personality: "Personality", challenge: "Challenge",
    project_detail: "Project", project: "Project", motivation: "Motivation",
    career_interest: "Career interest", target_company: "Target company",
    location_pref: "Location pref", education: "Education",
    concern: "Concern", hobby: "Hobby", mentioned_but_not_done: "Mentioned",
    preference: "Preference", soft_skill: "Soft skill", availability: "Availability",
  };
  return map[cat] || cat;
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}
      className={`rounded-2xl border p-6 flex flex-col gap-1 ${
        accent
          ? "bg-[#e8f040]/5 border-[#e8f040]/20"
          : "bg-card border-border"
      }`}
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
      <p
        className={`text-4xl font-black tracking-tight leading-none ${
          accent ? "text-[#e8f040]" : "text-foreground"
        }`}
        style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  );
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Depth bar ───────────────────────────────────────────────────────────────

function DepthBar({ facts, max }: { facts: number; max: number }) {
  const pct = max > 0 ? Math.min((facts / max) * 100, 100) : 0;
  const color = facts >= 15 ? "#e8f040" : facts >= 5 ? "#2dd4bf" : "#444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-6 text-right">{facts}</span>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: overview, isLoading: loadingOverview } = useQuery<Overview>({
    queryKey: ["/api/traction/overview"],
    refetchInterval: 30000,
  });

  const { data: signupsData } = useQuery<{ signups: SignupRow[] }>({
    queryKey: ["/api/traction/signups"],
    refetchInterval: 30000,
  });

  const { data: factsData } = useQuery<{ facts: FactRow[] }>({
    queryKey: ["/api/traction/facts"],
    refetchInterval: 30000,
  });

  const { data: categoriesData } = useQuery<{ categories: CategoryRow[] }>({
    queryKey: ["/api/traction/categories"],
    refetchInterval: 60000,
  });

  const { data: usersData } = useQuery<{ users: UserRow[] }>({
    queryKey: ["/api/traction/users"],
    refetchInterval: 30000,
  });

  const { data: tracksData } = useQuery<{ tracks: TrackRow[] }>({
    queryKey: ["/api/traction/tracks"],
    refetchInterval: 60000,
  });

  const signups = signupsData?.signups?.map((r) => ({ ...r, day: formatDay(r.day) })) || [];
  const facts = factsData?.facts?.map((r) => ({ ...r, day: formatDay(r.day) })) || [];
  const categories = categoriesData?.categories?.slice(0, 10) || [];
  const users = usersData?.users || [];
  const maxFacts = Math.max(...users.map((u) => u.factCount), 1);

  // Competition start date: April 14, 2026
  const competitionStart = new Date("2026-04-14");
  const today = new Date();
  const daysIn = Math.floor((today.getTime() - competitionStart.getTime()) / 86400000);
  const daysLeft = Math.max(0, 49 - daysIn); // 7 weeks = 49 days until June 2

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-10 bg-background/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 36 36" fill="none" className="w-7 h-7" aria-label="Dilly">
              <rect width="36" height="36" rx="9" fill="currentColor" />
              <circle cx="18" cy="15" r="5.5" fill="white" />
              <rect x="9" y="24" width="18" height="2.5" rx="1.25" fill="white" opacity="0.4" />
              <rect x="12" y="28.5" width="12" height="2" rx="1" fill="white" opacity="0.22" />
            </svg>
            <div>
              <p className="text-sm font-bold leading-none" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
                Dilly
              </p>
              <p className="text-xs text-muted-foreground">Traction Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Competition week</p>
              <p className="text-sm font-bold text-[#e8f040]" data-testid="text-days-in">
                Day {daysIn} of 49
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Submission in</p>
              <p className="text-sm font-bold" data-testid="text-days-left">
                {daysLeft} days
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* KPI row */}
        {loadingOverview ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-6 h-28 animate-pulse" />
            ))}
          </div>
        ) : (
          <Section title="Key metrics — week 1">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Students signed up"
                value={overview?.totalUsers ?? 0}
                sub={`Last signup ${timeAgo(overview?.lastUserSignup ?? null)}`}
                accent
              />
              <StatCard
                label="Profile facts extracted"
                value={overview?.totalFacts ?? 0}
                sub={`Last fact ${timeAgo(overview?.lastFactAdded ?? null)}`}
              />
              <StatCard
                label="Active profiles"
                value={overview?.usersWithFacts ?? 0}
                sub="Users with at least 1 fact"
              />
              <StatCard
                label="Conversations"
                value={overview?.totalConversations ?? 0}
                sub="Dilly AI sessions"
              />
            </div>
          </Section>
        )}

        {/* Growth charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <Section title="User signups — cumulative">
            <div className="bg-card border border-border rounded-2xl p-5">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={signups} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e8f040" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#e8f040" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#666" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#666" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="totalUsers"
                    name="Total users"
                    stroke="#e8f040"
                    strokeWidth={2}
                    fill="url(#userGrad)"
                    dot={{ fill: "#e8f040", r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Facts extracted — cumulative">
            <div className="bg-card border border-border rounded-2xl p-5">
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={facts} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="factGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#666" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#666" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="totalFacts"
                    name="Total facts"
                    stroke="#2dd4bf"
                    strokeWidth={2}
                    fill="url(#factGrad)"
                    dot={{ fill: "#2dd4bf", r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>

        {/* Daily activity bar chart */}
        <Section title="Daily facts extracted">
          <div className="bg-card border border-border rounded-2xl p-5">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={facts} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#666" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#666" }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="factsAdded" name="Facts added" fill="#2dd4bf" radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* Users depth + categories */}
        <div className="grid md:grid-cols-2 gap-6">
          <Section title="Profile depth by user">
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              {users.length === 0 && (
                <p className="text-sm text-muted-foreground">Loading...</p>
              )}
              {users.map((u) => (
                <div key={u.id} className="space-y-1.5" data-testid={`user-row-${u.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-foreground">{u.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{u.track || "—"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {u.conversations} conv{u.conversations !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <DepthBar facts={u.factCount} max={maxFacts} />
                </div>
              ))}
              <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-2">
                Users shown anonymized. Full profiles in Blind Audition demo.
              </p>
            </div>
          </Section>

          <Section title="What Dilly learns — fact types">
            <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
              {categories.map((c, i) => {
                const maxCat = categories[0]?.count || 1;
                const pct = (c.count / maxCat) * 100;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28 flex-shrink-0 truncate">
                      {categoryLabel(c.category)}
                    </span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: i === 0 ? "#e8f040" : `hsl(${170 + i * 8}, 60%, 50%)`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-4 text-right">{c.count}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        {/* Narrative context for judges */}
        <Section title="Competition context">
          <div className="bg-card border border-border rounded-2xl p-6 grid md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">What Dilly is</p>
              <p className="text-sm text-foreground leading-relaxed">
                An AI that learns who candidates really are from conversations.
                No resumes. No GPAs. No school names.
                What they have actually built, thought about, and done.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Week 1 signal</p>
              <p className="text-sm text-foreground leading-relaxed">
                {overview?.totalUsers ?? "—"} students signed up organically in week 1 of the competition.
                {" "}{overview?.totalFacts ?? "—"} facts extracted across {overview?.usersWithFacts ?? "—"} active profiles,
                from {overview?.totalConversations ?? "—"} real conversations.
                All data is live from production.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">The demo</p>
              <p className="text-sm text-foreground leading-relaxed">
                The Blind Audition puts real candidate profiles in front of a recruiter,
                names hidden, ranked by what conversations revealed.
                No resumes involved at any point.
              </p>
              <a
                href="https://dilly-blind-audition.pplx.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-[#e8f040] hover:opacity-75 transition-opacity"
                data-testid="link-blind-audition"
              >
                Open Blind Audition
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
          </div>
        </Section>

        {/* Footer */}
        <div className="border-t border-border pt-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Dilly · Perplexity Billion Dollar Build · Data refreshes every 30s
          </p>
          <a
            href="https://trydilly.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            trydilly.com
          </a>
        </div>
      </main>
    </div>
  );
}
