"use client";

/**
 * Dilly Recruiter — Competition/About Page
 *
 * Competition-facing narrative page. Tells judges exactly what Dilly is,
 * why it's different, and how to try it. No fluff, no scores.
 *
 * Route: /recruiter/about
 */

import { motion } from "framer-motion";
import Link from "next/link";

// ─── Animation helpers ────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09 } },
};

// ─── Comparison data ──────────────────────────────────────────────────────────

const comparisons = [
  {
    old: "Resume scanner with keyword matching",
    dilly: "Reads the full profile — Dilly conversations, work history, decisions, values",
  },
  {
    old: "Opaque scores (Smart: 87, Grit: 72, Build: 90)",
    dilly: "Fit narrative: why this person fits this role, in plain language",
  },
  {
    old: "Static snapshots — a resume from 6 months ago",
    dilly: "Living profile — grows every time the candidate talks to Dilly",
  },
  {
    old: "Every candidate gets the same view",
    dilly: "Every search re-renders the candidate through the lens of that specific role",
  },
  {
    old: "Rank by score, move on",
    dilly: "JD Evidence Map — requirement by requirement, green/yellow/red, with actual evidence",
  },
];

// ─── How it works steps ───────────────────────────────────────────────────────

const steps = [
  {
    num: "01",
    title: "Candidates build living profiles",
    body: "Students and early-career professionals talk to Dilly — not just upload a resume. Every conversation adds depth: a project decision, a tough call, a lesson. The profile gets richer over time.",
  },
  {
    num: "02",
    title: "Recruiters describe the role",
    body: "Paste a job description, write a sentence, or just type a title. Dilly extracts what the role actually needs — must-haves, nice-to-haves, and the context behind the requirements.",
  },
  {
    num: "03",
    title: "Dilly renders fit, not a score",
    body: "Each candidate is re-evaluated through the lens of that specific role. Not a static ranking — a role-specific fit narrative, a JD Evidence Map, and a direct answer: why does this person belong here?",
  },
  {
    num: "04",
    title: "You see the person, not the paper",
    body: "Ask Dilly anything. The AI has read the full living profile. It can tell you how they handled failure, what they built from scratch, and whether they would thrive in your environment.",
  },
];

// ─── Principle cards ──────────────────────────────────────────────────────────

const principles = [
  {
    heading: "No scores",
    body: "Dilly does not score candidates. There is no number that summarizes a person. Fit narratives, not rankings.",
  },
  {
    heading: "Narrative-first",
    body: "Every result surfaces a Dilly Take — a concise, honest read of whether this person actually fits this role.",
  },
  {
    heading: "Living profiles",
    body: "Candidates keep talking to Dilly after onboarding. Every conversation deepens the profile. Recruiters always see the latest version.",
  },
  {
    heading: "Evidence over assertion",
    body: "The JD Evidence Map shows requirement by requirement what the candidate has demonstrated — not what they claimed.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecruiterAboutPage() {
  return (
    <div className="dr-about-page">

        {/* ── Hero ── */}
        <motion.section
          className="dr-about-hero"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <motion.div className="dr-about-eyebrow" variants={fadeUp}>
            Dilly Recruiter
          </motion.div>
          <motion.h1 className="dr-about-headline" variants={fadeUp}>
            AI hiring that reads people,<br />not resumes.
          </motion.h1>
          <motion.p className="dr-about-subhead" variants={fadeUp}>
            Dilly builds living profiles from real conversations. Recruiters describe a role.
            Dilly renders who fits and why — in plain language, not scores.
          </motion.p>
          <motion.div className="dr-about-hero-ctas" variants={fadeUp}>
            <Link href="/recruiter/demo" className="dr-about-cta-primary">
              Try the demo
            </Link>
            <Link href="/recruiter" className="dr-about-cta-secondary">
              Open Recruiter
            </Link>
          </motion.div>
        </motion.section>

        {/* ── The Problem ── */}
        <motion.section
          className="dr-about-section"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          <motion.p className="dr-about-section-label" variants={fadeUp}>The problem</motion.p>
          <motion.h2 className="dr-about-section-title" variants={fadeUp}>
            Resumes were never the point.
          </motion.h2>
          <motion.p className="dr-about-section-body" variants={fadeUp}>
            Every recruiting tool optimizes the wrong thing. Resume parsers look for keywords.
            ATS platforms rank by field matches. AI copilots summarize the same static document.
            None of them know who the candidate actually is.
          </motion.p>
          <motion.p className="dr-about-section-body" variants={fadeUp}>
            Dilly started from a different premise: the best signal about a person comes from
            how they talk about their own work. Not the bullet points they wrote for job boards.
            The decisions they made. The things they built. The moments they grew.
          </motion.p>
        </motion.section>

        {/* ── Comparison table ── */}
        <motion.section
          className="dr-about-section"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
        >
          <motion.p className="dr-about-section-label" variants={fadeUp}>What's different</motion.p>
          <motion.h2 className="dr-about-section-title" variants={fadeUp}>
            Not another resume scanner.
          </motion.h2>
          <motion.div className="dr-about-compare-table" variants={fadeUp}>
            <div className="dr-about-compare-header">
              <div className="dr-about-compare-col-label dr-about-compare-col-old">
                Every other tool
              </div>
              <div className="dr-about-compare-col-label dr-about-compare-col-dilly">
                Dilly Recruiter
              </div>
            </div>
            {comparisons.map((row, i) => (
              <motion.div
                key={i}
                className="dr-about-compare-row"
                variants={fadeUp}
              >
                <div className="dr-about-compare-cell dr-about-compare-cell--old">
                  <span className="dr-about-compare-x">&#x2715;</span>
                  {row.old}
                </div>
                <div className="dr-about-compare-cell dr-about-compare-cell--dilly">
                  <span className="dr-about-compare-check">&#x2713;</span>
                  {row.dilly}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* ── How it works ── */}
        <motion.section
          className="dr-about-section"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
        >
          <motion.p className="dr-about-section-label" variants={fadeUp}>How it works</motion.p>
          <motion.h2 className="dr-about-section-title" variants={fadeUp}>
            Living profiles meet role-specific rendering.
          </motion.h2>
          <div className="dr-about-steps">
            {steps.map((step, i) => (
              <motion.div key={i} className="dr-about-step" variants={fadeUp}>
                <div className="dr-about-step-num">{step.num}</div>
                <div>
                  <div className="dr-about-step-title">{step.title}</div>
                  <div className="dr-about-step-body">{step.body}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ── Principles ── */}
        <motion.section
          className="dr-about-section"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
        >
          <motion.p className="dr-about-section-label" variants={fadeUp}>What Dilly believes</motion.p>
          <motion.h2 className="dr-about-section-title" variants={fadeUp}>
            The principles behind the product.
          </motion.h2>
          <div className="dr-about-principles">
            {principles.map((p, i) => (
              <motion.div key={i} className="dr-about-principle-card" variants={fadeUp}>
                <div className="dr-about-principle-heading">{p.heading}</div>
                <div className="dr-about-principle-body">{p.body}</div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ── Blind Audition CTA ── */}
        <motion.section
          className="dr-about-section"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
        >
          <motion.p className="dr-about-section-label" variants={fadeUp}>The competition experience</motion.p>
          <motion.h2 className="dr-about-section-title" variants={fadeUp}>
            Try the Blind Audition.
          </motion.h2>
          <motion.p className="dr-about-section-body" variants={fadeUp}>
            Three candidates applied for the same role. Their names, schools, and locations are hidden.
            Read what they built. Read what Dilly knows about them from real conversations.
            Rank them. Then hit Reveal.
          </motion.p>
          <motion.p className="dr-about-section-body" variants={fadeUp}>
            Your #1 ranked candidate went to Florida International University.
            In a traditional ATS filtered to target schools, you never would have seen them.
          </motion.p>
          <motion.div variants={fadeUp} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
            <a
              href="https://www.perplexity.ai/computer/a/dilly-the-blind-audition-409s74OWRIiAPhtTJEyHVw"
              target="_blank"
              rel="noopener noreferrer"
              className="dr-about-cta-primary"
              style={{ display: "inline-flex" }}
            >
              Open standalone demo
            </a>
            <Link href="/recruiter/blind" className="dr-about-cta-secondary" style={{ display: "inline-flex" }}>
              In-app version
            </Link>
          </motion.div>
        </motion.section>

        {/* ── Demo CTA ── */}
        <motion.section
          className="dr-about-cta-section"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }}
          viewport={{ once: true, amount: 0.3 }}
        >
          <div className="dr-about-cta-inner">
            <div className="dr-about-cta-badge">Live demo — no API key required</div>
            <h2 className="dr-about-cta-headline">
              See Dilly read three real candidates.
            </h2>
            <p className="dr-about-cta-body">
              The demo shows a full Dilly Recruiter search for a senior backend infrastructure role.
              Three curated candidates, real Dilly Takes, a JD Evidence Map, and ask-AI — all without
              connecting to a backend.
            </p>
            <Link href="/recruiter/demo" className="dr-about-cta-primary">
              Launch demo
            </Link>
          </div>
        </motion.section>

        {/* ── Footer ── */}
        <footer className="dr-about-footer">
          <p className="dr-about-footer-text">
            Dilly Recruiter is part of{" "}
            <a href="https://hellodilly.com" className="dr-about-footer-link" target="_blank" rel="noopener noreferrer">
              Dilly
            </a>
            {" "}— the platform that builds living profiles from real conversations.
          </p>
        </footer>

    </div>
  );
}
