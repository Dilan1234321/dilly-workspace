"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { API_BASE, RECRUITER_API_KEY_STORAGE, scoreColor } from "@/lib/dillyUtils";
import { AnimatePresence, motion } from "framer-motion";
import { useRecruiterBookmarks } from "@/hooks/useRecruiterBookmarks";
import { useRecruiterNotes } from "@/hooks/useRecruiterNotes";
import { AskAIChat } from "@/components/recruiter/AskAIChat";


const RECRUITER_SEARCH_STATE_KEY = "dilly_recruiter_search_state";

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
    const s = JSON.parse(raw) as { candidates?: Array<{ candidate_id?: string; match_score?: number }> };
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
    const s = JSON.parse(raw) as { candidates?: Array<{ candidate_id?: string; fit_level?: string; rerank_reason?: string }> };
    const match = (s.candidates || []).find((c) => c.candidate_id === candidateId);
    if (!match || !match.fit_level) return null;
    return { fit_level: match.fit_level, rerank_reason: match.rerank_reason || "" };
  } catch {
    return null;
  }
}

function CandidateDetailAvatar({
  candidateId,
  name,
  size = 96,
}: {
  candidateId: string;
  name: string;
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !imgFailed && candidateId;
  return (
    <div
      className="te-card-avatar"
      style={{
        width: size,
        height: size,
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
        borderRadius: "50%",
      }}
    >
      {showPhoto ? (
        <img
          src={`${API_BASE}/profile/public/${candidateId}/photo`}
          alt=""
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
          style={{ position: "absolute", inset: 0 }}
        />
      ) : (
        <span style={{ position: "relative", zIndex: 1, fontSize: size * 0.4 }}>{initial(name || "?")}</span>
      )}
    </div>
  );
}

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
  smart: number | null;
  grit: number | null;
  build: number | null;
  final_score: number | null;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future use
function pronounObject(pronouns: string | null | undefined): "him" | "her" | "them" {
  const p = (pronouns || "").toLowerCase();
  if (/he|him|his/.test(p)) return "him";
  if (/she|her|hers/.test(p)) return "her";
  return "them";
}

type ProfileBookmarkMenuProps = {
  candidateId: string;
  bookmarks: ReturnType<typeof useRecruiterBookmarks>;
  onClose: () => void;
};

function ProfileBookmarkMenu({ candidateId, bookmarks, onClose }: ProfileBookmarkMenuProps) {
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

  const handleToggleBookmark = async () => {
    await bookmarks.toggleBookmark(candidateId);
    /* Menu stays open so user can add to collection */
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
      className="te-collection-modal te-collection-modal--profile te-bookmark-menu"
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -4 }}
      transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="te-collection-modal-inner">
        <button
          type="button"
          className="te-bookmark-menu-toggle"
          onClick={handleToggleBookmark}
        >
          {bookmarks.isBookmarked(candidateId) ? "Remove from General Bookmarks" : "Add to General Bookmarks"}
        </button>
        <div className="te-collection-modal-divider" />
        <p className="te-collection-modal-title">Add to collection</p>
        {Object.keys(bookmarks.collections).length === 0 ? (
          <p className="te-collection-modal-empty">No collections yet. Create one below.</p>
        ) : (
          <ul className="te-collection-modal-list">
            {Object.keys(bookmarks.collections).map((name) => (
              <li key={name}>
                <button type="button" onClick={() => handleAdd(name)}>
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="te-collection-modal-create">
          <input
            type="text"
            placeholder="New collection name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateNew()}
          />
          <button type="button" onClick={handleCreateNew} disabled={creating || !newName.trim()}>
            Create & add
          </button>
        </div>
      </div>
    </motion.div>
  );
}

type ProfileCollectionMenuProps = {
  candidateId: string;
  bookmarks: ReturnType<typeof useRecruiterBookmarks>;
  onClose: () => void;
  onSelect: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future use
function ProfileCollectionMenu({ candidateId, bookmarks, onClose, onSelect }: ProfileCollectionMenuProps) {
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
    onSelect();
  };

  const handleCreateNew = async () => {
    const name = newName.trim();
    if (!name) return;
    await handleAdd(name);
    setNewName("");
  };

  return (
    <div ref={ref} className="te-collection-modal te-collection-modal--profile">
      <div className="te-collection-modal-inner">
        <p className="te-collection-modal-title">Add to collection</p>
        {Object.keys(bookmarks.collections).length === 0 ? (
          <p className="te-collection-modal-empty">No collections yet. Create one below.</p>
        ) : (
          <ul className="te-collection-modal-list">
            {Object.keys(bookmarks.collections).map((name) => (
              <li key={name}>
                <button type="button" onClick={() => handleAdd(name)}>
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="te-collection-modal-create">
          <input
            type="text"
            placeholder="New collection name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateNew()}
          />
          <button type="button" onClick={handleCreateNew} disabled={creating || !newName.trim()}>
            Create & add
          </button>
        </div>
      </div>
    </div>
  );
}

function getRecruiterKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(RECRUITER_API_KEY_STORAGE);
}

async function sendRecruiterFeedback(
  key: string,
  candidateId: string,
  event: "view" | "shortlist" | "pass" | "contact",
  roleIdOrSearchId?: string
): Promise<void> {
  const body: Record<string, string> = { candidate_id: candidateId, event };
  if (roleIdOrSearchId) body.role_id_or_search_id = roleIdOrSearchId;
  await fetch(`${API_BASE}/recruiter/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Recruiter-API-Key": key,
    },
    body: JSON.stringify(body),
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

export default function RecruiterCandidatePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const bookmarks = useRecruiterBookmarks();
  const notes = useRecruiterNotes(id);
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const collectionMenuRef = useRef<HTMLDivElement>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fitData, setFitData] = useState<FitData | null>(null);
  const [feedbackSending, setFeedbackSending] = useState<string | null>(null);

  const [reachOutOpen, setReachOutOpen] = useState(false);
  const [reachOutRecruiterEmail, setReachOutRecruiterEmail] = useState("");
  const [reachOutRecruiterName, setReachOutRecruiterName] = useState("");
  const [reachOutCompany, setReachOutCompany] = useState("");
  const [reachOutJobTitle, setReachOutJobTitle] = useState("");
  const [reachOutMessage, setReachOutMessage] = useState("");
  const [reachOutSending, setReachOutSending] = useState(false);
  const [reachOutSuccess, setReachOutSuccess] = useState(false);
  const [reachOutError, setReachOutError] = useState("");

  const handleFeedback = useCallback(
    async (event: "shortlist" | "pass" | "contact") => {
      const key = getRecruiterKey();
      if (!id) return;
      setFeedbackSending(event);
      try {
        await sendRecruiterFeedback(key || "", id, event);
      } finally {
        setFeedbackSending(null);
      }
    },
    [id]
  );

  const openReachOut = useCallback(() => {
    setReachOutError("");
    setReachOutSuccess(false);
    setReachOutOpen(true);
  }, []);

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
      // ATS-ready columns: match Greenhouse, Bullhorn, Lever bulk-import formats
      const csvHeaders = [
        "First Name",
        "Last Name",
        "Email",
        "Phone",
        "School",
        "Major",
        "Track",
        "Smart",
        "Grit",
        "Build",
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
            track?: string;
            smart?: string;
            grit?: string;
            build?: string;
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
              escape(r.track),
              escape(r.smart),
              escape(r.grit),
              escape(r.build),
              escape(r.dilly_profile_link),
              escape(r.dilly_take ?? r.dilly_take),
              escape(r.job_locations),
              escape(r.source),
            ].join(",")
        ),
      ];
      // UTF-8 BOM for Excel to recognize encoding
      const bom = "\uFEFF";
      const blob = new Blob([bom + csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dilly-ats-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, []);

  const closeReachOut = useCallback(() => {
    setReachOutOpen(false);
    setReachOutSending(false);
  }, []);

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
    // Log feedback event for learning / ranking
    sendRecruiterFeedback(key || "", id, "contact").catch(() => {});
  }, [
    id,
    reachOutRecruiterEmail,
    reachOutRecruiterName,
    reachOutCompany,
    reachOutJobTitle,
    reachOutMessage,
  ]);

  useEffect(() => {
    if (id) setFitData(getFitDataFromSearchState(id));
  }, [id]);

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
    const roleDescription = getRoleDescriptionFromSearchState();
    const fd = getFitDataFromSearchState(id);
    const url = new URL(`${API_BASE}/recruiter/candidates/${encodeURIComponent(id)}`);
    if (roleDescription.trim()) url.searchParams.set("role_description", roleDescription.trim());
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
      .then((data) => {
        setCandidate(data);
        sendRecruiterFeedback(key || "", id, "view").catch(() => {});
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
        setCandidate(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const pop = {
    initial: { opacity: 0, y: 10, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: "easeOut" } },
    exit: { opacity: 0, y: 6, scale: 0.99, transition: { duration: 0.16, ease: "easeIn" } },
  } as const;

  const stagger = {
    animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
  } as const;

  if (loading || error || !candidate) {
    return (
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.section
            key="loading"
            className="te-section te-loading-center"
            variants={pop}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <motion.div
              className="te-loading-spinner"
              aria-hidden="true"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="te-loading-text"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            >
              Loading…
            </motion.div>
          </motion.section>
        ) : (
          <motion.section key="error" className="te-section" variants={pop} initial="initial" animate="animate" exit="exit">
            <p style={{ color: "#f87171", marginBottom: "1rem" }}>{error || "Candidate not found"}</p>
          </motion.section>
        )}
      </AnimatePresence>
    );
  }

  const displayName = candidate.name || "Candidate";
  const majorsList = (candidate.majors && candidate.majors.length > 0) ? candidate.majors : (candidate.major ? [candidate.major] : []);
  const minorsList = (candidate.minors ?? []).filter((m) => m && !/^(N\/A|NA|N|A)$/i.test(m.trim()));
  const matchScore = getMatchScoreFromSearchState(candidate.candidate_id);
  const whyBadFitBullets = candidate.why_bad_fit_bullets && candidate.why_bad_fit_bullets.length > 0
    ? candidate.why_bad_fit_bullets
    : null;
  const whyBullets = whyBadFitBullets
    ? whyBadFitBullets
    : candidate.why_fit_bullets && candidate.why_fit_bullets.length > 0
      ? candidate.why_fit_bullets
      : ((candidate.dilly_take ?? candidate.dilly_take) ? [candidate.dilly_take ?? candidate.dilly_take!] : ["No role description provided for fit summary."]);
  const structuredExp = candidate.structured_experience ?? [];
  const jdEvidence = candidate.jd_evidence_map ?? [];

  const smart = candidate.smart ?? 0;
  const grit = candidate.grit ?? 0;
  const build = candidate.build ?? 0;

  return (
    <AnimatePresence mode="wait">
      <div className="te-profile-with-sidebar">
      <motion.section
        key={candidate.candidate_id}
        className="te-section te-profile-full"
        style={{ minHeight: "calc(100vh - 60px)", paddingTop: "1rem" }}
        variants={pop}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <div className="te-profile-full-inner">
        {/* Master row: photo | name + majors/minors | Smart | Grit | Build */}
        <motion.div className="te-profile-master-row" variants={stagger} initial={false} animate="animate">
          <motion.div variants={pop}>
            <CandidateDetailAvatar candidateId={candidate.candidate_id} name={candidate.name || ""} size={220} />
          </motion.div>
          <motion.div className="te-profile-name-block" variants={pop}>
            <h1 className="te-profile-name-hero">{displayName}</h1>
            <p className="te-profile-majors">
              {majorsList.length > 0 ? (
                <>
                  <span className="te-profile-label">{majorsList.length > 1 ? "Majors" : "Major"}</span>{" "}
                  {majorsList.join(", ")}
                </>
              ) : (
                "—"
              )}
              {minorsList.length > 0 && (
                <>
                  {" "}
                  · <span className="te-profile-label">{minorsList.length > 1 ? "Minors" : "Minor"}</span>{" "}
                  {minorsList.join(", ")}
                </>
              )}
            </p>
            {candidate.cohort && /^Pre-(Health|Law|Med|PA|Dental|Vet|PT|OT|Pharmacy)$/i.test(candidate.cohort.trim()) && (
              <p className="te-profile-track" style={{ marginTop: "0.25rem", fontSize: "0.9rem", color: "var(--te-text-muted, #64748b)" }}>
                <span className="te-profile-label">Pre-professional track</span> {candidate.cohort}
              </p>
            )}
            <div className="te-profile-actions" style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
              {candidate.linkedin_url && (
                <a
                  href={candidate.linkedin_url.startsWith("http") ? candidate.linkedin_url : `https://${candidate.linkedin_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="te-bookmark-btn te-bookmark-btn-icon"
                  title="View LinkedIn profile"
                  aria-label="View LinkedIn profile"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              )}
              <div style={{ position: "relative" }} ref={collectionMenuRef}>
                <button
                  type="button"
                  className={`te-bookmark-btn te-bookmark-btn-icon${bookmarks.isSaved(candidate.candidate_id) ? " te-bookmark-btn--saved" : ""}`}
                  onClick={() => setCollectionMenuOpen((o) => !o)}
                  title={bookmarks.isSaved(candidate.candidate_id) ? "Bookmarked" : "Bookmark"}
                  aria-label={bookmarks.isSaved(candidate.candidate_id) ? "Bookmarked" : "Bookmark"}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {bookmarks.isSaved(candidate.candidate_id) ? (
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor" stroke="none" />
                    ) : (
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    )}
                  </svg>
                </button>
                <AnimatePresence>
                  {collectionMenuOpen && (
                    <ProfileBookmarkMenu
                      key="bookmark-menu"
                      candidateId={candidate.candidate_id}
                      bookmarks={bookmarks}
                      onClose={() => setCollectionMenuOpen(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
              <a
                href={`/p/${candidate.candidate_id}/full`}
                target="_blank"
                rel="noopener noreferrer"
                className="te-jdfit-btn"
                style={{ display: "inline-block" }}
              >
                View full Dilly profile →
              </a>
              <button
                type="button"
                className="te-jdfit-btn te-btn-ghost"
                onClick={handleExportShortlist}
                title="Export shortlist as ATS-ready CSV (Greenhouse, Lever, Bullhorn). Includes name, email, scores, Dilly profile link, fit summary."
              >
                Export to ATS
              </button>
            </div>
          </motion.div>
          {matchScore != null && (
            <motion.div
              className={`te-profile-match-hero${fitData ? ` te-profile-match-hero--${fitData.fit_level.toLowerCase().replace(/\s+/g, "-")}` : whyBadFitBullets ? " te-profile-match-hero--weak" : ""}`}
              variants={pop}
            >
              <span className="te-profile-match-value">{Math.round(matchScore)}%</span>
              <span className="te-profile-match-label">match to JD</span>
            </motion.div>
          )}
          <motion.div className="te-profile-score-blocks" variants={pop}>
            {(["smart", "grit", "build"] as const).map((key) => {
              const s = key === "smart" ? smart : key === "grit" ? grit : build;
              const c = scoreColor(s);
              const label = key.charAt(0).toUpperCase() + key.slice(1);
              return (
                <motion.div
                  key={key}
                  className="te-score-block"
                  style={{
                    borderColor: "var(--te-border)",
                    backgroundColor: c.bg,
                  }}
                  variants={pop}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <span className="te-score-block-label">{label}</span>
                  <span className="te-score-block-value" style={{ color: c.color }}>
                    {candidate[key] != null ? Math.round(candidate[key]!) : "—"}
                  </span>
                </motion.div>
              );
            })}
          </motion.div>
        </motion.div>

        {/* Two columns: left = why fit, right = what backs this up */}
        <motion.div className="te-profile-columns" variants={stagger} initial={false} animate="animate">
          <motion.div className="te-profile-col-left" variants={pop}>
            <h2 className={`te-section-title te-section-title-gold${fitData && (fitData.fit_level === "Standout" || fitData.fit_level === "Strong fit") ? ` te-fit-header--${fitData.fit_level === "Standout" ? "standout" : "strong-fit"}` : ""}${whyBadFitBullets ? " te-fit-header--weak" : ""}`}>
              {whyBadFitBullets
                ? `Why ${displayName} is a weak fit for this role`
                : fitData?.fit_level === "Standout"
                  ? `Why ${displayName} is a standout fit for this role`
                  : fitData?.fit_level === "Strong fit"
                    ? `Why ${displayName} is a strong fit for this role`
                    : `Why ${displayName} is a fit for this role`}
            </h2>
            <motion.ul className="te-why-fit-list" variants={stagger} initial={false} animate="animate">
              <AnimatePresence>
                {whyBullets.slice(0, 3).map((b) => (
                  <motion.li key={b} variants={pop} initial="initial" animate="animate" exit="exit">
                    <span className="te-bullet" aria-hidden="true">
                      •
                    </span>
                    <span className="te-bullet-text">{b}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>

            <AnimatePresence mode="wait">
              {jdEvidence.length > 0 ? (
                <motion.div
                  key="jdmap"
                  className="te-jd-evidence"
                  variants={pop}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  style={{ marginTop: "1.5rem" }}
                >
                  <div className="te-jdfit-label">JD-to-evidence</div>
                  <motion.ul className="te-jd-evidence-list" variants={stagger} initial={false} animate="animate">
                    <AnimatePresence>
                      {jdEvidence.slice(0, 10).map((item) => (
                        <motion.li
                          key={item.requirement}
                          className="te-jd-evidence-item"
                          variants={pop}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                        >
                          <span className={`te-status-dot te-status-${item.status}`} aria-hidden="true" />
                          <div className="te-jd-evidence-body">
                            <div className="te-jd-evidence-req">{item.requirement}</div>
                            {item.evidence && item.evidence.length > 0 && (
                              <ul className="te-jd-evidence-ev">
                                {item.evidence.slice(0, 2).map((ev) => (
                                  <li key={ev}>{ev}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </motion.ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
          <motion.div className="te-profile-col-right" variants={pop}>
            <h2 className="te-section-title te-section-title-gold">What from their experience backs this up</h2>
            <AnimatePresence mode="wait">
              {(() => {
                const hasRanking = structuredExp.some((e) => typeof e.relevance === "number");
                const relevant = hasRanking
                  ? structuredExp.filter((e) => typeof e.relevance === "number" && e.relevance >= 15)
                  : structuredExp;
                if (relevant.length === 0) {
                  return (
                    <motion.p key="norel" className="te-text-soft" variants={pop} initial="initial" animate="animate" exit="exit">
                      {hasRanking
                        ? "No relevant experience for this role."
                        : "No structured experience on file."}
                    </motion.p>
                  );
                }
                return (
                  <motion.div key="backs" className="te-backs-up-list" variants={stagger} initial="initial" animate="animate" exit="exit">
                    <AnimatePresence>
                      {relevant.map((entry) => (
                        <motion.div
                          key={`${entry.company}-${entry.role}-${entry.date}`}
                          className="te-highlight-box te-backs-up-entry"
                          variants={pop}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                        >
                          <div className="te-backs-up-role">
                            {[entry.role, entry.company].filter(Boolean).join(" · ") || "Experience"}
                          </div>
                          {(entry.date || entry.location) && (
                            <p className="te-backs-up-meta">
                              {[entry.date, entry.location].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          {entry.fit_reason && fitData && (fitData.fit_level === "Standout" || fitData.fit_level === "Strong fit" || fitData.fit_level === "Moderate fit") && (
                            <p className="te-exp-fit-reason">{entry.fit_reason}</p>
                          )}
                          {entry.matched_bullets && entry.matched_bullets.length > 0 ? (
                            <ul className="te-backs-up-bullets">
                              {entry.matched_bullets.slice(0, 3).map((bullet) => (
                                <li key={bullet}>{bullet}</li>
                              ))}
                            </ul>
                          ) : entry.bullets && entry.bullets.length > 0 ? (
                            <ul className="te-backs-up-bullets">
                              {entry.bullets.slice(0, 5).map((bullet) => (
                                <li key={bullet}>{bullet}</li>
                              ))}
                            </ul>
                          ) : null}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                );
              })()}
            </AnimatePresence>

            {/* Recruiter notes input and list */}
            <div className="te-recruiter-notes te-notes-input-block" style={{ marginTop: "2rem" }}>
              <h2 className="te-notes-heading">NOTES</h2>
              <div className="te-notes-field-wrap">
                <textarea
                  className="te-notes-textarea"
                  placeholder="e.g. Great culture fit, follow up in 2 weeks"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={4}
                />
                <button
                  type="button"
                  className="te-notes-save-btn"
                  onClick={async () => {
                    const t = noteDraft.trim();
                    if (t && (await notes.addEntry(t))) {
                      setNoteDraft("");
                    }
                  }}
                  disabled={notes.saving || !noteDraft.trim()}
                >
                  {notes.saving ? "Saving…" : "Save"}
                </button>
              </div>
              {notes.loading ? (
                <p className="te-text-soft" style={{ marginTop: "0.75rem" }}>Loading notes…</p>
              ) : notes.entries.length > 0 ? (
                <ul className="te-notes-entries-list" style={{ marginTop: "1rem" }}>
                  {[...notes.entries].reverse().map((e, i) => (
                    <li key={`${e.at}-${i}`} className="te-notes-entry">
                      <span className="te-notes-entry-text">{e.text}</span>
                      <span className="te-notes-entry-date">
                        {new Date(e.at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {(candidate.dilly_take ?? candidate.dilly_take) && !(candidate.why_fit_bullets && candidate.why_fit_bullets.length > 0) && !(candidate.why_bad_fit_bullets && candidate.why_bad_fit_bullets.length > 0) && (
            <motion.div
              key="take"
              className="te-dilly-take-fallback"
              variants={pop}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="te-jdfit-label">Dilly take</div>
              <p className="te-text-soft">{candidate.dilly_take ?? candidate.dilly_take}</p>
            </motion.div>
          )}
        </AnimatePresence>
        {candidate.application_target && (
          <p className="te-meta">Target: {candidate.application_target.replace(/_/g, " ")}</p>
        )}
        {candidate.job_locations?.length > 0 && (
          <p className="te-meta">Locations: {candidate.job_locations.join(", ")}</p>
        )}
        <p className="te-meta" style={{ marginBottom: "1.5rem" }}>
          Contact: Use <strong>Reach out</strong> to email them via Dilly.
        </p>

        <div className="te-btn-row">
          <button
            type="button"
            className="te-btn"
            onClick={() => handleFeedback("shortlist")}
            disabled={!!feedbackSending}
          >
            {feedbackSending === "shortlist" ? "…" : "Shortlist"}
          </button>
          <button
            type="button"
            className="te-btn te-btn-ghost"
            onClick={() => handleFeedback("pass")}
            disabled={!!feedbackSending}
          >
            {feedbackSending === "pass" ? "…" : "Pass"}
          </button>
          <button
            type="button"
            className="te-btn te-btn-ghost"
            onClick={openReachOut}
            disabled={reachOutSending}
          >
            {reachOutSending ? "…" : "Reach out"}
          </button>
        </div>

        <AskAIChat
          candidateId={candidate.candidate_id}
          candidateName={displayName}
          roleDescription={getRoleDescriptionFromSearchState()}
        />
      </div>
      </motion.section>
      </div>

      <AnimatePresence>
        {reachOutOpen && (
          <motion.div
            key="reachout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.62)",
              zIndex: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Reach out to candidate"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeReachOut();
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="te-highlight-box"
              style={{
                width: "min(720px, 100%)",
                border: "1px solid var(--te-border)",
                background: "rgba(6, 16, 37, 0.98)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                <div>
                  <div className="te-jdfit-label">Recruiter outreach</div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: "0.25rem" }}>
                    Reach out to {displayName}
                  </div>
                </div>
                <button type="button" className="te-btn te-btn-ghost" onClick={closeReachOut} disabled={reachOutSending}>
                  Close
                </button>
              </div>

              <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <div className="te-jdfit-label">Recruiter email</div>
                  <input
                    value={reachOutRecruiterEmail}
                    onChange={(e) => setReachOutRecruiterEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="te-search-input"
                    style={{ width: "100%", marginTop: "0.35rem" }}
                    disabled={reachOutSending}
                  />
                </div>
                <div>
                  <div className="te-jdfit-label">Recruiter name (optional)</div>
                  <input
                    value={reachOutRecruiterName}
                    onChange={(e) => setReachOutRecruiterName(e.target.value)}
                    placeholder="Jordan Smith"
                    className="te-search-input"
                    style={{ width: "100%", marginTop: "0.35rem" }}
                    disabled={reachOutSending}
                  />
                </div>
                <div>
                  <div className="te-jdfit-label">Company (optional)</div>
                  <input
                    value={reachOutCompany}
                    onChange={(e) => setReachOutCompany(e.target.value)}
                    placeholder="Acme"
                    className="te-search-input"
                    style={{ width: "100%", marginTop: "0.35rem" }}
                    disabled={reachOutSending}
                  />
                </div>
                <div>
                  <div className="te-jdfit-label">Job title (optional)</div>
                  <input
                    value={reachOutJobTitle}
                    onChange={(e) => setReachOutJobTitle(e.target.value)}
                    placeholder="Software Intern"
                    className="te-search-input"
                    style={{ width: "100%", marginTop: "0.35rem" }}
                    disabled={reachOutSending}
                  />
                </div>
              </div>

              <div style={{ marginTop: "0.9rem" }}>
                <div className="te-jdfit-label">Message</div>
                <textarea
                  value={reachOutMessage}
                  onChange={(e) => setReachOutMessage(e.target.value)}
                  placeholder="Write a short intro and what you'd like to learn about them..."
                  className="te-search-textarea"
                  style={{ width: "100%", marginTop: "0.35rem", minHeight: 140, resize: "vertical" }}
                  disabled={reachOutSending}
                />
                <div className="te-text-soft" style={{ marginTop: "0.35rem", fontSize: "0.78rem" }}>
                  Reply-to will be your email. The student can respond by replying to Dilly’s email.
                </div>
              </div>

              {reachOutError && (
                <div style={{ color: "#f87171", marginTop: "0.75rem" }}>{reachOutError}</div>
              )}
              {reachOutSuccess && (
                <div style={{ color: "rgba(253,185,19,0.95)", marginTop: "0.75rem" }}>
                  Sent. If they’re interested, they’ll reply to your email.
                </div>
              )}

              <div className="te-btn-row" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="te-btn"
                  onClick={handleSendReachOut}
                  disabled={reachOutSending || reachOutSuccess}
                >
                  {reachOutSending ? "Sending…" : reachOutSuccess ? "Sent" : "Send email"}
                </button>
                <button type="button" className="te-btn te-btn-ghost" onClick={closeReachOut} disabled={reachOutSending}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}
