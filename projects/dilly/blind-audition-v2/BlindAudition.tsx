import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type RolePreset = {
  id: string;
  label: string;
  description: string;
};

type FactItem = {
  label: string;
  value: string;
};

type Candidate = {
  id: string;
  displayName: string;
  revealName: string;
  track: string;
  major: string;
  university: string;
  factCount: number;
  dillyNarrative: string;
  fitLabel: string;
  score: number;
  depthNote: string;
  signalBullets: string[];
  whatDillyKnows: string[];
  achievements: FactItem[];
  projects: FactItem[];
  skills: string[];
  personalitySignals: FactItem[];
  goals: string[];
  lifeContext: string[];
  allFacts: { category: string; label: string; value: string }[];
};

type Stage = "intro" | "role-select" | "ranking" | "reveal";

// ─── Utils ───────────────────────────────────────────────────────────────────

const DEPTH_COLORS = {
  "Strong fit": "text-emerald-600",
  "Solid signal": "text-blue-600",
  "Early profile": "text-amber-600",
};

const DEPTH_BG = {
  "Strong fit": "bg-emerald-50 border-emerald-200 text-emerald-700",
  "Solid signal": "bg-blue-50 border-blue-200 text-blue-700",
  "Early profile": "bg-amber-50 border-amber-200 text-amber-700",
};

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    achievement: "Achievement",
    project_detail: "Project",
    skill_unlisted: "Skill",
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
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-label="Dilly"
      className="w-8 h-8"
    >
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
        Then Dilly shows you what it learned that no resume would ever show.
      </p>

      <button
        onClick={onStart}
        className="bg-zinc-900 text-white text-sm font-semibold px-7 py-3.5 rounded-xl hover:bg-zinc-700 transition-colors"
        data-testid="button-start"
      >
        See the candidates
      </button>

      <p className="mt-5 text-xs text-zinc-400">
        No AI scoring. No match percentages. Just signal.
      </p>
    </motion.div>
  );
}

// ─── Role Select Screen ───────────────────────────────────────────────────────

function RoleSelectScreen({
  roles,
  onSelectRole,
}: {
  roles: RolePreset[];
  onSelectRole: (role: RolePreset) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customJD, setCustomJD] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const handleContinue = () => {
    if (showCustom && customJD.trim()) {
      onSelectRole({
        id: "custom",
        label: "Custom Role",
        description: customJD.trim(),
      });
    } else if (selectedId) {
      const role = roles.find((r) => r.id === selectedId);
      if (role) onSelectRole(role);
    }
  };

  const canContinue = (showCustom && customJD.trim().length > 20) || (!showCustom && selectedId);

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

// ─── Candidate Card (blind) ───────────────────────────────────────────────────

function BlindCard({
  candidate,
  rank,
  onReveal,
  revealed,
}: {
  candidate: Candidate;
  rank: number;
  onReveal: () => void;
  revealed: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const depthColor = DEPTH_COLORS[candidate.fitLabel as keyof typeof DEPTH_COLORS] || "text-zinc-600";
  const depthBg = DEPTH_BG[candidate.fitLabel as keyof typeof DEPTH_BG] || "bg-zinc-50 border-zinc-200 text-zinc-600";

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
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              rank === 0 ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
            }`}>
              {rank + 1}
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-900">
                {candidate.displayName}
              </p>
              <p className="text-xs text-zinc-500">{candidate.track}</p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${depthBg}`}>
            {candidate.fitLabel}
          </span>
        </div>

        {/* Depth indicator */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => {
              const threshold = Math.ceil((candidate.factCount / 20) * 5);
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

        {/* Dilly narrative — the core */}
        <p className="text-sm text-zinc-700 leading-relaxed">
          {candidate.dillyNarrative}
        </p>
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
              {/* What Dilly extracted */}
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
                      No conversations with Dilly yet. Ask them to use the app.
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
      <div className="px-5 pb-5 flex items-center gap-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
          data-testid={`button-expand-${candidate.id}`}
        >
          {expanded ? "Show less" : `See all ${candidate.factCount} facts`}
        </button>

        {!revealed && (
          <button
            onClick={onReveal}
            className="ml-auto text-xs font-semibold text-white bg-zinc-900 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors"
            data-testid={`button-reveal-${candidate.id}`}
          >
            Reveal identity
          </button>
        )}

        {revealed && (
          <div className="ml-auto flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-semibold text-emerald-600">Revealed</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Reveal Card ─────────────────────────────────────────────────────────────

function RevealCard({ candidate, rank }: { candidate: Candidate; rank: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: rank * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="bg-zinc-900 text-white rounded-2xl overflow-hidden"
    >
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {rank + 1}
          </div>
          <p className="text-base font-bold text-white">{candidate.revealName}</p>
        </div>
        <p className="text-sm text-zinc-400 mb-3">{candidate.major} — {candidate.university}</p>

        <div className="bg-white/5 rounded-xl px-4 py-3 mb-4">
          <p className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-widest">
            Dilly's read
          </p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {candidate.dillyNarrative}
          </p>
        </div>

        <div className="border-t border-white/10 pt-4">
          <p className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-widest">
            {candidate.factCount} facts from {candidate.factCount === 0 ? "0" : "real"} conversations
          </p>
          {candidate.factCount === 0 ? (
            <p className="text-sm text-zinc-500 italic">
              No profile yet. They have not used Dilly enough to build signal.
            </p>
          ) : (
            <div className="space-y-1.5">
              {candidate.allFacts.slice(0, 5).map((f, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-xs text-zinc-600 pt-0.5 flex-shrink-0 w-16">{categoryLabel(f.category)}</span>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    <span className="text-zinc-300 font-medium">{f.label}:</span> {f.value}
                  </p>
                </div>
              ))}
              {candidate.allFacts.length > 5 && (
                <p className="text-xs text-zinc-600 pt-1">
                  + {candidate.allFacts.length - 5} more facts in their profile
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="bg-zinc-800 rounded-xl px-4 py-3 border border-white/10">
          <p className="text-xs font-semibold text-zinc-500 mb-1">The point</p>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Dilly learned this from a conversation. Not a resume. Not a transcript. Not a GPA.
            A recruiter who only sees the resume sees nothing.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Ranking Screen ───────────────────────────────────────────────────────────

function RankingScreen({
  candidates,
  roleLabel,
  onRevealAll,
}: {
  candidates: Candidate[];
  roleLabel: string;
  onRevealAll: () => void;
}) {
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const reveal = (id: string) => {
    setRevealedIds((prev) => new Set([...prev, id]));
  };

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
          Names hidden. Profiles built from real conversations. Reveal when you are ready.
        </p>

        <div className="space-y-4 mb-8">
          {candidates.map((candidate, i) => (
            <BlindCard
              key={candidate.id}
              candidate={candidate}
              rank={i}
              onReveal={() => reveal(candidate.id)}
              revealed={revealedIds.has(candidate.id)}
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

        {allRevealed && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-5"
          >
            <p className="text-sm font-semibold text-zinc-900 mb-1">
              All three revealed.
            </p>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Dilly built these profiles from conversations, not documents.
              The ranking above is based on what people actually said to an AI, not what they put on a resume.
              This is what hiring looks like when prestige is removed from the equation.
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Full Reveal Screen ───────────────────────────────────────────────────────

function RevealScreen({
  candidates,
  roleLabel,
  onReset,
}: {
  candidates: Candidate[];
  roleLabel: string;
  onReset: () => void;
}) {
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
        <h2 className="text-xl font-bold text-zinc-900 mt-4 mb-1">The full picture</h2>
        <p className="text-sm text-zinc-500 mb-8">
          Here is what Dilly knows about each candidate, built entirely from conversations.
        </p>

        <div className="space-y-4 mb-8">
          {candidates.map((candidate, i) => (
            <RevealCard key={candidate.id} candidate={candidate} rank={i} />
          ))}
        </div>

        <div className="bg-zinc-900 text-white rounded-2xl px-5 py-5 mb-6">
          <p className="text-sm font-semibold mb-2">What this means for recruiting</p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Every ATS ever built filters on the resume. School. GPA. Keywords.
            The candidates who get through are not the best candidates.
            They are the best documenters of themselves on paper.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed mt-3">
            Dilly learns from how people think and what they have actually built.
            The depth you see here is what a conversation reveals.
            A resume would have shown you none of this.
          </p>
        </div>

        <button
          onClick={onReset}
          className="w-full py-3 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 transition-colors"
          data-testid="button-reset"
        >
          Start over with a different role
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function BlindAudition() {
  const [stage, setStage] = useState<Stage>("intro");
  const [selectedRole, setSelectedRole] = useState<RolePreset | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showFullReveal, setShowFullReveal] = useState(false);

  const { data: rolesData } = useQuery<{ roles: RolePreset[] }>({
    queryKey: ["/api/blind-audition/roles"],
  });

  const searchMutation = useMutation({
    mutationFn: (roleDescription: string) =>
      apiRequest("POST", "/api/blind-audition/search", {
        role_description: roleDescription,
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setCandidates(data.candidates || []);
      setStage("ranking");
    },
  });

  const handleRoleSelect = (role: RolePreset) => {
    setSelectedRole(role);
    searchMutation.mutate(role.description);
  };

  const handleRevealAll = () => {
    setShowFullReveal(true);
    setStage("reveal");
  };

  const handleReset = () => {
    setStage("role-select");
    setSelectedRole(null);
    setCandidates([]);
    setShowFullReveal(false);
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <AnimatePresence mode="wait">
        {stage === "intro" && (
          <motion.div key="intro" exit={{ opacity: 0 }}>
            <IntroScreen onStart={() => setStage("role-select")} />
          </motion.div>
        )}

        {stage === "role-select" && (
          <motion.div key="role-select" exit={{ opacity: 0 }}>
            <RoleSelectScreen
              roles={rolesData?.roles || []}
              onSelectRole={handleRoleSelect}
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
                onRevealAll={handleRevealAll}
              />
            )}
          </motion.div>
        )}

        {stage === "reveal" && (
          <motion.div key="reveal" exit={{ opacity: 0 }}>
            <RevealScreen
              candidates={candidates}
              roleLabel={selectedRole?.label || ""}
              onReset={handleReset}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
