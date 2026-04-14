"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { API_BASE, RECRUITER_API_KEY_STORAGE } from "@/lib/dillyUtils";
import { AnimatePresence, motion } from "framer-motion";
import { useRecruiterBookmarks } from "@/hooks/useRecruiterBookmarks";
import { useRecruiterNotes } from "@/hooks/useRecruiterNotes";
import { AskAIChat } from "@/components/recruiter/AskAIChat";

const RECRUITER_SEARCH_STATE_KEY = "dilly_recruiter_search_state";

// ─── Helpers ────────────────────────────────────────────────────────────────

function initial(name: string): string {
  if (!name || !name.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getRoleDescriptionFromSearchState(): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    const raw = sessionStorage.getItem(RECRUITER_SEARCH_STATE_KEY);
    if (!raw) return "";
    const s = JSON.parse(raw) as { roleDescription?: string };
    return typeof s.roleDescription === "string" ? s.roleDescription : "";
  } catch {
    return "";
  }
}

type FitData = { fit_level: string; rerank_reason: string };

function getMatchScoreFromSearchState(candidateId: string): number | null {
  if (typeof sessionStorage === "undefined" || !candidateId) return null;
  try {
    const raw = sessionStorage.getItem(RECRUITER_SEARCH_STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as {
      candidates?: Array<{ candidate_id?: string; match_score?: number }>;
    };
    const match = (s.candidates || []).find((c) => c.candidate_id === candidateId);
    return match?.match_score != null ? match.match_score : null;
  } catch {
    return null;
  }
}

function getFitDataFromSearchState(candidateId: string): FitData | null {
  if (typeof sessionStorage === "undefined" || !candidateId) return null;
  try {
    const raw = sessionStorage.getItem(RECRUITER_SEARCH_STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as {
      candidates?: Array<{
        candidate_id?: string;
        fit_level?: string;
        rerank_reason?: string;
      }>;
    };
    const match = (s.candidates || []).find((c) => c.candidate_id === candidateId);
    if (!match || !match.fit_level) return null;
    return { fit_level: match.fit_level, rerank_reason: match.rerank_reason || "" };
  } catch {
    return null;
  }
}

function getRecruiterKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(RECRUITER_API_KEY_STORAGE);
}

function fitLevelClass(level: string | undefined): string {
  if (!level) return "";
  const l = level.toLowerCase().replace(/\s+/g, "-");
  if (l === "standout") return "dr-fit-badge--green";
  if (l === "strong-fit" || l === "strong") return "dr-fit-badge--green";
  if (l === "good-fit" || l === "good") return "dr-fit-badge--amber";
  if (l === "weak-fit" || l === "weak" || l === "not-a-fit") return "dr-fit-badge--red";
  return "dr-fit-badge--amber";
}

function evidenceStatusClass(status: "green" | "yellow" | "red"): string {
  if (status === "green") return "dr-evidence-status--green";
  if (status === "yellow") return "dr-evidence-status--amber";
  return "dr-evidence-status--red";
}

function evidenceStatusIcon(status: "green" | "yellow" | "red"): string {
  if (status === "green") return "✓";
  if (status === "yellow") return "~";
  return "✗";
}

// ─── API ────────────────────────────────────────────────────────────────────

async function sendRecruiterFeedback(
  key: string,
  candidateId: string,
  event: "view" | "shortlist" | "pass" | "contact"
): Promise<void> {
  await fetch(`${API_BASE}/recruiter/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Recruiter-API-Key": key,
    },
    body: JSON.stringify({ candidate_id: candidateId, event }),
  });
}

async function sendRecruiterContact(
  key: string,
  payload: {
    candidate_id: string;
    recruiter_email: string;
    recruiter_name?: string;
    company?: string;
    job_title?: string;
    message: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/recruiter/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Recruiter-API-Key": key,
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { detail?: string } | null;
    const msg = (data?.detail || res.statusText || "Failed to send").toString();
    return { ok: false, error: msg };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type StructuredExperienceEntry = {
  company: string;
  role: string;
  date: string;
  location: string;
  bullets: string[];
  relevance?: number;
  matched_bullets?: string[];
  fit_reason?: string;
};

type JdEvidenceItem = {
  requirement: string;
  status: "green" | "yellow" | "red";
  evidence: string[];
};

type CandidateDetail = {
  candidate_id: string;
  email: string;
  name: string;
  major: string;
  majors: string[];
  minors?: string[];
  school_id: string;
  cohort: string;
  dilly_take: string | null;
  application_target: string | null;
  job_locations: string[];
  structured_experience?: StructuredExperienceEntry[];
  why_fit_bullets?: string[] | null;
  why_bad_fit_bullets?: string[] | null;
  jd_evidence_map?: JdEvidenceItem[];
  jd_gap_summary?: string | null;
  pronouns?: string | null;
  linkedin_url?: string | null;
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function CandidateDetailAvatar({
  candidateId,
  name,
  size = 112,
}: {
  candidateId: string;
  name: string;
  size?: number;
}) {
  const _photoBust = Math.floor(Date.now() / 60000);
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !imgFailed && !!candidateId;

  return (
    <div
      className="dr-profile-avatar"
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      {showPhoto ? (
        <img
          src={`${API_BASE}/profile/public/${candidateId}/photo?_b=${_photoBust}`}
          alt=""
          onError={() => setImgFailed(true)}
          className="dr-profile-avatar-img"
        />
      ) : (
        <span
          className="dr-profile-avatar-initials"
          style={{ fontSize: size * 0.36 }}
        >
          {initial(name || "?")}
        </span>
      )}
    </div>
  );
}

type BookmarkMenuProps = {
  candidateId: string;
  bookmarks: ReturnType<typeof useRecruiterBookmarks>;
  onClose: () => void;
};

function BookmarkMenu({ candidateId, bookmarks, onClose }: BookmarkMenuProps) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const handleToggle = async () => {
    await bookmarks.toggleBookmark(candidateId);
  };

  const handleAdd = async (name: string) => {
    const exists = name in bookmarks.collections;
    if (exists) {
      await bookmarks.addToCollection(name, candidateId);
    } else {
      setCreating(true);
      const ok = await bookmarks.createCollection(name);
      if (ok) await bookmarks.addToCollection(name, candidateId);
      setCreating(false);
    }
    onClose();
  };

  const handleCreateNew = async () => {
    const name = newName.trim();
    if (!name) return;
    await handleAdd(name);
    setNewName("");
  };

  return (
    <motion.div
      ref={ref}
      className="dr-bookmark-menu"
      initial={{ opacity: 0, scale: 0.93, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.93, y: -4 }}
      transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <button
        type="button"
        className="dr-bookmark-menu-toggle"
        onClick={handleToggle}
      >
        {bookmarks.isBookmarked(candidateId)
          ? "Remove from bookmarks"
          : "Add to bookmarks"}
      </button>
      <div className="dr-bookmark-menu-divider" />
      <p className="dr-bookmark-menu-label">Add to collection</p>
      {Object.keys(bookmarks.collections).length === 0 ? (
        <p className="dr-bookmark-menu-empty">No collections yet.</p>
      ) : (
        <ul className="dr-bookmark-menu-list">
          {Object.keys(bookmarks.collections).map((name) => (
            <li key={name}>
              <button type="button" onClick={() => handleAdd(name)}>
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dr-bookmark-menu-create">
        <input
          type="text"
          placeholder="New collection name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateNew()}
        />
        <button
          type="button"
          onClick={handleCreateNew}
          disabled={creating || !newName.trim()}
        >
          Create
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function RecruiterCandidatePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const bookmarks = useRecruiterBookmarks();
  const notes = useRecruiterNotes(id);

  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fitData, setFitData] = useState<FitData | null>(null);
  const [bookmarkMenuOpen, setBookmarkMenuOpen] = useState(false);
  const bookmarkMenuRef = useRef<HTMLDivElement>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteStage, setNoteStage] = useState<string>("reviewing");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // Reach-out modal
  const [reachOutOpen, setReachOutOpen] = useState(false);
  const [reachOutRecruiterEmail, setReachOutRecruiterEmail] = useState("");
  const [reachOutRecruiterName, setReachOutRecruiterName] = useState("");
  const [reachOutCompany, setReachOutCompany] = useState("");
  const [reachOutJobTitle, setReachOutJobTitle] = useState("");
  const [reachOutMessage, setReachOutMessage] = useState("");
  const [reachOutSending, setReachOutSending] = useState(false);
  const [reachOutSuccess, setReachOutSuccess] = useState(false);
  const [reachOutError, setReachOutError] = useState("");

  // Role context (from session storage)
  const [roleDescription, setRoleDescription] = useState("");

  useEffect(() => {
    setRoleDescription(getRoleDescriptionFromSearchState());
    if (id) setFitData(getFitDataFromSearchState(id));
  }, [id]);

  // Load candidate
  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Invalid candidate");
      return;
    }
    const key = getRecruiterKey();
    const headers: Record<string, string> = {};
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    setLoading(true);
    setError("");
    const rd = getRoleDescriptionFromSearchState();
    const fd = getFitDataFromSearchState(id);
    const url = new URL(`${API_BASE}/recruiter/candidates/${encodeURIComponent(id)}`);
    if (rd.trim()) url.searchParams.set("role_description", rd.trim());
    if (fd?.fit_level) url.searchParams.set("fit_level", fd.fit_level);
    fetch(url.toString(), { headers })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("Candidate not found");
          if (res.status === 401) throw new Error("Invalid API key");
          throw new Error(res.statusText || "Failed to load");
        }
        return res.json();
      })
      .then((data: CandidateDetail) => {
        setCandidate(data);
        sendRecruiterFeedback(key || "", id, "view").catch(() => {});
      })
      .catch((e: Error) => {
        setError(e.message || "Failed to load");
        setCandidate(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Save note
  const handleSaveNote = useCallback(async () => {
    if (!noteDraft.trim() || !id) return;
    setNoteSaving(true);
    await notes.addNote({ stage: noteStage, text: noteDraft.trim() });
    setNoteDraft("");
    setNoteSaving(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }, [id, noteDraft, noteStage, notes]);

  // Reach-out
  const handleSendReachOut = useCallback(async () => {
    const key = getRecruiterKey();
    if (!id) return;
    const recruiterEmail = reachOutRecruiterEmail.trim();
    const message = reachOutMessage.trim();
    if (!recruiterEmail || !recruiterEmail.includes("@")) {
      setReachOutError("Enter a valid recruiter email.");
      return;
    }
    if (message.length < 80) {
      setReachOutError("Message is too short. Aim for at least 80 characters.");
      return;
    }
    setReachOutSending(true);
    setReachOutError("");
    const resp = await sendRecruiterContact(key || "", {
      candidate_id: id,
      recruiter_email: recruiterEmail,
      recruiter_name: reachOutRecruiterName.trim() || undefined,
      company: reachOutCompany.trim() || undefined,
      job_title: reachOutJobTitle.trim() || undefined,
      message,
    });
    setReachOutSending(false);
    if (!resp.ok) {
      setReachOutError(resp.error);
      return;
    }
    setReachOutSuccess(true);
    sendRecruiterFeedback(key || "", id, "contact").catch(() => {});
  }, [
    id,
    reachOutRecruiterEmail,
    reachOutRecruiterName,
    reachOutCompany,
    reachOutJobTitle,
    reachOutMessage,
  ]);

  // Export shortlist
  const handleExportShortlist = useCallback(async () => {
    const key = getRecruiterKey();
    const headers: Record<string, string> = {};
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      const res = await fetch(`${API_BASE}/recruiter/export/shortlist`, { headers });
      if (!res.ok) return;
      const d = await res.json();
      const rows = d.candidates || [];
      const csvHeaders = [
        "First Name",
        "Last Name",
        "Email",
        "Phone",
        "School",
        "Major",
        "Fit Level",
        "Dilly Profile",
        "Dilly Take",
        "Job Locations",
        "Source",
      ];
      const escape = (v: string | undefined) => `"${(v || "").replace(/"/g, '""')}"`;
      const csvRows = [
        csvHeaders.join(","),
        ...rows.map(
          (r: {
            first_name?: string;
            last_name?: string;
            email?: string;
            phone?: string;
            school?: string;
            major?: string;
            fit_level?: string;
            dilly_profile_link?: string;
            dilly_take?: string;
            job_locations?: string;
            source?: string;
          }) =>
            [
              escape(r.first_name),
              escape(r.last_name),
              escape(r.email),
              escape(r.phone),
              escape(r.school),
              escape(r.major),
              escape(r.fit_level),
              escape(r.dilly_profile_link),
              escape(r.dilly_take),
              escape(r.job_locations),
              escape(r.source),
            ].join(",")
        ),
      ];
      const bom = "\uFEFF";
      const blob = new Blob([bom + csvRows.join("\r\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dilly-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, []);

  // ─── Animation presets ──────────────────────────────────────────────────

  const pop = {
    initial: { opacity: 0, y: 10, scale: 0.985 },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.22, ease: "easeOut" },
    },
    exit: {
      opacity: 0,
      y: 6,
      scale: 0.99,
      transition: { duration: 0.16, ease: "easeIn" },
    },
  } as const;

  const stagger = {
    animate: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
  } as const;

  // ─── Loading / error states ─────────────────────────────────────────────

  if (loading || error || !candidate) {
    return (
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.section
            key="loading"
            className="dr-section dr-loading-center"
            variants={pop}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <motion.div
              className="dr-loading-spinner"
              aria-hidden="true"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="dr-loading-text"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            >
              Loading profile...
            </motion.div>
          </motion.section>
        ) : (
          <motion.section
            key="error"
            className="dr-section"
            variants={pop}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <p className="dr-error-text">{error || "Candidate not found"}</p>
          </motion.section>
        )}
      </AnimatePresence>
    );
  }

  // ─── Derived display values ─────────────────────────────────────────────

  const displayName = candidate.name || "Candidate";
  const majorsList =
    candidate.majors && candidate.majors.length > 0
      ? candidate.majors
      : candidate.major
        ? [candidate.major]
        : [];
  const minorsList = (candidate.minors ?? []).filter(
    (m) => m && !/^(N\/A|NA|N|A)$/i.test(m.trim())
  );
  const matchScore = getMatchScoreFromSearchState(candidate.candidate_id);
  const jdEvidence = candidate.jd_evidence_map ?? [];
  const structuredExp = candidate.structured_experience ?? [];
  const hasWhyBad =
    candidate.why_bad_fit_bullets && candidate.why_bad_fit_bullets.length > 0;
  const fitBullets = hasWhyBad
    ? candidate.why_bad_fit_bullets!
    : candidate.why_fit_bullets && candidate.why_fit_bullets.length > 0
      ? candidate.why_fit_bullets
      : null;

  const fitHeading = hasWhyBad
    ? `Why ${displayName} may not be the right fit`
    : fitData?.fit_level === "Standout"
      ? `Why ${displayName} stands out`
      : fitData?.fit_level === "Strong fit" || fitData?.fit_level === "Strong"
        ? `Why ${displayName} is a strong fit`
        : `Why ${displayName} fits`;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={candidate.candidate_id}
        className="dr-profile-page"
        variants={pop}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {/* ── Hero row ─────────────────────────────────────────────────── */}
        <motion.div
          className="dr-profile-hero-row"
          variants={stagger}
          initial={false}
          animate="animate"
        >
          {/* Avatar */}
          <motion.div variants={pop}>
            <CandidateDetailAvatar
              candidateId={candidate.candidate_id}
              name={displayName}
              size={112}
            />
          </motion.div>

          {/* Name block */}
          <motion.div className="dr-profile-identity" variants={pop}>
            <div className="dr-profile-name-row">
              <h1 className="dr-profile-name">{displayName}</h1>
              {fitData?.fit_level && (
                <span className={`dr-fit-badge ${fitLevelClass(fitData.fit_level)}`}>
                  {fitData.fit_level}
                </span>
              )}
              {matchScore != null && (
                <span className="dr-match-chip">
                  {Math.round(matchScore)}% match
                </span>
              )}
            </div>

            <p className="dr-profile-meta">
              {majorsList.length > 0 && (
                <>
                  <span className="dr-meta-label">
                    {majorsList.length > 1 ? "Majors" : "Major"}
                  </span>{" "}
                  {majorsList.join(", ")}
                </>
              )}
              {minorsList.length > 0 && (
                <>
                  {majorsList.length > 0 && " · "}
                  <span className="dr-meta-label">
                    {minorsList.length > 1 ? "Minors" : "Minor"}
                  </span>{" "}
                  {minorsList.join(", ")}
                </>
              )}
              {candidate.school_id && (
                <>
                  {(majorsList.length > 0 || minorsList.length > 0) && " · "}
                  {candidate.school_id}
                </>
              )}
              {candidate.cohort && (
                <>
                  {" · "}
                  {candidate.cohort}
                </>
              )}
            </p>

            {/* Actions row */}
            <div className="dr-profile-actions">
              {candidate.linkedin_url && (
                <a
                  href={
                    candidate.linkedin_url.startsWith("http")
                      ? candidate.linkedin_url
                      : `https://${candidate.linkedin_url}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dr-icon-btn"
                  title="LinkedIn"
                  aria-label="View LinkedIn profile"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              )}

              {/* Bookmark */}
              <div style={{ position: "relative" }} ref={bookmarkMenuRef}>
                <button
                  type="button"
                  className={`dr-icon-btn${bookmarks.isSaved(candidate.candidate_id) ? " dr-icon-btn--active" : ""}`}
                  onClick={() => setBookmarkMenuOpen((o) => !o)}
                  title={
                    bookmarks.isSaved(candidate.candidate_id)
                      ? "Bookmarked"
                      : "Bookmark"
                  }
                  aria-label={
                    bookmarks.isSaved(candidate.candidate_id)
                      ? "Bookmarked"
                      : "Bookmark"
                  }
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    {bookmarks.isSaved(candidate.candidate_id) ? (
                      <path
                        d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
                        fill="currentColor"
                        stroke="none"
                      />
                    ) : (
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    )}
                  </svg>
                </button>
                <AnimatePresence>
                  {bookmarkMenuOpen && (
                    <BookmarkMenu
                      key="bm"
                      candidateId={candidate.candidate_id}
                      bookmarks={bookmarks}
                      onClose={() => setBookmarkMenuOpen(false)}
                    />
                  )}
                </AnimatePresence>
              </div>

              <a
                href={`/p/${candidate.candidate_id}/full`}
                target="_blank"
                rel="noopener noreferrer"
                className="dr-action-link"
              >
                View full Dilly profile
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden
                  style={{ marginLeft: "0.3rem" }}
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>

              <button
                type="button"
                className="dr-action-btn"
                onClick={() => {
                  setReachOutError("");
                  setReachOutSuccess(false);
                  setReachOutOpen(true);
                }}
              >
                Reach out
              </button>

              <button
                type="button"
                className="dr-action-btn dr-action-btn--ghost"
                onClick={handleExportShortlist}
                title="Export shortlist as CSV"
              >
                Export to ATS
              </button>
            </div>
          </motion.div>
        </motion.div>

        {/* ── Dilly's Take (hero blockquote) ───────────────────────────── */}
        {candidate.dilly_take && (
          <motion.blockquote
            className="dr-dilly-take"
            variants={pop}
            initial="initial"
            animate="animate"
          >
            <span className="dr-dilly-take-eyebrow">Dilly's Take</span>
            <p>{candidate.dilly_take}</p>
          </motion.blockquote>
        )}

        {/* ── Two-column body ───────────────────────────────────────────── */}
        <motion.div
          className="dr-profile-columns"
          variants={stagger}
          initial={false}
          animate="animate"
        >
          {/* LEFT column */}
          <motion.div className="dr-profile-col-left" variants={pop}>

            {/* Fit bullets */}
            {fitBullets && fitBullets.length > 0 && (
              <section className="dr-profile-section">
                <h2
                  className={`dr-section-heading${hasWhyBad ? " dr-section-heading--red" : " dr-section-heading--indigo"}`}
                >
                  {fitHeading}
                </h2>
                <ul className="dr-fit-bullets">
                  {fitBullets.map((b, i) => (
                    <li key={i} className={hasWhyBad ? "dr-fit-bullet--bad" : ""}>
                      {b}
                    </li>
                  ))}
                </ul>
                {fitData?.rerank_reason && (
                  <p className="dr-rerank-reason">{fitData.rerank_reason}</p>
                )}
              </section>
            )}

            {/* JD Evidence Map */}
            {jdEvidence.length > 0 && (
              <section className="dr-profile-section">
                <h2 className="dr-section-heading dr-section-heading--indigo">
                  How they map to the role
                </h2>
                <div className="dr-evidence-map">
                  {jdEvidence.map((item, i) => (
                    <div key={i} className="dr-evidence-row">
                      <div className="dr-evidence-req-row">
                        <span
                          className={`dr-evidence-status-icon ${evidenceStatusClass(item.status)}`}
                          aria-label={item.status}
                        >
                          {evidenceStatusIcon(item.status)}
                        </span>
                        <span className="dr-evidence-req">{item.requirement}</span>
                      </div>
                      {item.evidence && item.evidence.length > 0 && (
                        <ul className="dr-evidence-list">
                          {item.evidence.slice(0, 2).map((e, j) => (
                            <li key={j}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
                {candidate.jd_gap_summary && (
                  <p className="dr-gap-summary">{candidate.jd_gap_summary}</p>
                )}
              </section>
            )}

            {/* Notes */}
            <section className="dr-profile-section">
              <h2 className="dr-section-heading dr-section-heading--indigo">
                Recruiter notes
              </h2>
              {/* Stage chips */}
              <div className="dr-note-stages">
                {["reviewing", "phone screen", "shortlisted", "passed"].map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      className={`dr-stage-chip${noteStage === s ? " dr-stage-chip--active" : ""}`}
                      onClick={() => setNoteStage(s)}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  )
                )}
              </div>
              <textarea
                className="dr-note-textarea"
                placeholder={`Notes on ${displayName} (stage: ${noteStage})...`}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={4}
              />
              <div className="dr-note-actions">
                <button
                  type="button"
                  className="dr-action-btn"
                  onClick={handleSaveNote}
                  disabled={noteSaving || !noteDraft.trim()}
                >
                  {noteSaving ? "Saving..." : noteSaved ? "Saved" : "Save note"}
                </button>
              </div>
              {/* Existing notes */}
              {notes.notes && notes.notes.length > 0 && (
                <div className="dr-notes-history">
                  {notes.notes.map((n, i) => (
                    <div key={i} className="dr-note-entry">
                      <span className="dr-note-stage-tag">{n.stage}</span>
                      <p>{n.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </motion.div>

          {/* RIGHT column */}
          <motion.div className="dr-profile-col-right" variants={pop}>

            {/* Structured experience */}
            {structuredExp.length > 0 && (
              <section className="dr-profile-section">
                <h2 className="dr-section-heading dr-section-heading--indigo">
                  Experience
                </h2>
                <div className="dr-experience-list">
                  {structuredExp.map((exp, i) => (
                    <div key={i} className="dr-exp-entry">
                      <div className="dr-exp-header">
                        <div className="dr-exp-title-block">
                          <span className="dr-exp-role">{exp.role}</span>
                          <span className="dr-exp-company">{exp.company}</span>
                        </div>
                        <div className="dr-exp-meta-block">
                          {exp.date && (
                            <span className="dr-exp-date">{exp.date}</span>
                          )}
                          {exp.location && (
                            <span className="dr-exp-location">{exp.location}</span>
                          )}
                        </div>
                      </div>
                      {exp.fit_reason && (
                        <p className="dr-exp-fit-reason">{exp.fit_reason}</p>
                      )}
                      {exp.bullets && exp.bullets.length > 0 && (
                        <ul className="dr-exp-bullets">
                          {exp.bullets.map((b, j) => (
                            <li
                              key={j}
                              className={
                                exp.matched_bullets?.includes(b)
                                  ? "dr-exp-bullet--matched"
                                  : ""
                              }
                            >
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Ask Dilly AI widget */}
            <section className="dr-profile-section dr-ask-ai-section">
              <AskAIChat
                candidateId={candidate.candidate_id}
                candidateName={displayName}
                roleDescription={roleDescription}
              />
            </section>
          </motion.div>
        </motion.div>

        {/* ── Reach-out modal ───────────────────────────────────────────── */}
        <AnimatePresence>
          {reachOutOpen && (
            <motion.div
              className="dr-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReachOutOpen(false)}
            >
              <motion.div
                className="dr-modal"
                initial={{ opacity: 0, scale: 0.93, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.93, y: 16 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
              >
                {reachOutSuccess ? (
                  <div className="dr-modal-success">
                    <p className="dr-modal-success-icon">&#10003;</p>
                    <p className="dr-modal-success-text">
                      Your message has been sent to {displayName}.
                    </p>
                    <button
                      type="button"
                      className="dr-action-btn"
                      onClick={() => setReachOutOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="dr-modal-header">
                      <h2 className="dr-modal-title">
                        Reach out to {displayName}
                      </h2>
                      <button
                        type="button"
                        className="dr-modal-close"
                        onClick={() => setReachOutOpen(false)}
                        aria-label="Close"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="dr-modal-body">
                      <div className="dr-form-row">
                        <label className="dr-form-label">Your email*</label>
                        <input
                          type="email"
                          className="dr-form-input"
                          value={reachOutRecruiterEmail}
                          onChange={(e) =>
                            setReachOutRecruiterEmail(e.target.value)
                          }
                          placeholder="you@company.com"
                        />
                      </div>
                      <div className="dr-form-row">
                        <label className="dr-form-label">Your name</label>
                        <input
                          type="text"
                          className="dr-form-input"
                          value={reachOutRecruiterName}
                          onChange={(e) =>
                            setReachOutRecruiterName(e.target.value)
                          }
                          placeholder="Jane Smith"
                        />
                      </div>
                      <div className="dr-form-row-split">
                        <div>
                          <label className="dr-form-label">Company</label>
                          <input
                            type="text"
                            className="dr-form-input"
                            value={reachOutCompany}
                            onChange={(e) => setReachOutCompany(e.target.value)}
                            placeholder="Acme Corp"
                          />
                        </div>
                        <div>
                          <label className="dr-form-label">Role title</label>
                          <input
                            type="text"
                            className="dr-form-input"
                            value={reachOutJobTitle}
                            onChange={(e) =>
                              setReachOutJobTitle(e.target.value)
                            }
                            placeholder="Software Engineer"
                          />
                        </div>
                      </div>
                      <div className="dr-form-row">
                        <label className="dr-form-label">Message*</label>
                        <textarea
                          className="dr-form-textarea"
                          value={reachOutMessage}
                          onChange={(e) => setReachOutMessage(e.target.value)}
                          placeholder={`Hi ${displayName.split(" ")[0]}, I came across your profile on Dilly and wanted to reach out...`}
                          rows={5}
                        />
                        <p className="dr-form-hint">
                          {reachOutMessage.length} / 80 min chars
                        </p>
                      </div>
                      {reachOutError && (
                        <p className="dr-form-error">{reachOutError}</p>
                      )}
                    </div>
                    <div className="dr-modal-footer">
                      <button
                        type="button"
                        className="dr-action-btn dr-action-btn--ghost"
                        onClick={() => setReachOutOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="dr-action-btn"
                        onClick={handleSendReachOut}
                        disabled={reachOutSending}
                      >
                        {reachOutSending ? "Sending..." : "Send message"}
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
