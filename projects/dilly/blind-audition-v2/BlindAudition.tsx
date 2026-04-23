import { useState, useRef, useCallback, forwardRef, useEffect } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type FitLevel = "Standout" | "Strong fit" | "Moderate fit";
type EvidenceStatus = "green" | "yellow" | "red";

type RichProfile = {
  headline: string;
  profileSummary: string;
  fitNarrative: string;
  topGap: string;
  evidenceMap: { dimension: string; dimensionFitColor: string; dimensionSummary: string; evidence: { label: string; source: string; confidence: string; relevanceNote: string }[] }[];
  gaps: { description: string; severity: string; riskNote: string; addressable: boolean }[];
  readinessLevel: string;
  readinessLabel: string;
  readinessExplanation: string;
  profileCompleteness: string;
  profileDepthNote: string;
  profileFactCount: number;
  skills: string[];
  targetRoles: string[];
  graduationYear: string;
  fitColor: string;
  fitLabel: string;
};

type Candidate = {
  id: string;
  name: string;
  school: string;
  location: string;
  firstGen: boolean;
  filteredOut: boolean;
  revealLine: string;
  fitLevel: FitLevel;
  dillyTake: string;
  whyFit: string[];
  profileFacts: string[];
  jdEvidence: { req: string; status: EvidenceStatus; evidence: string }[];
  experience: { company: string; role: string; date: string; bullets: string[] }[];
  askAI: Record<string, string>;
  _rich: RichProfile;
};

type Role = {
  id: string;
  label: string;
  description: string;
};

type Stage = "intro" | "searching" | "ranking" | "revealing" | "revealed";

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({ children, color = "gray" }: { children: React.ReactNode; color?: "gray" | "green" | "yellow" | "red" | "indigo" | "blue" }) {
  const colors = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    yellow: "bg-amber-50 text-amber-700 border border-amber-200",
    red: "bg-red-50 text-red-700 border border-red-200",
    indigo: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    blue: "bg-blue-50 text-blue-700 border border-blue-200",
  };
  return <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${colors[color]}`}>{children}</span>;
}

// ─── Evidence dot ─────────────────────────────────────────────────────────────

function EvidenceDot({ status }: { status: EvidenceStatus }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1 ${
      status === "green" ? "bg-emerald-500" : status === "yellow" ? "bg-amber-400" : "bg-red-400"
    }`} />
  );
}

// ─── Living Profile Modal ─────────────────────────────────────────────────────

function LivingProfileModal({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const rich = candidate._rich;
  const [activeTab, setActiveTab] = useState<"fit" | "evidence" | "gaps" | "dilly">("fit");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const tabClass = (tab: typeof activeTab) =>
    `px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${
      activeTab === tab
        ? "bg-indigo-700 text-white shadow-sm"
        : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
    }`;

  const fitColorBadge = rich.fitColor === "green"
    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
    : rich.fitColor === "yellow"
    ? "bg-amber-50 text-amber-700 border border-amber-200"
    : "bg-red-50 text-red-700 border border-red-200";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="bg-white w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${fitColorBadge}`}>
                  {rich.fitLabel}
                </span>
                <span className="text-xs text-gray-400 font-medium">{rich.readinessLabel}</span>
              </div>
              <h2 className="font-display font-black text-gray-900 text-xl tracking-tight">{candidate.name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{candidate.school} · {candidate.location}</p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 flex-wrap">
            <button className={tabClass("fit")} onClick={() => setActiveTab("fit")}>Fit narrative</button>
            <button className={tabClass("evidence")} onClick={() => setActiveTab("evidence")}>Evidence map</button>
            <button className={tabClass("gaps")} onClick={() => setActiveTab("gaps")}>Gaps</button>
            <button className={tabClass("dilly")} onClick={() => setActiveTab("dilly")}>Dilly take</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6">

          {/* FIT TAB */}
          {activeTab === "fit" && (
            <div className="space-y-5">
              <div>
                <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Profile</div>
                <p className="text-sm text-gray-700 leading-relaxed">{rich.headline}</p>
              </div>
              <div>
                <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Why they fit</div>
                <p className="text-sm text-gray-700 leading-relaxed">{rich.fitNarrative}</p>
              </div>
              <div>
                <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Skills</div>
                <div className="flex flex-wrap gap-1.5">
                  {rich.skills.map(s => (
                    <span key={s} className="text-xs font-semibold bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg">{s}</span>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Profile depth</div>
                <p className="text-xs text-gray-600 leading-relaxed">{rich.profileDepthNote}</p>
                <p className="text-xs text-indigo-600 font-semibold mt-1">{rich.profileFactCount} facts on file</p>
              </div>
            </div>
          )}

          {/* EVIDENCE TAB */}
          {activeTab === "evidence" && (
            <div className="space-y-4">
              {rich.evidenceMap.map((dim, i) => (
                <div key={i} className="border border-gray-200 rounded-2xl overflow-hidden">
                  <div className={`px-4 py-3 flex items-center justify-between ${
                    dim.dimensionFitColor === 'green' ? 'bg-emerald-50' :
                    dim.dimensionFitColor === 'yellow' ? 'bg-amber-50' : 'bg-red-50'
                  }`}>
                    <span className="text-sm font-bold text-gray-800">{dim.dimension}</span>
                    <span className={`text-xs font-bold uppercase tracking-wide ${
                      dim.dimensionFitColor === 'green' ? 'text-emerald-600' :
                      dim.dimensionFitColor === 'yellow' ? 'text-amber-600' : 'text-red-500'
                    }`}>
                      {dim.dimensionFitColor === 'green' ? 'Strong' : dim.dimensionFitColor === 'yellow' ? 'Partial' : 'Gap'}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">{dim.dimensionSummary}</p>
                    <div className="space-y-2">
                      {dim.evidence.slice(0, 3).map((e, j) => (
                        <div key={j} className="flex items-start gap-2">
                          <span className={`flex-shrink-0 inline-block w-1.5 h-1.5 rounded-full mt-1.5 ${
                            e.confidence === 'high' ? 'bg-emerald-500' :
                            e.confidence === 'medium' ? 'bg-amber-400' : 'bg-gray-300'
                          }`} />
                          <div>
                            <p className="text-xs font-semibold text-gray-700">{e.label}</p>
                            <p className="text-xs text-gray-400 leading-relaxed">{e.relevanceNote}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* GAPS TAB */}
          {activeTab === "gaps" && (
            <div className="space-y-4">
              {rich.gaps.length === 0 ? (
                <p className="text-sm text-gray-500">No significant gaps identified.</p>
              ) : (
                rich.gaps.map((gap, i) => (
                  <div key={i} className={`border rounded-2xl p-4 ${
                    gap.severity === 'notable' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-800">{gap.description}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold uppercase tracking-wide ${
                          gap.severity === 'notable' ? 'text-amber-600' : 'text-gray-400'
                        }`}>{gap.severity}</span>
                        {gap.addressable && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">Addressable</span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{gap.riskNote}</p>
                  </div>
                ))
              )}
              <div className="border border-indigo-100 bg-indigo-50 rounded-2xl p-4">
                <div className="text-xs font-bold tracking-widest uppercase text-indigo-400 mb-2">Readiness assessment</div>
                <p className="text-sm font-semibold text-indigo-800 mb-1">{rich.readinessLabel}</p>
                <p className="text-xs text-indigo-600 leading-relaxed">{rich.readinessExplanation}</p>
              </div>
            </div>
          )}

          {/* DILLY TAKE TAB */}
          {activeTab === "dilly" && (
            <div className="space-y-5">
              <div className="bg-indigo-900 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-display font-black text-white text-sm">Dilly</span>
                  <span className="text-white/40 text-xs">·</span>
                  <span className="text-white/60 text-xs font-medium">AI recruiter assessment</span>
                </div>
                <p className="text-white/90 text-sm leading-relaxed">{candidate.dillyTake}</p>
              </div>
              <div>
                <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">Ask Dilly</div>
                <div className="space-y-3">
                  {Object.entries(candidate.askAI).map(([q, a]) => (
                    <div key={q} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3">
                        <p className="text-xs font-bold text-gray-700">{q}</p>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-xs text-gray-600 leading-relaxed">{a}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">Living profile · {rich.profileFactCount} facts from real conversations</p>
          <button
            onClick={onClose}
            className="text-sm font-semibold text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Profile Content (blind card body) ────────────────────────────────────────

function ProfileContent({ candidate, blind }: { candidate: Candidate; blind: boolean }) {
  const [askOpen, setAskOpen] = useState<string | null>(null);

  if (blind) {
    return (
      <div className="pt-4 space-y-5">
        {/* Dilly take */}
        <div>
          <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Dilly's read</div>
          <p className="text-sm text-gray-700 leading-relaxed">{candidate.dillyTake}</p>
        </div>

        {/* Why fit */}
        <div>
          <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Why they fit this role</div>
          <ul className="space-y-2">
            {candidate.whyFit.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5">
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* JD evidence */}
        {candidate.jdEvidence.length > 0 && (
          <div>
            <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Role requirements</div>
            <div className="space-y-2">
              {candidate.jdEvidence.map((ev, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <EvidenceDot status={ev.status} />
                  <div>
                    <span className="font-semibold text-gray-800">{ev.req}:</span>{" "}
                    <span className="text-gray-600">{ev.evidence}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ask AI */}
        <div>
          <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Ask Dilly</div>
          <div className="space-y-2">
            {Object.entries(candidate.askAI).map(([q, a]) => (
              <div key={q}>
                <button
                  onClick={() => setAskOpen(prev => prev === q ? null : q)}
                  className="w-full text-left flex items-center justify-between gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-3.5 py-2.5 rounded-xl transition-colors"
                >
                  <span>{q}</span>
                  <svg
                    width="12" height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className={`flex-shrink-0 transition-transform ${askOpen === q ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <AnimatePresence>
                  {askOpen === q && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 py-3 text-xs text-gray-600 leading-relaxed bg-gray-50 border border-gray-200 border-t-0 rounded-b-xl">
                        {a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Revealed state
  return (
    <div className="pt-4 space-y-4">
      <div className="bg-gray-900 rounded-xl p-4">
        <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">Dilly's take</div>
        <p className="text-sm text-gray-200 leading-relaxed">{candidate.dillyTake}</p>
      </div>
      {candidate.profileFacts.slice(0, 3).map((fact, i) => (
        <div key={i} className="text-sm text-gray-600 leading-relaxed pl-3 border-l-2 border-gray-200">
          {fact}
        </div>
      ))}
    </div>
  );
}

// ─── Blind Card ───────────────────────────────────────────────────────────────

const LABEL_COLORS = [
  { bg: "bg-indigo-700", text: "text-white", label: "Candidate A" },
  { bg: "bg-violet-700", text: "text-white", label: "Candidate B" },
  { bg: "bg-slate-700", text: "text-white", label: "Candidate C" },
];

function BlindCard({
  candidate,
  rank,
  revealed,
  expanded,
  onToggle,
  candidateIndex,
  onOpenProfile,
}: {
  candidate: Candidate;
  rank: number;
  revealed: boolean;
  expanded: boolean;
  onToggle: () => void;
  candidateIndex: number;
  onOpenProfile: (c: Candidate) => void;
}) {
  const colorSet = LABEL_COLORS[candidateIndex % LABEL_COLORS.length];

  return (
    <div
      className={`border rounded-2xl bg-white transition-all ${
        expanded ? "border-indigo-200 shadow-md" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
        onClick={onToggle}
      >
        {/* Rank */}
        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-xs font-black text-gray-400">
          #{rank}
        </span>

        {/* Label pill */}
        <span className={`flex-shrink-0 ${colorSet.bg} ${colorSet.text} text-xs font-bold px-3 py-1 rounded-full`}>
          {colorSet.label}
        </span>

        {/* Fit level */}
        <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${
          candidate.fitLevel === "Standout"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : candidate.fitLevel === "Strong fit"
            ? "bg-blue-50 text-blue-700 border-blue-200"
            : "bg-gray-50 text-gray-500 border-gray-200"
        }`}>
          {candidate.fitLevel}
        </span>

        <div className="flex-1 min-w-0" />

        {/* Grip icon (drag handle hint) */}
        <div className="flex-shrink-0 flex flex-col gap-0.5 opacity-30">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-gray-600" />
              <div className="w-1 h-1 rounded-full bg-gray-600" />
            </div>
          ))}
        </div>

        {/* Expand chevron */}
        <svg
          width="16" height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`flex-shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Reveal banner */}
      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            transition={{ duration: 0.4 }}
            className={`overflow-hidden border-t ${
              candidate.filteredOut
                ? "border-amber-200 bg-amber-50"
                : "border-gray-100 bg-gray-50"
            }`}
          >
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                {candidate.filteredOut && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-amber-500 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                )}
                <p className={`text-xs leading-relaxed ${candidate.filteredOut ? "text-amber-800 font-medium" : "text-gray-600"}`}>
                  {candidate.revealLine}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenProfile(candidate); }}
                className="flex-shrink-0 text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap"
              >
                Full profile
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden border-t border-gray-100"
          >
            <div className="px-4 pb-5">
              <ProfileContent candidate={candidate} blind={!revealed} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

const SummaryCard = forwardRef<HTMLDivElement, { ordered: Candidate[]; onReset: () => void; onOpenProfile: (c: Candidate) => void }>(
  function SummaryCard({ ordered, onReset, onOpenProfile }, ref) {
    const [copied, setCopied] = useState(false);
    const top = ordered[0];
    const shareText = top
      ? `I just ran the Blind Audition on Dilly Recruiter. I ranked candidates only on their work. My #1 pick went to ${top.school}${top.filteredOut ? " — a school most ATS systems would have filtered out." : "."} Try it: hellodilly.com`
      : "";

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {}
    };

    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://hellodilly.com")}&summary=${encodeURIComponent(shareText)}`;

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-6 space-y-3"
      >
        {/* Main reveal card */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: "linear-gradient(135deg, #2B3A8E 0%, #1a2660 100%)" }}
        >
          <div className="p-8 text-center">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase text-white/60 bg-white/10 border border-white/20 rounded-full px-3 py-1 mb-5">
              The Reveal
            </div>
            <h3
              className="font-display font-black text-white mb-3 leading-tight"
              style={{ fontSize: "clamp(1.25rem, 4vw, 2rem)", letterSpacing: "-0.02em" }}
            >
              Your #1 ranked candidate went to{" "}
              <span className="underline decoration-white/40 underline-offset-4">
                {top?.school}
              </span>.
            </h3>
            {top?.filteredOut && (
              <p className="text-white/70 text-base leading-relaxed max-w-md mx-auto mb-7">
                In a traditional ATS filtered to target schools, you never would have seen them.
                Dilly made sure you did.
              </p>
            )}

            {/* Ranking recap */}
            <div className="flex items-center justify-center gap-2 flex-wrap mb-7">
              {ordered.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => onOpenProfile(c)}
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-full px-3 py-1 transition-colors"
                >
                  <span className="text-white/50 text-xs font-bold">#{i + 1}</span>
                  <span className="text-white text-xs font-semibold">{c.name}</span>
                  {c.filteredOut && (
                    <span className="text-amber-300 text-xs">(ATS filtered)</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <a
                href="https://hellodilly.com"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-indigo-800 font-bold text-sm px-6 py-3 rounded-xl hover:bg-indigo-50 transition-colors"
              >
                Open Dilly Recruiter
              </a>
              <button
                onClick={onReset}
                className="text-white/80 hover:text-white font-semibold text-sm px-6 py-3 rounded-xl border border-white/25 hover:border-white/50 transition-colors"
              >
                Try another role
              </button>
            </div>
          </div>

          <div className="border-t border-white/10 px-8 py-5">
            <p className="text-center text-xs text-white/50 leading-relaxed">
              Dilly builds living profiles from real conversations. Recruiters see who can do the job, not where they went to school.
            </p>
          </div>
        </div>

        {/* Share card */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            <span className="text-xs font-bold tracking-wider uppercase text-gray-500">Share your result</span>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
            <p className="text-xs text-gray-600 leading-relaxed">{shareText}</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleCopy}
              data-testid="button-copy-share"
              className={`flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border transition-all ${
                copied
                  ? "bg-green-50 border-green-300 text-green-700"
                  : "bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:text-indigo-700"
              }`}
            >
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              )}
              {copied ? "Copied" : "Copy text"}
            </button>

            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-share-twitter"
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.731-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Post on X
            </a>

            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-share-linkedin"
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-blue-600">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              Share on LinkedIn
            </a>
          </div>
        </div>
      </motion.div>
    );
  }
);

// ─── Role Selector ────────────────────────────────────────────────────────────

function RoleSelector({
  roles,
  selectedId,
  onSelect,
  customRole,
  onCustomChange,
}: {
  roles: Role[];
  selectedId: string | null;
  onSelect: (role: Role) => void;
  customRole: string;
  onCustomChange: (v: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="space-y-3">
      <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-1">Choose a role</div>
      <div className="grid grid-cols-1 gap-2">
        {roles.map(role => (
          <button
            key={role.id}
            onClick={() => { setShowCustom(false); onSelect(role); }}
            className={`text-left px-4 py-3 rounded-xl border transition-all ${
              selectedId === role.id && !showCustom
                ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <p className="text-sm font-semibold">{role.label}</p>
          </button>
        ))}
        <button
          onClick={() => setShowCustom(true)}
          className={`text-left px-4 py-3 rounded-xl border transition-all ${
            showCustom
              ? "border-indigo-300 bg-indigo-50 text-indigo-900"
              : "border-dashed border-gray-300 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-700"
          }`}
        >
          <p className="text-sm font-semibold">Paste your own job description</p>
        </button>
      </div>

      <AnimatePresence>
        {showCustom && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <textarea
              className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-indigo-300 resize-none"
              rows={6}
              placeholder="Paste a job description or describe the role you're hiring for..."
              value={customRole}
              onChange={e => onCustomChange(e.target.value)}
              autoFocus
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BlindAudition() {
  const [stage, setStage] = useState<Stage>("intro");
  const [order, setOrder] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [customRole, setCustomRole] = useState("");
  const [profileModal, setProfileModal] = useState<Candidate | null>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Load preset roles from API
  const rolesQuery = useQuery<{ roles: Role[] }>({
    queryKey: ["/api/blind-audition/roles"],
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (roleDescription: string) => {
      const res = await apiRequest("POST", "/api/blind-audition/search", {
        role_description: roleDescription,
      });
      return res.json() as Promise<{ candidates: Candidate[]; role_description: string }>;
    },
    onSuccess: (data) => {
      setCandidates(data.candidates);
      setOrder(data.candidates.map(c => c.id));
      setStage("ranking");
    },
    onError: () => {
      setStage("intro");
    }
  });

  const roles = rolesQuery.data?.roles || [];
  const activeRoleDescription = customRole.trim() || selectedRole?.description || "";

  const ordered = order.map(id => candidates.find(c => c.id === id)!).filter(Boolean);

  const handleStart = () => {
    if (!activeRoleDescription && roles.length > 0) {
      // Auto-select first role if none chosen
      const firstRole = roles[0];
      setSelectedRole(firstRole);
      setStage("searching");
      searchMutation.mutate(firstRole.description);
    } else {
      setStage("searching");
      searchMutation.mutate(activeRoleDescription);
    }
  };

  const handleReveal = () => {
    setStage("revealing");
    ordered.forEach((c, i) => {
      const t = setTimeout(() => {
        setRevealed(prev => new Set([...prev, c.id]));
        setExpanded(c.id);
        if (i === ordered.length - 1) {
          setTimeout(() => {
            setStage("revealed");
            setTimeout(() => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
          }, 800);
        }
      }, i * 2400);
      timeouts.current.push(t);
    });
  };

  const handleReset = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    setStage("intro");
    setOrder([]);
    setCandidates([]);
    setRevealed(new Set());
    setExpanded(null);
    setSelectedRole(null);
    setCustomRole("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const toggleExpanded = (id: string) => setExpanded(prev => prev === id ? null : id);

  const canStart = stage === "intro" && (selectedRole !== null || customRole.trim().length > 10 || roles.length > 0);

  return (
    <div className="min-h-screen bg-white">
      {/* Top nav */}
      <nav className="border-b border-gray-100 bg-white/90 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display font-black text-indigo-900 text-base tracking-tight">Dilly</span>
            <span className="text-gray-300 text-sm">/</span>
            <span className="text-sm font-semibold text-gray-600">The Blind Audition</span>
          </div>
          <div className="flex items-center gap-3">
            {(stage === "ranking" || stage === "revealing" || stage === "revealed") && (
              <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-700 font-semibold transition-colors">
                Change role
              </button>
            )}
            <a href="https://hellodilly.com" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
              hellodilly.com
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">

          {/* ── Intro ── */}
          {(stage === "intro" || stage === "searching") && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="max-w-2xl mx-auto"
            >
              {/* Hero */}
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5 mb-8">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 live-pulse" />
                  Dilly Recruiter — Week 2
                </div>

                <h1 className="font-display font-black text-gray-900 mb-4 leading-none" style={{ fontSize: "clamp(2.25rem, 6vw, 3.5rem)", letterSpacing: "-0.03em" }}>
                  Read the work.<br />
                  <span className="text-indigo-700">Not the resume.</span>
                </h1>

                <p className="text-gray-500 text-lg leading-relaxed max-w-lg mx-auto">
                  Choose a role. Read real Dilly profiles. Rank candidates blind.
                  Then see who you actually chose — and who an ATS would have eliminated.
                </p>
              </div>

              {/* Role selector */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-6">
                {rolesQuery.isLoading ? (
                  <div className="space-y-2">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="h-12 bg-gray-200 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <RoleSelector
                    roles={roles}
                    selectedId={selectedRole?.id || null}
                    onSelect={setSelectedRole}
                    customRole={customRole}
                    onCustomChange={setCustomRole}
                  />
                )}
              </div>

              {/* Selected role preview */}
              <AnimatePresence>
                {(selectedRole && !customRole) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-6"
                  >
                    <div className="bg-white border border-gray-200 rounded-2xl p-5">
                      <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">The role</div>
                      <pre className="font-sans text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedRole.description}</pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="text-center">
                <button
                  onClick={handleStart}
                  disabled={stage === "searching" || (!selectedRole && customRole.trim().length < 10 && roles.length === 0)}
                  className="inline-flex items-center gap-3 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white font-bold text-base px-8 py-4 rounded-2xl transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-lg shadow-indigo-900/20 mb-4"
                >
                  {stage === "searching" ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-white/80 live-pulse" />
                      Dilly is matching profiles...
                    </>
                  ) : (
                    <>
                      Start the Blind Audition
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </>
                  )}
                </button>

                <p className="text-xs text-gray-400">No names. No schools. No locations. Just the work.</p>
              </div>
            </motion.div>
          )}

          {/* ── Ranking / Revealing / Revealed ── */}
          {(stage === "ranking" || stage === "revealing" || stage === "revealed") && (
            <motion.div
              key="ranking"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Role label */}
              {selectedRole && (
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-xs text-gray-400 font-medium">Role:</span>
                  <span className="text-xs font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">{selectedRole.label}</span>
                </div>
              )}

              {/* Stage header */}
              <div className="flex items-start justify-between mb-6 gap-4">
                <div>
                  <h2 className="font-display font-black text-gray-900 text-xl tracking-tight mb-1">
                    {stage === "ranking" ? "Rank the candidates" : stage === "revealing" ? "Revealing..." : "The Reveal"}
                  </h2>
                  <p className="text-sm text-gray-500 leading-relaxed max-w-lg">
                    {stage === "ranking"
                      ? "Expand each candidate to read their full Dilly profile. Drag to reorder. When you have a ranking, hit Reveal."
                      : stage === "revealing"
                      ? "Seeing who you actually chose."
                      : "This is who was behind the profiles you ranked. Tap any name to see their full living profile."}
                  </p>
                </div>
                {stage === "revealed" && (
                  <button onClick={handleReset} className="flex-shrink-0 text-sm font-semibold text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl transition-colors">
                    Try another role
                  </button>
                )}
              </div>

              {/* Cards */}
              {stage === "ranking" ? (
                <Reorder.Group axis="y" values={order} onReorder={setOrder} as="div" className="space-y-3 mb-6">
                  {ordered.map((c, i) => (
                    <Reorder.Item key={c.id} value={c.id} as="div" whileDrag={{ scale: 1.02, boxShadow: "0 20px 40px rgba(0,0,0,0.12)" }}>
                      <BlindCard
                        candidate={c}
                        rank={i + 1}
                        revealed={false}
                        expanded={expanded === c.id}
                        onToggle={() => toggleExpanded(c.id)}
                        candidateIndex={candidates.findIndex(x => x.id === c.id)}
                        onOpenProfile={setProfileModal}
                      />
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              ) : (
                <div className="space-y-3 mb-6">
                  {ordered.map((c, i) => (
                    <BlindCard
                      key={c.id}
                      candidate={c}
                      rank={i + 1}
                      revealed={revealed.has(c.id)}
                      expanded={expanded === c.id}
                      onToggle={() => toggleExpanded(c.id)}
                      candidateIndex={candidates.findIndex(x => x.id === c.id)}
                      onOpenProfile={setProfileModal}
                    />
                  ))}
                </div>
              )}

              {/* Reveal button */}
              {stage === "ranking" && (
                <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <p className="text-sm text-gray-500">Read each profile. When you have a ranking, reveal.</p>
                  <button
                    onClick={handleReveal}
                    className="flex-shrink-0 bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all hover:-translate-y-0.5 shadow-md shadow-indigo-900/20"
                  >
                    Reveal candidates
                  </button>
                </div>
              )}

              {/* Summary + Share */}
              {stage === "revealed" && (
                <SummaryCard
                  ref={summaryRef}
                  ordered={ordered}
                  onReset={handleReset}
                  onOpenProfile={setProfileModal}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Living Profile Modal */}
      <AnimatePresence>
        {profileModal && (
          <LivingProfileModal
            candidate={profileModal}
            onClose={() => setProfileModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
