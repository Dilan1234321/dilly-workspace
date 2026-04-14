"use client";

/**
 * Dilly Recruiter — Interactive Demo
 *
 * A fully self-contained demo that requires no API key and no live backend.
 * Judges and prospects can experience the full Dilly Recruiter flow with
 * realistic curated candidate data — including interactive Ask Dilly responses.
 *
 * Route: /recruiter/demo
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type DemoCandidate = {
  id: string;
  name: string;
  initials: string;
  major: string;
  school: string;
  cohort: string;
  fit_level: "Standout" | "Strong fit" | "Moderate fit" | "Developing";
  match_score: number;
  dilly_take: string;
  rerank_reason: string;
  why_fit: string[];
  jd_evidence: Array<{ req: string; status: "green" | "yellow" | "red"; evidence: string }>;
  experience: Array<{ company: string; role: string; date: string; bullets: string[]; matched?: boolean }>;
  location: string;
  avatar_color: string;
  ask_ai: Record<string, string>;
};

// ─── Demo role ────────────────────────────────────────────────────────────────

const DEMO_ROLE = `Senior Software Engineer — Backend Infrastructure

We're building the data layer that powers real-time personalization for 40M+ users. Looking for someone who has:
- Designed and shipped high-throughput distributed systems (Kafka, Flink, or similar)
- Deep Python or Go experience in production at scale
- Owned reliability and SLA for critical services
- Comfortable with cloud-native architecture (AWS or GCP)
- Bonus: experience with ML pipeline infrastructure or feature stores`;

// ─── Ask Dilly questions (shared across all candidates) ───────────────────────

const ASK_QUESTIONS = [
  "How do they handle technical ambiguity?",
  "What is the biggest risk in hiring this candidate?",
  "Write 3 interview questions targeting their gaps.",
];

// ─── Demo candidates ──────────────────────────────────────────────────────────

const DEMO_CANDIDATES: DemoCandidate[] = [
  {
    id: "demo-001",
    name: "Priya Raghunathan",
    initials: "PR",
    major: "Computer Science",
    school: "Carnegie Mellon University",
    cohort: "Class of 2023",
    fit_level: "Standout",
    match_score: 94,
    location: "San Francisco, CA",
    avatar_color: "#2B3A8E",
    dilly_take: "Priya built and owns the data ingestion pipeline at Stripe that processes 2M+ events per second across 40 Kafka topics. She re-architected the ML feature store from scratch, cutting P99 latency from 800ms to 90ms. She is one of the most technically complete backend infrastructure engineers in this cohort — the match here is direct, not analogous.",
    rerank_reason: "Built production Kafka pipeline at Stripe processing 2M+ events/sec. Exact match.",
    why_fit: [
      "Owns Stripe's real-time data ingestion pipeline — 2M events/sec across 40 Kafka topics",
      "Re-architected the ML feature store from scratch, reducing P99 latency by 89%",
      "Led AWS migration of 3 core services with zero downtime — directly relevant",
      "CS degree from CMU with a distributed systems focus — theory matches practice",
    ],
    jd_evidence: [
      { req: "High-throughput distributed systems (Kafka)", status: "green", evidence: "Built and owns Stripe's Kafka ingestion — 2M events/sec in production" },
      { req: "Python or Go at scale", status: "green", evidence: "Primary language is Python; shipped 4 production services in Go at Stripe" },
      { req: "Owned reliability and SLA for critical services", status: "green", evidence: "On-call owner for payment event stream — 99.99% SLA, 18 months" },
      { req: "Cloud-native architecture (AWS or GCP)", status: "green", evidence: "Led AWS migration of 3 services; certified Solutions Architect" },
      { req: "ML pipeline infrastructure or feature stores", status: "green", evidence: "Re-architected the ML feature store — her project, her ownership" },
    ],
    experience: [
      {
        company: "Stripe",
        role: "Software Engineer II — Data Infrastructure",
        date: "Jul 2023 — present",
        bullets: [
          "Owns real-time event ingestion pipeline processing 2M+ events/sec across 40 Kafka topics",
          "Re-architected ML feature store from monolith to microservices; P99 latency 800ms to 90ms",
          "Led zero-downtime AWS migration of payment event stream, ledger, and audit services",
          "On-call owner for payment event stream — 99.99% SLA maintained for 18 months",
        ],
        matched: true,
      },
      {
        company: "Jane Street",
        role: "Software Engineering Intern",
        date: "Summer 2022",
        bullets: [
          "Built latency monitoring system for options pricing engine in OCaml",
          "Reduced alert noise by 60% via statistical anomaly detection on tick data",
        ],
      },
    ],
    ask_ai: {
      "How do they handle technical ambiguity?": "Priya's profile shows a consistent pattern of self-directed problem framing. When Stripe's ML feature store had no clear owner and no clear path forward, she proposed and led the re-architecture without being asked. She told Dilly: 'The old system was a black box. I spent two weeks understanding it before I wrote a single line of code.' She has a low tolerance for undefined systems — but rather than waiting for clarity, she generates it herself.",
      "What is the biggest risk in hiring this candidate?": "The honest risk is pace expectations. Priya works methodically — she builds deep understanding before shipping. At Stripe that is a feature, not a bug. In a startup moving fast without full requirements, she may need support calibrating urgency vs. thoroughness. She is not slow, but she is deliberate. If your environment rewards speed over correctness, she will need to consciously adapt.",
      "Write 3 interview questions targeting their gaps.": "1. You have owned a Kafka pipeline at 2M events/sec. Walk me through a production incident where throughput caused unexpected downstream failures — how did you diagnose it and what did you change?\n\n2. Your ML feature store re-architecture was internally driven — you had months to plan it. If you had to make the same change in 6 weeks with a feature freeze coming, what would you cut and what would you protect?\n\n3. You have worked in large, structured engineering orgs. Describe a time when you had to ship something important without the usual process or approvals. What did you do?",
    },
  },
  {
    id: "demo-002",
    name: "Marcus Webb",
    initials: "MW",
    major: "Electrical Engineering & Computer Science",
    school: "UC Berkeley",
    cohort: "Class of 2024",
    fit_level: "Strong fit",
    match_score: 78,
    location: "New York, NY",
    avatar_color: "#1a2660",
    dilly_take: "Marcus has strong distributed systems fundamentals from his work at Cloudflare, where he contributed to the Workers runtime and built internal tooling for traffic routing. He understands the infrastructure layer deeply. The gap is that his Kafka and ML pipeline experience is limited to coursework — he has the ceiling, but not yet the production depth.",
    rerank_reason: "Cloudflare Workers runtime contributor. Strong distributed systems depth, limited Kafka production experience.",
    why_fit: [
      "Contributed to Cloudflare Workers runtime — real distributed systems work in production",
      "Built traffic routing tooling in Go used across Cloudflare's edge network",
      "AWS experience from Cloudflare — comfortable in cloud-native environments",
      "Undergraduate distributed systems research with published work — knows the theory cold",
    ],
    jd_evidence: [
      { req: "High-throughput distributed systems (Kafka)", status: "yellow", evidence: "No Kafka production experience; strong conceptual foundation from coursework and research" },
      { req: "Python or Go at scale", status: "green", evidence: "Primary Go contributor on Cloudflare Workers runtime — production traffic" },
      { req: "Owned reliability and SLA for critical services", status: "yellow", evidence: "Intern contributor to SLA-critical systems at Cloudflare, not an owner" },
      { req: "Cloud-native architecture (AWS or GCP)", status: "green", evidence: "AWS-native work at Cloudflare; Lambda, SQS, ECS all in scope" },
      { req: "ML pipeline infrastructure or feature stores", status: "red", evidence: "No ML infrastructure experience in profile" },
    ],
    experience: [
      {
        company: "Cloudflare",
        role: "Software Engineering Intern — Runtime Team",
        date: "Summer 2023",
        bullets: [
          "Contributed to Cloudflare Workers runtime — Go/Rust, handles 10M+ req/sec edge traffic",
          "Built internal traffic routing diagnostic tooling deployed to 200+ PoPs",
          "Reduced cold-start latency for Workers runtime by 12ms via memory pre-allocation",
        ],
        matched: true,
      },
      {
        company: "UC Berkeley — Research",
        role: "Undergraduate Researcher — Distributed Systems Lab",
        date: "Jan 2023 — May 2024",
        bullets: [
          "Implemented and benchmarked Raft consensus algorithm variants; paper submitted to SOSP",
          "Built fault injection framework for distributed database testing in Python",
        ],
      },
    ],
    ask_ai: {
      "How do they handle technical ambiguity?": "Marcus approaches ambiguity through first-principles research. When he joined the Cloudflare Workers runtime team, he spent two weeks reading the V8 internals docs before touching the codebase. He told Dilly: 'I need to understand the shape of a problem before I start moving parts.' His research background reinforces this — he is comfortable in systems with no clear answers, but he tends to over-architect before executing. That is manageable, but worth calibrating early.",
      "What is the biggest risk in hiring this candidate?": "The main risk is the gap between his ceiling and his current floor. Marcus has the raw ability for this role — his Cloudflare work shows that. But he has never owned a service end-to-end, never been on-call for a production system with a real SLA. He will need a structured ramp and a patient first manager. If you can give him that, the upside is significant. If you need someone who can run independently from day one, he is not ready yet.",
      "Write 3 interview questions targeting their gaps.": "1. You have strong systems intuition from research and your Cloudflare work, but you have not owned a production service with an SLA. How do you think about on-call preparedness, and what would you do in your first 30 days to get up to speed?\n\n2. Kafka is core to this role, but it is not in your profile. Walk me through how you would learn a production distributed messaging system in your first 60 days — what resources, who would you talk to, and how would you validate your understanding?\n\n3. You have worked in large engineering orgs with clear structure. This team is smaller and moves faster. Tell me about a time you had to make a call without a senior engineer to validate you. What happened?",
    },
  },
  {
    id: "demo-003",
    name: "Aisha Okonkwo",
    initials: "AO",
    major: "Computer Science",
    school: "Georgia Tech",
    cohort: "Class of 2025",
    fit_level: "Moderate fit",
    match_score: 51,
    location: "Atlanta, GA",
    avatar_color: "#6B7280",
    dilly_take: "Aisha is a talented engineer with a strong web and API background from her work at Calendly, but this role is a significant stretch. She has not worked with event streaming systems or ML infrastructure. Her Go experience is limited to side projects. She is worth watching for a backend API or platform role — but for high-throughput data infrastructure, she will need 12+ months of ramp.",
    rerank_reason: "Strong API engineering background, but no Kafka, no ML infra, limited distributed systems depth.",
    why_fit: [
      "Backend API engineering at Calendly — solid production Python and REST experience",
      "Has shipped services handling 500K+ daily active users — knows scale in practice",
    ],
    jd_evidence: [
      { req: "High-throughput distributed systems (Kafka)", status: "red", evidence: "No event streaming experience in profile" },
      { req: "Python or Go at scale", status: "yellow", evidence: "Strong Python at Calendly; Go limited to side projects on GitHub" },
      { req: "Owned reliability and SLA for critical services", status: "yellow", evidence: "Contributed to SLA-critical scheduling service but was not the owner" },
      { req: "Cloud-native architecture (AWS or GCP)", status: "green", evidence: "AWS experience at Calendly — ECS, RDS, SQS for async job queue" },
      { req: "ML pipeline infrastructure or feature stores", status: "red", evidence: "No ML infrastructure experience" },
    ],
    experience: [
      {
        company: "Calendly",
        role: "Software Engineering Intern — Platform Team",
        date: "Summer 2024",
        bullets: [
          "Built async job queue for calendar sync events using AWS SQS and Lambda",
          "Reduced API p95 latency by 22ms via database query optimization (PostgreSQL)",
          "Shipped timezone normalization service used by 500K+ daily scheduling events",
        ],
      },
    ],
    ask_ai: {
      "How do they handle technical ambiguity?": "Aisha's profile shows strong execution instincts within a defined scope, but less evidence of owning ambiguous problems. At Calendly, her projects were well-specified before she started. She told Dilly: 'I prefer to have a clear objective before I start building.' That is not a red flag at this stage in her career — it is developmentally appropriate. For this infrastructure role though, requirements rarely arrive pre-specified. She would need coaching on how to operate in an environment where discovery and delivery happen simultaneously.",
      "What is the biggest risk in hiring this candidate?": "The honest answer is technical fit. The JD Evidence Map is telling: two red flags on the core requirements (Kafka, ML infra), and no production experience owning reliability. Aisha is a talented engineer on a strong trajectory, but she is 12 to 18 months away from being ready for this specific role. Hiring her here sets her up to struggle and you up to be frustrated. She would be a much stronger fit for a backend API or platform engineering role where her strengths are directly applicable.",
      "Write 3 interview questions targeting their gaps.": "1. This role requires deep distributed systems knowledge — Kafka, high-throughput data pipelines. Your background is in API engineering and async job queues. What is your honest self-assessment of that gap, and what have you done to close it?\n\n2. You have contributed to services used by 500K+ users, but you have not been the reliability owner. Walk me through how you think about SLA ownership — what does being on-call actually mean to you?\n\n3. If you joined this team and found yourself in an area with no prior experience — say, Kafka stream processing — what would your first 30 days look like? Be specific.",
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fitColorCls(level: string): string {
  if (level === "Standout" || level === "Strong fit") return "dr-fit-badge--green";
  if (level === "Moderate fit") return "dr-fit-badge--amber";
  return "dr-fit-badge--red";
}

function fitDotCls(level: string): string {
  if (level === "Standout" || level === "Strong fit") return "dr-fit-dot--green";
  if (level === "Moderate fit") return "dr-fit-dot--amber";
  return "dr-fit-dot--red";
}

function cardBorderCls(level: string): string {
  if (level === "Standout" || level === "Strong fit") return "dr-candidate-card--green";
  if (level === "Moderate fit") return "dr-candidate-card--amber";
  return "dr-candidate-card--red";
}

function evidenceIcon(status: "green" | "yellow" | "red"): string {
  if (status === "green") return "✓";
  if (status === "yellow") return "~";
  return "✗";
}

function evidenceIconCls(status: "green" | "yellow" | "red"): string {
  if (status === "green") return "dr-evidence-status--green";
  if (status === "yellow") return "dr-evidence-status--amber";
  return "dr-evidence-status--red";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DemoAvatar({ initials, color, size = 56 }: { initials: string; color: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.32,
        fontFamily: "var(--font-montserrat), sans-serif",
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );
}

// ─── Typewriter effect for Ask Dilly responses ────────────────────────────────

function TypewriterText({ text, onDone }: { text: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed("");
    indexRef.current = 0;
    const interval = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) {
        clearInterval(interval);
        onDone?.();
      }
    }, 10);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {displayed}
      {displayed.length < text.length && (
        <span className="dr-ask-ai-cursor" aria-hidden>|</span>
      )}
    </span>
  );
}

// ─── Ask Dilly widget ─────────────────────────────────────────────────────────

function AskDillyWidget({ candidate }: { candidate: DemoCandidate }) {
  const [activeQ, setActiveQ] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  const handleQuestion = (q: string) => {
    if (activeQ === q) return;
    setActiveQ(q);
    setIsTyping(true);
    setTimeout(() => {
      responseRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  return (
    <div className="dr-demo-ask-ai">
      <div className="dr-demo-ask-ai-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Ask Dilly about {candidate.name.split(" ")[0]}</span>
        <span className="dr-demo-ask-ai-live-badge">Live</span>
      </div>
      <p className="dr-demo-ask-ai-sub">
        Dilly has read the full profile. Click any question to get an answer.
      </p>
      <div className="dr-demo-ask-ai-queries">
        {ASK_QUESTIONS.map((q, i) => (
          <button
            key={i}
            type="button"
            className={`dr-demo-ask-ai-chip ${activeQ === q ? "dr-demo-ask-ai-chip--active" : ""}`}
            onClick={() => handleQuestion(q)}
          >
            {q}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeQ && (
          <motion.div
            key={activeQ}
            ref={responseRef}
            className="dr-demo-ask-ai-response"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="dr-demo-ask-ai-q">{activeQ}</div>
            <div className="dr-demo-ask-ai-a">
              <TypewriterText
                text={candidate.ask_ai[activeQ] ?? ""}
                onDone={() => setIsTyping(false)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!activeQ && (
        <div className="dr-demo-ask-ai-prompt">
          Click a question above to see Dilly answer from the full profile.
        </div>
      )}
    </div>
  );
}

// ─── Search view ──────────────────────────────────────────────────────────────

function SearchView({
  onSelect,
  searched,
  setSearched,
}: {
  onSelect: (c: DemoCandidate) => void;
  searched: boolean;
  setSearched: (v: boolean) => void;
}) {
  const [roleText, setRoleText] = useState(DEMO_ROLE);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "green" | "amber" | "red">("all");

  const handleSearch = () => {
    if (!roleText.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSearched(true);
    }, 1600);
  };

  const filtered = DEMO_CANDIDATES.filter(c => {
    if (filter === "all") return true;
    if (filter === "green") return c.fit_level === "Standout" || c.fit_level === "Strong fit";
    if (filter === "amber") return c.fit_level === "Moderate fit";
    return c.fit_level === "Developing";
  });

  return (
    <div className="dr-page">
      {/* Demo banner */}
      <div className="dr-demo-banner">
        <span className="dr-demo-banner-dot" />
        <strong>Live Demo</strong> — No API key required. Showing curated candidate profiles.
        <Link href="/recruiter" className="dr-demo-banner-link">
          Use with real data
        </Link>
      </div>

      <div className="dr-page-header">
        <h1 className="dr-page-title">Candidate Search</h1>
        <p className="dr-page-subtitle">
          Dilly reads the full profile, not just the resume.
        </p>
      </div>

      {/* Search box */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div className="dr-search-wrap">
          <div className="dr-search-field">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--dr-text-muted)", pointerEvents: "none" }} aria-hidden>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <textarea
              className="dr-search-input"
              style={{ paddingTop: "0.7rem", resize: "none", minHeight: "44px", lineHeight: "1.5" }}
              value={roleText}
              onChange={e => setRoleText(e.target.value)}
              rows={roleText.split("\n").length > 3 ? 6 : 3}
            />
          </div>
          <button
            className="dr-search-btn"
            onClick={handleSearch}
            disabled={loading || !roleText.trim()}
          >
            {loading ? "Analyzing profiles…" : searched ? "Re-search" : "Search"}
          </button>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--dr-text-muted)", marginTop: "0.3rem" }}>
          Tip: Dilly reads the full living profile, not just keywords. The more specific your JD, the more precise the fit narrative.
        </p>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="dr-skeleton" style={{ height: 130, borderRadius: "var(--dr-radius-lg)" }} />
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <AnimatePresence mode="wait">
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Fit tabs */}
            <div className="dr-fit-tabs">
              {([
                { key: "all", label: "All", count: DEMO_CANDIDATES.length },
                { key: "green", label: "Strong Fit", count: 2, dot: "dr-fit-dot--green", tab: "dr-fit-tab--green" },
                { key: "amber", label: "Partial Fit", count: 1, dot: "dr-fit-dot--amber", tab: "dr-fit-tab--amber" },
                { key: "red", label: "Developing", count: 0, dot: "dr-fit-dot--red", tab: "dr-fit-tab--red" },
              ] as Array<{ key: string; label: string; count: number; dot?: string; tab?: string }>).map(t => (
                <button
                  key={t.key}
                  type="button"
                  className={`dr-fit-tab ${t.tab ?? ""} ${filter === t.key ? "dr-fit-tab--active" : ""}`}
                  onClick={() => setFilter(t.key as typeof filter)}
                >
                  {t.dot && <span className={`dr-fit-dot ${t.dot}`} />}
                  {t.label}
                  <span style={{ fontWeight: 400, opacity: 0.7, fontSize: "0.75rem" }}>({t.count})</span>
                </button>
              ))}
            </div>

            {/* Results count */}
            <div className="dr-results-bar">
              <p className="dr-results-count">
                Showing <strong>{filtered.length}</strong> of <strong>{DEMO_CANDIDATES.length}</strong> candidates for &ldquo;Senior Backend Infrastructure Engineer&rdquo;
              </p>
            </div>

            {/* Cards */}
            <div className="dr-card-list">
              {filtered.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.06, ease: "easeOut" }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    style={{ all: "unset", display: "block", width: "100%", cursor: "pointer" }}
                  >
                    <div className={`dr-candidate-card ${cardBorderCls(c.fit_level)}`}>
                      <div className="dr-card-main">
                        <DemoAvatar initials={c.initials} color={c.avatar_color} size={52} />
                        <div className="dr-card-body">
                          <div className="dr-card-top">
                            <span className="dr-card-name">{c.name}</span>
                            <span className={`dr-fit-badge ${fitColorCls(c.fit_level)}`}>
                              <span className={`dr-fit-dot ${fitDotCls(c.fit_level)}`} />
                              {c.fit_level}
                            </span>
                          </div>
                          <div className="dr-card-meta">
                            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                              {c.major}
                              <span className="dr-card-meta-sep">·</span>
                              {c.school}
                              <span className="dr-card-meta-sep">·</span>
                              {c.cohort}
                            </span>
                          </div>
                          <p className="dr-card-take">{c.rerank_reason}</p>
                          <div className="dr-card-footer">
                            <span className="dr-match-chip">{c.match_score}% match</span>
                            <span
                              className="dr-btn dr-btn--sm dr-btn--outline"
                              style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                            >
                              View profile
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><polyline points="9 18 15 12 9 6"/></svg>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Not searched yet */}
      {!loading && !searched && (
        <div className="dr-empty">
          <div className="dr-empty-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <p className="dr-empty-title">The role is pre-loaded above</p>
          <p className="dr-empty-body">
            Press <strong>Search</strong> to see Dilly evaluate 3 real-style candidates against the role.
            Each gets a profile-backed fit narrative, not a keyword score.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Profile view ─────────────────────────────────────────────────────────────

function ProfileView({
  candidate,
  onBack,
}: {
  candidate: DemoCandidate;
  onBack: () => void;
}) {
  return (
    <motion.div
      className="dr-profile-page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {/* Demo banner */}
      <div className="dr-demo-banner">
        <span className="dr-demo-banner-dot" />
        <strong>Live Demo</strong> — Curated demo data. No API key required.
        <Link href="/recruiter" className="dr-demo-banner-link">
          Use with real data
        </Link>
      </div>

      {/* Back */}
      <button type="button" onClick={onBack} className="dr-demo-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><polyline points="15 18 9 12 15 6"/></svg>
        Back to results
      </button>

      {/* Hero row */}
      <div className="dr-profile-hero-row">
        <DemoAvatar initials={candidate.initials} color={candidate.avatar_color} size={112} />
        <div className="dr-profile-identity">
          <div className="dr-profile-name-row">
            <h1 className="dr-profile-name">{candidate.name}</h1>
            <span className={`dr-fit-badge ${fitColorCls(candidate.fit_level)}`}>
              <span className={`dr-fit-dot ${fitDotCls(candidate.fit_level)}`} />
              {candidate.fit_level}
            </span>
            <span className="dr-match-chip">{candidate.match_score}% match</span>
          </div>
          <p className="dr-profile-meta">
            <span className="dr-meta-label">Major</span> {candidate.major}
            {" · "}
            {candidate.school}
            {" · "}
            {candidate.cohort}
          </p>
          <div className="dr-profile-actions">
            <button type="button" className="dr-action-btn dr-demo-disabled" disabled title="Available with real data">
              Reach out
            </button>
            <button type="button" className="dr-action-btn dr-action-btn--ghost dr-demo-disabled" disabled title="Available with real data">
              Bookmark
            </button>
          </div>
        </div>
      </div>

      {/* Dilly's Take */}
      <blockquote className="dr-dilly-take">
        <span className="dr-dilly-take-eyebrow">Dilly&apos;s Take</span>
        <p>{candidate.dilly_take}</p>
      </blockquote>

      {/* Two-column body */}
      <div className="dr-profile-columns">
        {/* LEFT */}
        <div className="dr-profile-col-left">
          {/* Why they fit */}
          <section className="dr-profile-section">
            <h2 className="dr-section-heading dr-section-heading--indigo">
              Why {candidate.name.split(" ")[0]} fits this role
            </h2>
            <ul className="dr-fit-bullets">
              {candidate.why_fit.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </section>

          {/* JD Evidence Map */}
          <section className="dr-profile-section">
            <h2 className="dr-section-heading dr-section-heading--indigo">
              How they map to the role
            </h2>
            <div className="dr-evidence-map">
              {candidate.jd_evidence.map((item, i) => (
                <div key={i} className="dr-evidence-row">
                  <div className="dr-evidence-req-row">
                    <span
                      className={`dr-evidence-status-icon ${evidenceIconCls(item.status)}`}
                      aria-label={item.status}
                    >
                      {evidenceIcon(item.status)}
                    </span>
                    <span className="dr-evidence-req">{item.req}</span>
                  </div>
                  <ul className="dr-evidence-list">
                    <li>{item.evidence}</li>
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT */}
        <div className="dr-profile-col-right">
          <section className="dr-profile-section">
            <h2 className="dr-section-heading dr-section-heading--indigo">Experience</h2>
            <div className="dr-experience-list">
              {candidate.experience.map((exp, i) => (
                <div key={i} className="dr-exp-entry">
                  <div className="dr-exp-header">
                    <div className="dr-exp-title-block">
                      <span className="dr-exp-role">{exp.role}</span>
                      <span className="dr-exp-company">{exp.company}</span>
                    </div>
                    <div className="dr-exp-meta-block">
                      <span className="dr-exp-date">{exp.date}</span>
                    </div>
                  </div>
                  <ul className="dr-exp-bullets">
                    {exp.bullets.map((b, j) => (
                      <li key={j} className={exp.matched ? "dr-exp-bullet--matched" : ""}>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Interactive Ask Dilly */}
          <section className="dr-profile-section">
            <AskDillyWidget candidate={candidate} />
          </section>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main demo page ───────────────────────────────────────────────────────────

export default function RecruiterDemoPage() {
  const [selected, setSelected] = useState<DemoCandidate | null>(null);
  const [searched, setSearched] = useState(false);

  return (
    <AnimatePresence mode="wait">
      {selected ? (
        <ProfileView
          key={selected.id}
          candidate={selected}
          onBack={() => setSelected(null)}
        />
      ) : (
        <SearchView
          key="search"
          onSelect={setSelected}
          searched={searched}
          setSearched={setSearched}
        />
      )}
    </AnimatePresence>
  );
}
