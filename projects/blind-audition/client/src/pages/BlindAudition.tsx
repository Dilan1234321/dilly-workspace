import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type RolePreset = {
  id: string;
  label: string;
  description: string;
};

type Candidate = {
  id: string;
  email: string;
  displayName: string;
  revealName: string;
  track: string;
  major: string;
  factCount: number;
  dillyNarrative: string;
  fitLabel: string;
  score: number;
  depthNote: string;
  achievements: { label: string; value: string }[];
  projects: { label: string; value: string }[];
  skills: string[];
  allFacts: { category: string; label: string; value: string }[];
};

type RecruiterInfo = {
  name: string;
  company: string;
  email: string;
};

type UnlockResult = {
  candidate: { name: string; email: string; major: string; track: string };
  intro_message: string;
};

type Stage = "intro" | "recruiter-setup" | "role-select" | "ranking" | "reveal";

// ─── Static role fallbacks ────────────────────────────────────────────────────
const STATIC_ROLES: RolePreset[] = [
  {
    id: "fullstack-startup",
    label: "Full-Stack Engineer at an Early-Stage Startup",
    description:
      "Full-Stack Engineer — Early Stage Startup\n\nWe need someone who can ship, not someone who needs hand-holding.\n- Has built real things in production\n- TypeScript, React, Python or similar\n- Works independently without a defined spec\n- Bias toward action and finishing\n- Bonus: freelance, client work, or side projects with real results",
  },
  {
    id: "data-analyst",
    label: "Data Analyst — Business Intelligence",
    description:
      "Data Analyst — Business Intelligence\n\nWe need someone who finds the story in raw data.\n- Python or SQL for analysis\n- Experience with real datasets and predictive modeling\n- Can explain findings to non-technical stakeholders\n- Curious-first mindset\n- Bonus: regression, ML, or visualization work",
  },
  {
    id: "software-engineer",
    label: "Software Engineer — Systems & Backend",
    description:
      "Software Engineer — Systems and Backend\n\nWe build infrastructure that matters.\n- Low-level systems: memory management, performance\n- C, C++, Rust, Go, or similar\n- Understands trade-offs between abstraction and control\n- Curious about how things actually work",
  },
  {
    id: "founding-generalist",
    label: "Founding Team Member — Generalist",
    description:
      "Founding Team Member — Generalist\n\nBuilding from zero. No defined role.\n- Has built something from scratch without resources\n- Multiple hats: product, engineering, ops, sales\n- Track record of finishing things, not just starting them\n- Bonus: led people, built community, or dealt with real adversity",
  },
];

// ─── Utils ────────────────────────────────────────────────────────────────────

const DEPTH_BG: Record<string, string> = {
  "Strong fit": "bg-emerald-50 border-emerald-200 text-emerald-700",
  "Solid signal": "bg-blue-50 border-blue-200 text-blue-700",
  "Early profile": "bg-amber-50 border-amber-200 text-amber-700",
  "No profile yet": "bg-zinc-100 border-zinc-200 text-zinc-500",
};

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    achievement: "Achievement",
    project_detail: "Project",
    project: "Project",
    skill_unlisted: "Skill",
    skill: "Skill",
    personality: "Personality",
    strength: "Strength",
    soft_skill: "Soft skill",
    motivation: "Motivation",
    goal: "Goal",
    life_context: "Background",
    challenge: "Challenge",
    hobby: "Hobby",
  };
  return map[cat] || cat;
}

// ─── Dilly Logo ───────────────────────────────────────────────────────────────

function DillyLogo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-label="Dilly" className="w-8 h-8">
      <rect width="48" height="48" rx="12" fill="#18181B" />
      <circle cx="24" cy="20" r="7" fill="white" />
      <rect x="12" y="32" width="24" height="3" rx="1.5" fill="white" opacity="0.4" />
      <rect x="16" y="37" width="16" height="3" rx="1.5" fill="white" opacity="0.25" />
    </svg>
  );
}

// ─── Intro Screen ─────────────────────────────────────────────────────────────

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen px-6 text-center"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="mb-8">
        <DillyLogo />
      </div>

      <h1 className="text-3xl font-bold text-zinc-900 tracking-tight mb-4 max-w-lg">
        The Blind Audition
      </h1>

      <p className="text-base text-zinc-500 max-w-md leading-relaxed mb-4">
        Three real candidates. Actual students who used Dilly.
        Their profiles were built by talking to an AI, not uploading a resume.
      </p>

      <p className="text-sm text-zinc-400 max-w-sm leading-relaxed mb-10">
        You see what the conversations revealed. Names hidden until you decide.
        When you find someone worth reaching out to, Dilly drafts the intro.
      </p>

      <button
        onClick={onStart}
        className="bg-zinc-900 text-white text-sm font-semibold px-7 py-3.5 rounded-xl hover:bg-zinc-700 transition-colors"
        data-testid="button-start"
      >
        Get started
      </button>

      <p className="mt-5 text-xs text-zinc-400">
        No AI scoring. No match percentages. Just signal.
      </p>
    </motion.div>
  );
}

// ─── Recruiter Setup Screen ───────────────────────────────────────────────────

function RecruiterSetupScreen({
  onComplete,
}: {
  onComplete: (info: RecruiterInfo) => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");

  const canContinue = name.trim().length > 1 && company.trim().length > 1;

  return (
    <motion.div
      className="min-h-screen px-6 py-14"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="max-w-md mx-auto">
        <div className="mb-2">
          <DillyLogo />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 mt-4 mb-1">
          Who are you hiring for?
        </h2>
        <p className="text-sm text-zinc-500 mb-8">
          Two fields. So Dilly can draft the right intro if you find someone worth reaching out to.
        </p>

        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Chen"
              className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              data-testid="input-recruiter-name"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
              Company
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Corp"
              className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              data-testid="input-recruiter-company"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1.5">
              Your email <span className="text-zinc-400 font-normal normal-case">(optional — saved with your interests)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@acme.com"
              className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              data-testid="input-recruiter-email"
            />
          </div>
        </div>

        <button
          onClick={() =>
            onComplete({ name: name.trim(), company: company.trim(), email: email.trim() })
          }
          disabled={!canContinue}
          data-testid="button-recruiter-continue"
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${
            canContinue
              ? "bg-zinc-900 text-white hover:bg-zinc-700"
              : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
          }`}
        >
          See the candidates
        </button>
      </div>
    </motion.div>
  );
}

// ─── Role Select Screen ───────────────────────────────────────────────────────

function RoleSelectScreen({
  roles,
  onSelectRole,
  error,
}: {
  roles: RolePreset[];
  onSelectRole: (role: RolePreset) => void;
  error?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customJD, setCustomJD] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const handleContinue = () => {
    if (showCustom && customJD.trim()) {
      onSelectRole({ id: "custom", label: "Custom Role", description: customJD.trim() });
    } else if (selectedId) {
      const role = roles.find((r) => r.id === selectedId);
      if (role) onSelectRole(role);
    }
  };

  const canContinue =
    (showCustom && customJD.trim().length > 20) || (!showCustom && selectedId);

  return (
    <motion.div
      className="min-h-screen px-6 py-14"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-2">
          <DillyLogo />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 mt-4 mb-1">
          What role are you hiring for?
        </h2>
        <p className="text-sm text-zinc-500 mb-8">
          Pick one to see how these three candidates rank. Or paste your own job description.
        </p>

        {!showCustom && (
          <div className="space-y-3 mb-6">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedId(role.id)}
                data-testid={`button-role-${role.id}`}
                className={`w-full text-left px-4 py-4 rounded-xl border text-sm font-medium transition-all ${
                  selectedId === role.id
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                }`}
              >
                {role.label}
              </button>
            ))}
          </div>
        )}

        {showCustom && (
          <textarea
            className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none mb-6"
            rows={8}
            placeholder="Paste a job description here..."
            value={customJD}
            onChange={(e) => setCustomJD(e.target.value)}
            data-testid="input-custom-jd"
            autoFocus
          />
        )}

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error} Try again or check your connection.
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            data-testid="button-continue-role"
            className={`px-6 py-3 rounded-xl text-sm font-semibold transition-colors ${
              canContinue
                ? "bg-zinc-900 text-white hover:bg-zinc-700"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            }`}
          >
            See candidates
          </button>
          <button
            onClick={() => {
              setShowCustom(!showCustom);
              setSelectedId(null);
            }}
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            data-testid="button-toggle-custom"
          >
            {showCustom ? "Use a preset role" : "Paste my own JD"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Interest Modal ───────────────────────────────────────────────────────────

function InterestModal({
  candidate,
  recruiter,
  roleLabel,
  roleDescription,
  onClose,
}: {
  candidate: Candidate;
  recruiter: RecruiterInfo;
  roleLabel: string;
  roleDescription: string;
  onClose: (didUnlock: boolean) => void;
}) {
  const [unlockResult, setUnlockResult] = useState<UnlockResult | null>(null);
  const [copied, setCopied] = useState(false);

  const interestMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/blind-audition/interest", {
        recruiter_name: recruiter.name,
        recruiter_company: recruiter.company,
        recruiter_email: recruiter.email || null,
        candidate_email: candidate.email,
        candidate_display_name: candidate.displayName,
        role_label: roleLabel,
        role_description: roleDescription,
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setUnlockResult(data);
    },
  });

  const handleCopyIntro = () => {
    if (unlockResult?.intro_message) {
      navigator.clipboard.writeText(unlockResult.intro_message).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose(false)} />

      {/* Modal */}
      <motion.div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {!unlockResult && !interestMutation.isPending && (
          <div className="px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-700">
                {candidate.displayName.slice(-1)}
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">{candidate.displayName}</p>
                <p className="text-xs text-zinc-500">{candidate.fitLabel} for {roleLabel}</p>
              </div>
            </div>

            <p className="text-sm text-zinc-700 leading-relaxed mb-5">
              Dilly will unlock this candidate's contact info and draft an intro message
              tailored to their profile. The candidate will know you found them through Dilly.
            </p>

            <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 mb-5 text-xs text-zinc-600 leading-relaxed">
              <span className="font-semibold text-zinc-800">From:</span> {recruiter.name}, {recruiter.company}
            </div>

            {interestMutation.isError && (
              <p className="text-xs text-red-600 mb-4">
                Something went wrong. Please try again.
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => interestMutation.mutate()}
                className="flex-1 bg-zinc-900 text-white text-sm font-semibold py-3 rounded-xl hover:bg-zinc-700 transition-colors"
                data-testid="button-confirm-interest"
              >
                Unlock contact info
              </button>
              <button
                onClick={() => onClose(false)}
                className="px-5 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                data-testid="button-cancel-interest"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {interestMutation.isPending && (
          <div className="px-6 py-10 flex flex-col items-center gap-4">
            <div className="w-7 h-7 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-zinc-500">Dilly is drafting your intro...</p>
          </div>
        )}

        {unlockResult && (
          <div className="px-6 py-6">
            {/* Success header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-zinc-900">Contact unlocked</p>
            </div>

            {/* Candidate info */}
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                Candidate
              </p>
              <p className="text-sm font-semibold text-zinc-900">{unlockResult.candidate.name}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{unlockResult.candidate.email}</p>
              {unlockResult.candidate.major && (
                <p className="text-xs text-zinc-400 mt-0.5">{unlockResult.candidate.major}</p>
              )}
            </div>

            {/* Intro message */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                Dilly's intro draft
              </p>
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 max-h-52 overflow-y-auto">
                <pre className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed font-sans">
                  {unlockResult.intro_message}
                </pre>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCopyIntro}
                className="flex-1 bg-zinc-900 text-white text-sm font-semibold py-3 rounded-xl hover:bg-zinc-700 transition-colors"
                data-testid="button-copy-intro"
              >
                {copied ? "Copied" : "Copy intro"}
              </button>
              <button
                onClick={() => onClose(true)}
                className="px-5 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                data-testid="button-close-modal"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Candidate Card (blind) ───────────────────────────────────────────────────

function BlindCard({
  candidate,
  rank,
  onReveal,
  revealed,
  onInterest,
  interestExpressed,
}: {
  candidate: Candidate;
  rank: number;
  onReveal: () => void;
  revealed: boolean;
  onInterest: () => void;
  interestExpressed: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const depthBg =
    DEPTH_BG[candidate.fitLabel as keyof typeof DEPTH_BG] ||
    "bg-zinc-100 border-zinc-200 text-zinc-500";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`bg-white border rounded-2xl overflow-hidden transition-shadow ${
        rank === 0 ? "border-zinc-900 shadow-sm" : "border-zinc-200"
      }`}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                rank === 0 ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {rank + 1}
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-900">
                {revealed ? candidate.revealName : candidate.displayName}
              </p>
              <p className="text-xs text-zinc-500">{candidate.track || candidate.major || "Student"}</p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${depthBg}`}>
            {candidate.fitLabel}
          </span>
        </div>

        {/* Profile depth bar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => {
              const threshold = Math.min(Math.ceil((candidate.factCount / 20) * 5), 5);
              return (
                <div
                  key={i}
                  className={`h-1.5 w-5 rounded-full ${
                    i < threshold ? "bg-zinc-900" : "bg-zinc-200"
                  }`}
                />
              );
            })}
          </div>
          <span className="text-xs text-zinc-500">{candidate.depthNote}</span>
        </div>

        {/* Dilly narrative */}
        <p className="text-sm text-zinc-700 leading-relaxed">{candidate.dillyNarrative}</p>
      </div>

      {/* Expandable facts */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-zinc-100"
          >
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
                  What Dilly learned from conversations
                </p>
                <div className="space-y-2">
                  {candidate.allFacts.slice(0, 8).map((fact, i) => (
                    <div key={i} className="flex gap-2.5">
                      <span className="text-xs font-medium text-zinc-400 pt-0.5 flex-shrink-0 w-20">
                        {categoryLabel(fact.category)}
                      </span>
                      <p className="text-xs text-zinc-700 leading-relaxed">
                        <span className="font-medium text-zinc-800">{fact.label}:</span>{" "}
                        {fact.value}
                      </p>
                    </div>
                  ))}
                  {candidate.factCount === 0 && (
                    <p className="text-xs text-zinc-400 italic">
                      No conversations with Dilly yet.
                    </p>
                  )}
                </div>
              </div>

              {candidate.skills.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
                    Skills mentioned in conversation
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.skills.map((s, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-0.5 bg-zinc-100 text-zinc-600 rounded-full font-medium"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer actions */}
      <div className="px-5 pb-5 pt-1 flex items-center gap-3 flex-wrap">
        {candidate.factCount > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
            data-testid={`button-expand-${candidate.id}`}
          >
            {expanded ? "Show less" : `See all ${candidate.factCount} facts`}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Reveal button */}
          {!revealed && (
            <button
              onClick={onReveal}
              className="text-xs font-semibold text-zinc-600 border border-zinc-200 px-3.5 py-1.5 rounded-lg hover:border-zinc-900 hover:text-zinc-900 transition-colors"
              data-testid={`button-reveal-${candidate.id}`}
            >
              Reveal identity
            </button>
          )}

          {revealed && !interestExpressed && (
            <button
              onClick={onInterest}
              className="text-xs font-semibold text-white bg-zinc-900 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
              data-testid={`button-interest-${candidate.id}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              I'm interested
            </button>
          )}

          {interestExpressed && (
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-semibold text-emerald-600">Intro drafted</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Ranking Screen ───────────────────────────────────────────────────────────

function RankingScreen({
  candidates,
  roleLabel,
  roleDescription,
  recruiter,
  onRevealAll,
}: {
  candidates: Candidate[];
  roleLabel: string;
  roleDescription: string;
  recruiter: RecruiterInfo;
  onRevealAll: () => void;
}) {
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());
  const [activeModal, setActiveModal] = useState<Candidate | null>(null);

  const reveal = (id: string) => setRevealedIds((prev) => new Set([...prev, id]));
  const allRevealed = revealedIds.size >= candidates.length;

  return (
    <motion.div
      className="min-h-screen px-5 py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-2">
          <DillyLogo />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 mt-4 mb-1">
          Dilly ranked these three
        </h2>
        <p className="text-sm text-zinc-500 mb-1">
          Role: <span className="font-medium text-zinc-700">{roleLabel}</span>
        </p>
        <p className="text-xs text-zinc-400 mb-8">
          Names hidden. Profiles built from real conversations. Reveal when ready. Express interest to get contact info and a Dilly intro.
        </p>

        <div className="space-y-4 mb-8">
          {candidates.map((candidate, i) => (
            <BlindCard
              key={candidate.id}
              candidate={candidate}
              rank={i}
              onReveal={() => reveal(candidate.id)}
              revealed={revealedIds.has(candidate.id)}
              onInterest={() => setActiveModal(candidate)}
              interestExpressed={interestedIds.has(candidate.id)}
            />
          ))}
        </div>

        {!allRevealed && (
          <button
            onClick={onRevealAll}
            className="w-full py-3.5 border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-700 hover:border-zinc-900 hover:text-zinc-900 transition-colors"
            data-testid="button-reveal-all"
          >
            Reveal all at once
          </button>
        )}

        {allRevealed && interestedIds.size === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-5"
          >
            <p className="text-sm font-semibold text-zinc-900 mb-1">All three revealed.</p>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Dilly built these profiles from conversations, not documents. If someone stood out,
              hit "I'm interested" to get their contact info and a Dilly intro drafted for you.
            </p>
          </motion.div>
        )}

        {interestedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 text-white rounded-2xl px-5 py-5"
          >
            <p className="text-sm font-semibold mb-1">
              {interestedIds.size === 1
                ? "You expressed interest in 1 candidate."
                : `You expressed interest in ${interestedIds.size} candidates.`}
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Dilly drafted the intro. They will know you found them through Dilly.
              This is what the end-to-end recruiter flow looks like when prestige is removed.
            </p>
          </motion.div>
        )}
      </div>

      {/* Interest modal */}
      <AnimatePresence>
        {activeModal && (
          <InterestModal
            candidate={activeModal}
            recruiter={recruiter}
            roleLabel={roleLabel}
            roleDescription={roleDescription}
            onClose={(didUnlock) => {
              if (didUnlock) {
                setInterestedIds((prev) => new Set([...prev, activeModal.id]));
              }
              setActiveModal(null);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function BlindAudition() {
  const [stage, setStage] = useState<Stage>("intro");
  const [recruiter, setRecruiter] = useState<RecruiterInfo | null>(null);
  const [selectedRole, setSelectedRole] = useState<RolePreset | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const { data: rolesData } = useQuery<{ roles: RolePreset[] }>({
    queryKey: ["/api/blind-audition/roles"],
    retry: 1,
  });

  const roles = rolesData?.roles?.length ? rolesData.roles : STATIC_ROLES;

  const searchMutation = useMutation({
    mutationFn: (roleDescription: string) =>
      apiRequest("POST", "/api/blind-audition/search", {
        role_description: roleDescription,
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setSearchError(null);
      setCandidates(data.candidates || []);
      setStage("ranking");
    },
    onError: (err: any) => {
      setSearchError(err?.message || "Could not load candidates. Please try again.");
      setStage("role-select");
    },
  });

  const handleRecruiterComplete = (info: RecruiterInfo) => {
    setRecruiter(info);
    setStage("role-select");
  };

  const handleRoleSelect = (role: RolePreset) => {
    setSelectedRole(role);
    searchMutation.mutate(role.description);
  };

  const handleRevealAll = () => {
    // No-op: reveal-all is handled inside RankingScreen now
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <AnimatePresence mode="wait">
        {stage === "intro" && (
          <motion.div key="intro" exit={{ opacity: 0 }}>
            <IntroScreen onStart={() => setStage("recruiter-setup")} />
          </motion.div>
        )}

        {stage === "recruiter-setup" && (
          <motion.div key="recruiter-setup" exit={{ opacity: 0 }}>
            <RecruiterSetupScreen onComplete={handleRecruiterComplete} />
          </motion.div>
        )}

        {stage === "role-select" && (
          <motion.div key="role-select" exit={{ opacity: 0 }}>
            <RoleSelectScreen
              roles={roles}
              onSelectRole={handleRoleSelect}
              error={searchError}
            />
          </motion.div>
        )}

        {stage === "ranking" && (
          <motion.div key="ranking" exit={{ opacity: 0 }}>
            {searchMutation.isPending ? (
              <div className="flex items-center justify-center min-h-screen">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-zinc-500">Dilly is reading the profiles...</p>
                </div>
              </div>
            ) : (
              <RankingScreen
                candidates={candidates}
                roleLabel={selectedRole?.label || ""}
                roleDescription={selectedRole?.description || ""}
                recruiter={recruiter!}
                onRevealAll={handleRevealAll}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
