"use client";

/**
 * Dilly Recruiter — The Blind Audition
 *
 * The competition demo. Recruiters evaluate candidates with all
 * identifying information hidden — no name, no school, no location.
 * Only what they built. Only what they've done. Only what they said to Dilly.
 *
 * Then they hit Reveal.
 *
 * Route: /recruiter/blind
 */

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import Link from "next/link";
import "../recruiter-talent.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type FitLevel = "Standout" | "Strong fit" | "Moderate fit";

type BlindCandidate = {
  id: string;
  // Hidden until reveal
  name: string;
  school: string;
  school_tier: "non-target" | "mid-tier" | "target";
  location: string;
  first_gen: boolean;
  reveal_line: string; // The line shown after reveal
  filtered_out: boolean; // Would traditional ATS have filtered this?

  // Always visible
  fit_level: FitLevel;
  dilly_take: string; // Written with NO school/name references
  why_fit: string[];
  profile_facts: string[]; // From Dilly conversations — no identifiers
  jd_evidence: Array<{
    req: string;
    status: "green" | "yellow" | "red";
    evidence: string;
  }>;
  experience: Array<{
    company: string; // Shown — companies are fine
    role: string;
    date: string;
    bullets: string[];
  }>;
  ask_ai: Record<string, string>;
};

// ─── Demo role ────────────────────────────────────────────────────────────────

const BLIND_ROLE = `Senior Product Manager — Consumer Growth

We're looking for a PM who has shipped features that moved real metrics for a consumer product used by everyday people. What matters to us:
- Has owned a product area end-to-end, not just contributed to one
- Can point to a specific thing they shipped and tell you exactly why it worked
- Comfortable with ambiguity — our roadmap changes when the data changes
- Understands users at a human level, not just a funnel level
- Bonus: experience with retention, engagement, or activation loops`;

// ─── Ask Dilly questions ──────────────────────────────────────────────────────

const ASK_QUESTIONS = [
  "How do they handle ambiguity?",
  "What is the biggest risk in hiring them?",
  "What makes them different from other candidates?",
];

// ─── The three candidates ─────────────────────────────────────────────────────

const BLIND_CANDIDATES: BlindCandidate[] = [
  {
    id: "blind-001",
    // HIDDEN
    name: "Destiny Morales",
    school: "Florida International University",
    school_tier: "non-target",
    location: "Miami, FL",
    first_gen: true,
    filtered_out: true,
    reveal_line:
      "First-generation college student. Florida International University. In a traditional ATS filtered to target schools, this resume never reaches a recruiter.",

    // VISIBLE
    fit_level: "Standout",
    dilly_take:
      "This candidate built a campus event app used by 8,000 students because the university's official version was broken and nobody was fixing it. She made every product decision under real constraints — no budget, no team, shipping around a full course load. She understands users the way people who have had to earn attention always do: by actually listening to them. Her retention work at her current company reduced 30-day churn by 22%. She can tell you exactly why it worked.",
    why_fit: [
      "Built and owned a product used by 8,000 people from zero — not a feature on someone else's roadmap",
      "Reduced 30-day churn by 22% at current company — owns the number and can explain the mechanism",
      "Has made real product calls under constraint: no budget, no team, competing priorities",
      "User research instinct is native, not learned — she built the campus app because she was the user",
    ],
    profile_facts: [
      "Told Dilly: 'I built the app because I was tired of missing events I actually wanted to go to. The university's version hadn't been updated in four years.'",
      "When her churn reduction shipped, she spent three weeks interviewing users who had churned anyway to understand why the number wasn't higher.",
      "Turned down a role at a larger company last year — 'They wanted me to own a dashboard. I wanted to own something people actually used every day.'",
      "Has never had a formal PM mentor. Learned the job by doing it and by reading every post-mortem she could find publicly.",
    ],
    jd_evidence: [
      {
        req: "Owned a product area end-to-end",
        status: "green",
        evidence:
          "Built campus app alone from concept to 8,000 MAU. Owns growth pod at current company — strategy, roadmap, and shipping.",
      },
      {
        req: "Specific shipped thing with clear why",
        status: "green",
        evidence:
          "Churn reduction feature: redesigned the day-3 onboarding flow based on drop-off data. Can walk through every decision.",
      },
      {
        req: "Comfortable with ambiguity",
        status: "green",
        evidence:
          "Built under zero structure. Current role has no formal roadmap process — she created one.",
      },
      {
        req: "Understands users at a human level",
        status: "green",
        evidence:
          "Did 40+ user interviews for campus app. Interviews churned users post-launch to understand residual problems.",
      },
      {
        req: "Retention, engagement, or activation experience",
        status: "green",
        evidence: "22% reduction in 30-day churn. Core focus of current role.",
      },
    ],
    experience: [
      {
        company: "Mango Health",
        role: "Product Manager — Growth",
        date: "Jun 2023 — present",
        bullets: [
          "Owns growth pod: activation, retention, and referral loops for 400K MAU consumer health app",
          "Shipped redesigned day-3 onboarding flow — reduced 30-day churn by 22%",
          "Built referral program from scratch — 18% of new users in Q4 2024 came from referrals",
        ],
      },
      {
        company: "Campus Connect (self-founded)",
        role: "Founder & Product",
        date: "Jan 2021 — May 2023",
        bullets: [
          "Built campus event discovery app — 8,000 MAU at peak, used across 4 campus organizations",
          "Designed and shipped 6 major versions based on user feedback and usage data",
          "Shut down intentionally at graduation — open-sourced the codebase for the university",
        ],
      },
    ],
    ask_ai: {
      "How do they handle ambiguity?":
        "She creates structure where none exists. When she joined Mango Health, there was no growth roadmap and no clear owner for retention. She told Dilly: 'I spent the first two weeks just talking to users and looking at drop-off data. By week three I had a plan. Nobody asked me to do that — I just couldn't stand not knowing what the problem was.' This is a pattern, not a one-time event. She founded Campus Connect with zero product process and built one as she went. Ambiguity does not stall her. It activates her.",
      "What is the biggest risk in hiring them?":
        "She has always been the person who created the structure, not the person who operated within it. In a company with a mature PM process — quarterly planning, OKR cycles, stakeholder reviews — she may find the overhead frustrating. She is not someone who will quietly fit into a defined lane. If your environment rewards that kind of self-direction, she will thrive. If it rewards process compliance over initiative, she will be unhappy and eventually leave.",
      "What makes them different from other candidates?":
        "Most PM candidates at this stage describe their work in terms of what the team shipped. She describes it in terms of what changed for the user. The churn reduction story is not 'we redesigned the onboarding flow.' It is 'I interviewed 40 users who dropped off in the first week, found that three of them mentioned the same friction point on day three, and redesigned that specific moment.' That level of specificity is rare. It comes from having had to earn every user the hard way.",
    },
  },

  {
    id: "blind-002",
    // HIDDEN
    name: "James Okafor",
    school: "University of Texas at San Antonio",
    school_tier: "mid-tier",
    location: "San Antonio, TX",
    first_gen: false,
    filtered_out: true,
    reveal_line:
      "University of Texas at San Antonio. Not on most companies' target school lists. Most ATS systems would have ranked this resume below the next candidate automatically.",

    // VISIBLE
    fit_level: "Strong fit",
    dilly_take:
      "He spent two years in customer support before moving into product — which means he has heard more real user complaints than most PMs accumulate in a career. That background shows in how he talks about product decisions: he does not describe features, he describes problems people had and why the solution he chose addressed the root cause rather than the symptom. His activation work at his current company moved a metric that had been flat for eight months.",
    why_fit: [
      "Customer support background gives him user empathy that most PMs have to learn — he started there",
      "Moved a metric that had been flat for eight months — knows how to diagnose a stuck number",
      "Describes product decisions in terms of root cause, not features — rare at this experience level",
      "Has shipped in a resource-constrained environment — no large team, no big budget",
    ],
    profile_facts: [
      "Started in customer support intentionally — 'I wanted to understand what was actually broken before I tried to fix anything.'",
      "Told Dilly the activation project almost got cancelled twice. He kept it alive by showing leadership a cohort analysis that made the problem undeniable.",
      "Reads customer support tickets every Friday morning — still, even as a PM. 'That's where the real product feedback lives.'",
      "His biggest regret: a feature he pushed to ship that solved the wrong problem. He references it unprompted when talking about his process now.",
    ],
    jd_evidence: [
      {
        req: "Owned a product area end-to-end",
        status: "green",
        evidence:
          "Owns activation and onboarding at current company — full scope from strategy to shipping.",
      },
      {
        req: "Specific shipped thing with clear why",
        status: "green",
        evidence:
          "Activation flow redesign: diagnosed 8-month plateau via cohort analysis, shipped fix, moved metric 31 points.",
      },
      {
        req: "Comfortable with ambiguity",
        status: "green",
        evidence:
          "Kept activation project alive through two near-cancellations using data to maintain leadership buy-in.",
      },
      {
        req: "Understands users at a human level",
        status: "green",
        evidence:
          "2 years in customer support before PM. Still reads support tickets weekly by choice.",
      },
      {
        req: "Retention, engagement, or activation experience",
        status: "green",
        evidence:
          "Activation is his primary focus — moved week-1 activation rate from 34% to 65%.",
      },
    ],
    experience: [
      {
        company: "Fieldvine",
        role: "Product Manager — Activation & Onboarding",
        date: "Mar 2024 — present",
        bullets: [
          "Owns activation and onboarding for B2C field services platform — 120K registered users",
          "Shipped activation flow redesign — week-1 activation rate from 34% to 65% over 90 days",
          "Built cohort analysis framework now used across the product team for retention diagnostics",
        ],
      },
      {
        company: "Fieldvine",
        role: "Customer Support Lead",
        date: "Jan 2022 — Mar 2024",
        bullets: [
          "Handled 200+ user contacts per week — identified recurring product gaps that became PM roadmap items",
          "Built internal knowledge base that reduced average resolution time by 40%",
          "Transitioned into PM role after proposing and shipping a self-serve onboarding improvement",
        ],
      },
    ],
    ask_ai: {
      "How do they handle ambiguity?":
        "He reaches for data before he reaches for solutions. When the activation metric was flat for eight months and nobody knew why, he did not propose a fix — he built a cohort analysis to understand what was actually happening. He told Dilly: 'I had three hypotheses about why activation was stuck. The data eliminated two of them in a week. Then I knew where to look.' He is comfortable sitting in the problem longer than most PMs, which means his solutions tend to address root causes rather than symptoms.",
      "What is the biggest risk in hiring them?":
        "He is methodical to a fault in fast-moving environments. The activation project took 90 days to show results — which is fine if your organization can hold that patience. If your environment expects faster shipping and faster feedback cycles, his instinct to fully diagnose before proposing will feel slow. He is not slow — he is thorough. That distinction matters depending on your culture.",
      "What makes them different from other candidates?":
        "He is the only PM candidate I have seen in this cohort who voluntarily reads customer support tickets as a standing practice. Not during a research sprint. Every week. That habit produces a different kind of product intuition — one rooted in what users actually say when they are frustrated, not what they say in a structured interview. His activation work reflects this. The fix he shipped addressed a friction point that only showed up in support tickets, not in any analytics dashboard.",
    },
  },

  {
    id: "blind-003",
    // HIDDEN
    name: "Tyler Weston",
    school: "Cornell University",
    school_tier: "target",
    location: "New York, NY",
    first_gen: false,
    filtered_out: false,
    reveal_line:
      "Cornell University. Google internship. This is the resume that gets through every filter — and ranks below the other two.",

    // VISIBLE
    fit_level: "Moderate fit",
    dilly_take:
      "Impressive resume on paper. The internship at a major tech company is real, the degree is real, and he has the vocabulary of someone who has been around good product teams. The issue is that nothing in his profile is his. He describes his internship work in terms of what the team shipped, not what he specifically decided or why. When Dilly asked him about a time a product decision did not work out, he described a project that got deprioritized — not a mistake he owned. He has been in the right rooms. He has not yet had to carry a room himself.",
    why_fit: [
      "Strong product fundamentals — knows the vocabulary, frameworks, and process of a mature PM org",
      "Internship at scale gave him exposure to real consumer products used by millions",
    ],
    profile_facts: [
      "When asked about his biggest product failure, he described a project that got cancelled due to company priorities — not a decision he made that turned out to be wrong.",
      "Told Dilly his goal is to be a CPO at a Series B company within 7 years. Has not yet shipped something he owns end-to-end.",
      "His internship project shipped — but when Dilly asked why the team chose that solution over the alternatives, he said 'the senior PM decided.'",
      "Articulate and polished in how he talks about product. The substance underneath is thinner than the presentation.",
    ],
    jd_evidence: [
      {
        req: "Owned a product area end-to-end",
        status: "red",
        evidence:
          "Has contributed to product areas but has not owned one. Internship was a defined scope project with a senior PM leading.",
      },
      {
        req: "Specific shipped thing with clear why",
        status: "yellow",
        evidence:
          "Shipped a feature during internship but attributes decisions to the senior PM. Cannot clearly articulate why specific choices were made.",
      },
      {
        req: "Comfortable with ambiguity",
        status: "yellow",
        evidence:
          "No evidence of operating in ambiguity. All roles have been in structured, well-resourced environments.",
      },
      {
        req: "Understands users at a human level",
        status: "yellow",
        evidence:
          "Completed user research as part of internship process. No evidence of self-directed user understanding outside of assigned work.",
      },
      {
        req: "Retention, engagement, or activation experience",
        status: "red",
        evidence: "No direct experience with growth or retention metrics.",
      },
    ],
    experience: [
      {
        company: "Google",
        role: "Product Management Intern — Maps",
        date: "Summer 2024",
        bullets: [
          "Contributed to local business discovery feature on Google Maps — shipped to 5% of users in test market",
          "Conducted 12 user interviews as part of structured research sprint",
          "Presented findings to PM team; recommendations incorporated into roadmap planning",
        ],
      },
      {
        company: "Cornell Product Studio",
        role: "Product Lead",
        date: "Sep 2023 — May 2024",
        bullets: [
          "Led team of 5 to build campus sustainability tracking app as course project",
          "Defined product requirements and ran weekly sprints",
        ],
      },
    ],
    ask_ai: {
      "How do they handle ambiguity?":
        "Honestly — there is not much evidence yet. Every environment he has worked in has had clear structure: a defined internship scope, a course project with a rubric, a senior PM to escalate to. Dilly asked him directly about a time he had to make a call without clear guidance. He described asking his manager for direction. That is not a red flag at this stage in a career — it is developmentally normal. But for a Senior PM role that explicitly requires comfort with ambiguity, he is not ready yet.",
      "What is the biggest risk in hiring them?":
        "The risk is paying Senior PM salary for Associate PM output. His profile reads senior on the surface — the school, the internship, the vocabulary. Underneath it, he has not yet owned anything. He has contributed, he has supported, he has presented. He has not shipped something that lives or dies on his judgment. Hiring him into a Senior role where he is expected to operate independently will likely result in over-management, frustration on both sides, and an eventual PIP or departure within 18 months.",
      "What makes them different from other candidates?":
        "Honestly, in this pool — not much. He is the candidate who looks the most like what a Senior PM is supposed to look like on paper. The degree, the internship, the polished communication. But looking like a Senior PM and being one are different things. The other candidates in this pool have shipped things they own and can defend decision by decision. He has not. The difference becomes visible the moment you ask 'why did you choose that over the alternative?' and one candidate has a real answer and the other says 'the senior PM decided.'",
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fitColorCls(level: FitLevel): string {
  if (level === "Standout" || level === "Strong fit") return "dr-fit-badge--green";
  return "dr-fit-badge--amber";
}

function fitDotCls(level: FitLevel): string {
  if (level === "Standout" || level === "Strong fit") return "dr-fit-dot--green";
  return "dr-fit-dot--amber";
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

// ─── Typewriter ───────────────────────────────────────────────────────────────

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  const start = useCallback(() => {
    setDisplayed("");
    indexRef.current = 0;
    const interval = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) clearInterval(interval);
    }, 10);
    return () => clearInterval(interval);
  }, [text]);

  // Auto-start
  useState(() => { start(); });

  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {displayed}
      {displayed.length < text.length && (
        <span className="dr-ask-ai-cursor" aria-hidden>|</span>
      )}
    </span>
  );
}

// ─── Anonymous avatar ─────────────────────────────────────────────────────────

function AnonAvatar({ size = 56 }: { size?: number }) {
  return (
    <div
      className="dr-blind-avatar"
      style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0 }}
      aria-label="Identity hidden"
    >
      <svg
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "100%" }}
        aria-hidden
      >
        <circle cx="28" cy="28" r="28" fill="#E5E7EB" />
        <circle cx="28" cy="22" r="9" fill="#9CA3AF" />
        <ellipse cx="28" cy="46" rx="16" ry="10" fill="#9CA3AF" />
      </svg>
    </div>
  );
}

// ─── Reveal avatar ────────────────────────────────────────────────────────────

function RevealAvatar({
  initials,
  tier,
  size = 56,
}: {
  initials: string;
  tier: "non-target" | "mid-tier" | "target";
  size?: number;
}) {
  const colors = {
    "non-target": "#2B3A8E",
    "mid-tier": "#1a2660",
    target: "#6B7280",
  };
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: colors[tier],
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.3,
        fontFamily: "var(--font-montserrat), sans-serif",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );
}

// ─── Ask Dilly widget ─────────────────────────────────────────────────────────

function AskDillyBlind({ candidate }: { candidate: BlindCandidate }) {
  const [activeQ, setActiveQ] = useState<string | null>(null);

  return (
    <div className="dr-demo-ask-ai">
      <div className="dr-demo-ask-ai-header">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Ask Dilly about this candidate</span>
        <span className="dr-demo-ask-ai-live-badge">Blind mode</span>
      </div>
      <p className="dr-demo-ask-ai-sub">
        Dilly has read the full profile. Identifying information is still hidden.
      </p>
      <div className="dr-demo-ask-ai-queries">
        {ASK_QUESTIONS.map((q, i) => (
          <button
            key={i}
            type="button"
            className={`dr-demo-ask-ai-chip ${activeQ === q ? "dr-demo-ask-ai-chip--active" : ""}`}
            onClick={() => setActiveQ(activeQ === q ? null : q)}
          >
            {q}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {activeQ && (
          <motion.div
            key={activeQ}
            className="dr-demo-ask-ai-response"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="dr-demo-ask-ai-q">{activeQ}</div>
            <div className="dr-demo-ask-ai-a">
              <TypewriterText text={candidate.ask_ai[activeQ] ?? ""} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!activeQ && (
        <div className="dr-demo-ask-ai-prompt">
          Ask anything. Dilly answers without revealing who this is.
        </div>
      )}
    </div>
  );
}

// ─── Blind card (collapsed, in ranking list) ──────────────────────────────────

function BlindCard({
  candidate,
  rank,
  revealed,
  onExpand,
  expanded,
}: {
  candidate: BlindCandidate;
  rank: number;
  revealed: boolean;
  onExpand: () => void;
  expanded: boolean;
}) {
  const initials = candidate.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  return (
    <motion.div
      layout
      className={`dr-blind-card ${revealed ? "dr-blind-card--revealed" : ""} ${expanded ? "dr-blind-card--expanded" : ""}`}
    >
      {/* Card header — always visible */}
      <div className="dr-blind-card-header" onClick={onExpand} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && onExpand()}>
        <div className="dr-blind-card-rank">
          {revealed ? (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              #{rank}
            </motion.span>
          ) : (
            <span className="dr-blind-rank-drag" aria-label="Drag to reorder">
              &#8942;&#8942;
            </span>
          )}
        </div>

        <div className="dr-blind-card-avatar-wrap">
          <AnimatePresence mode="wait">
            {revealed ? (
              <motion.div
                key="reveal"
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <RevealAvatar initials={initials} tier={candidate.school_tier} size={44} />
              </motion.div>
            ) : (
              <motion.div key="anon" exit={{ rotateY: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                <AnonAvatar size={44} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="dr-blind-card-identity">
          <AnimatePresence mode="wait">
            {revealed ? (
              <motion.div
                key="name"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <div className="dr-blind-revealed-name">{candidate.name}</div>
                <div className="dr-blind-revealed-school">{candidate.school}</div>
              </motion.div>
            ) : (
              <motion.div key="hidden" className="dr-blind-hidden-identity">
                <div className="dr-blind-hidden-name" aria-label="Name hidden" />
                <div className="dr-blind-hidden-school" aria-label="School hidden" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="dr-blind-card-fit">
          <span className={`dr-fit-badge ${fitColorCls(candidate.fit_level)}`}>
            <span className={`dr-fit-dot ${fitDotCls(candidate.fit_level)}`} />
            {candidate.fit_level}
          </span>
        </div>

        <div className="dr-blind-card-expand-btn" aria-label={expanded ? "Collapse" : "Expand"}>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </motion.div>
        </div>
      </div>

      {/* Reveal line */}
      <AnimatePresence>
        {revealed && (
          <motion.div
            className={`dr-blind-reveal-line ${candidate.filtered_out ? "dr-blind-reveal-line--warning" : "dr-blind-reveal-line--neutral"}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            {candidate.filtered_out && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
            {candidate.reveal_line}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded profile */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="dr-blind-card-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {/* Dilly's Take */}
            <blockquote className="dr-dilly-take" style={{ margin: "1rem 0 0" }}>
              <span className="dr-dilly-take-eyebrow">Dilly&apos;s Take</span>
              <p>{candidate.dilly_take}</p>
            </blockquote>

            <div className="dr-profile-columns" style={{ marginTop: "1.25rem" }}>
              <div className="dr-profile-col-left">
                {/* What Dilly knows */}
                <section className="dr-profile-section">
                  <h3 className="dr-section-heading dr-section-heading--indigo" style={{ fontSize: "0.8rem" }}>
                    What Dilly knows — from conversations, not the resume
                  </h3>
                  <ul className="dr-profile-facts">
                    {candidate.profile_facts.map((f, i) => (
                      <li key={i} className="dr-profile-fact">{f}</li>
                    ))}
                  </ul>
                </section>

                {/* JD Evidence Map */}
                <section className="dr-profile-section">
                  <h3 className="dr-section-heading dr-section-heading--indigo" style={{ fontSize: "0.8rem" }}>
                    How they map to the role
                  </h3>
                  <div className="dr-evidence-map">
                    {candidate.jd_evidence.map((item, i) => (
                      <div key={i} className="dr-evidence-row">
                        <div className="dr-evidence-req-row">
                          <span className={`dr-evidence-status-icon ${evidenceIconCls(item.status)}`}>
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

              <div className="dr-profile-col-right">
                {/* Experience */}
                <section className="dr-profile-section">
                  <h3 className="dr-section-heading dr-section-heading--indigo" style={{ fontSize: "0.8rem" }}>
                    Experience
                  </h3>
                  <div className="dr-experience-list">
                    {candidate.experience.map((exp, i) => (
                      <div key={i} className="dr-exp-entry">
                        <div className="dr-exp-header">
                          <div className="dr-exp-title-block">
                            <span className="dr-exp-role">{exp.role}</span>
                            <span className="dr-exp-company">{exp.company}</span>
                          </div>
                          <span className="dr-exp-date">{exp.date}</span>
                        </div>
                        <ul className="dr-exp-bullets">
                          {exp.bullets.map((b, j) => (
                            <li key={j}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Ask Dilly */}
                <section className="dr-profile-section">
                  <AskDillyBlind candidate={candidate} />
                </section>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Stage = "intro" | "searching" | "ranking" | "revealing" | "revealed";

export default function BlindAuditionPage() {
  const [stage, setStage] = useState<Stage>("intro");
  const [order, setOrder] = useState(BLIND_CANDIDATES.map((c) => c.id));
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const revealTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const orderedCandidates = order
    .map((id) => BLIND_CANDIDATES.find((c) => c.id === id)!)
    .filter(Boolean);

  const allRevealed = revealedIds.size === BLIND_CANDIDATES.length;

  const handleSearch = () => {
    setStage("searching");
    setTimeout(() => setStage("ranking"), 2000);
  };

  const handleReveal = () => {
    setStage("revealing");
    // Stagger reveals — dramatic pause between each
    orderedCandidates.forEach((c, i) => {
      const t = setTimeout(() => {
        setRevealedIds((prev) => new Set([...prev, c.id]));
        // Auto-expand each card as it reveals
        setExpandedId(c.id);
        if (i === orderedCandidates.length - 1) {
          setTimeout(() => setStage("revealed"), 600);
        }
      }, i * 2200); // 2.2s between each reveal — the pause is everything
      revealTimeouts.current.push(t);
    });
  };

  const handleReset = () => {
    revealTimeouts.current.forEach(clearTimeout);
    revealTimeouts.current = [];
    setStage("intro");
    setOrder(BLIND_CANDIDATES.map((c) => c.id));
    setRevealedIds(new Set());
    setExpandedId(null);
  };

  return (
    <div className="dr-page">
      {/* ── Top banner ── */}
      <div className="dr-blind-top-banner">
        <span className="dr-blind-top-banner-dot" />
        The Blind Audition — evaluate candidates before you know who they are
        <Link href="/recruiter/about" className="dr-demo-banner-link" style={{ marginLeft: "auto" }}>
          About Dilly
        </Link>
      </div>

      {/* ── Intro / search ── */}
      {(stage === "intro" || stage === "searching") && (
        <motion.div
          className="dr-blind-intro"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="dr-blind-intro-eyebrow">The Blind Audition</div>
          <h1 className="dr-blind-intro-headline">
            Read the work.<br />Not the resume.
          </h1>
          <p className="dr-blind-intro-sub">
            Three candidates applied for this role. Their names, schools, and locations are hidden.
            Read what they built. Read what Dilly knows about them. Rank them.
            Then hit Reveal — and see who you actually chose.
          </p>

          <div className="dr-blind-role-box">
            <div className="dr-blind-role-label">The role</div>
            <pre className="dr-blind-role-text">{BLIND_ROLE}</pre>
          </div>

          <button
            className="dr-blind-search-btn"
            onClick={handleSearch}
            disabled={stage === "searching"}
          >
            {stage === "searching" ? (
              <span className="dr-blind-searching">
                <span className="dr-blind-searching-dot" />
                Dilly is reading the profiles…
              </span>
            ) : (
              "Start the Blind Audition"
            )}
          </button>

          <p className="dr-blind-intro-hint">
            No names. No schools. No locations. Just the work.
          </p>
        </motion.div>
      )}

      {/* ── Ranking stage ── */}
      {(stage === "ranking" || stage === "revealing" || stage === "revealed") && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Header */}
          <div className="dr-blind-ranking-header">
            <div>
              <h2 className="dr-blind-ranking-title">
                {stage === "ranking"
                  ? "Rank the candidates"
                  : stage === "revealing"
                  ? "Revealing…"
                  : "The Reveal"}
              </h2>
              <p className="dr-blind-ranking-sub">
                {stage === "ranking"
                  ? "Expand each candidate to read their full profile. Drag to reorder by your preference. When you're ready, hit Reveal."
                  : stage === "revealing"
                  ? "Seeing who you actually chose."
                  : "This is who was behind the profiles you ranked."}
              </p>
            </div>
            {stage === "revealed" && (
              <button className="dr-blind-reset-btn" onClick={handleReset}>
                Run again
              </button>
            )}
          </div>

          {/* Candidate list */}
          {stage === "ranking" ? (
            <Reorder.Group
              axis="y"
              values={order}
              onReorder={setOrder}
              className="dr-blind-list"
              as="div"
            >
              {orderedCandidates.map((c, i) => (
                <Reorder.Item key={c.id} value={c.id} as="div" style={{ listStyle: "none" }}>
                  <BlindCard
                    candidate={c}
                    rank={i + 1}
                    revealed={false}
                    onExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    expanded={expandedId === c.id}
                  />
                </Reorder.Item>
              ))}
            </Reorder.Group>
          ) : (
            <div className="dr-blind-list">
              {orderedCandidates.map((c, i) => (
                <BlindCard
                  key={c.id}
                  candidate={c}
                  rank={i + 1}
                  revealed={revealedIds.has(c.id)}
                  onExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  expanded={expandedId === c.id}
                />
              ))}
            </div>
          )}

          {/* Reveal button */}
          {stage === "ranking" && (
            <div className="dr-blind-reveal-bar">
              <p className="dr-blind-reveal-bar-hint">
                Read each profile. When you have a ranking, hit Reveal.
              </p>
              <button className="dr-blind-reveal-btn" onClick={handleReveal}>
                Reveal candidates
              </button>
            </div>
          )}

          {/* Post-reveal summary */}
          {stage === "revealed" && (
            <motion.div
              className="dr-blind-summary"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="dr-blind-summary-inner">
                <div className="dr-blind-summary-headline">
                  Your #1 ranked candidate went to{" "}
                  <strong>{orderedCandidates[0].school}</strong>.
                </div>
                {orderedCandidates[0].filtered_out && (
                  <p className="dr-blind-summary-body">
                    In a traditional ATS filtered to target schools, you never would have seen them.
                    Dilly made sure you did.
                  </p>
                )}
                <div className="dr-blind-summary-ctas">
                  <Link href="/recruiter" className="dr-about-cta-primary">
                    Open Dilly Recruiter
                  </Link>
                  <button className="dr-about-cta-secondary" onClick={handleReset}>
                    Run again
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
