"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE, RECRUITER_API_KEY_STORAGE } from "@/lib/dillyUtils";
import { useRecruiterBookmarks } from "@/hooks/useRecruiterBookmarks";
import { Search, Bookmark, BookmarkCheck, ChevronRight, GraduationCap, MapPin, Sparkles, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type FitLevel = "Standout" | "Strong fit" | "Good fit" | "Partial fit" | "Weak fit" | string;

type Candidate = {
  candidate_id: string;
  email: string;
  name: string;
  major: string;
  majors: string[];
  school_id: string;
  track: string;
  // Fit signals — the only signals that matter now
  fit_level?: FitLevel | null;
  rerank_reason?: string | null;
  match_score?: number | null;
  // Profile depth signals
  dilly_take?: string | null;
  fact_count?: number | null;
  conversation_count?: number | null;
};

type FitFilter = "all" | "green" | "amber" | "red";

const FIT_LEVEL_COLOR: Record<string, FitFilter> = {
  "Standout":    "green",
  "Strong fit":  "green",
  "Good fit":    "amber",
  "Partial fit": "amber",
  "Weak fit":    "red",
};

function fitColor(level?: FitLevel | null): FitFilter {
  if (!level) return "all";
  return FIT_LEVEL_COLOR[level] ?? "amber";
}

function fitLabel(level?: FitLevel | null): string {
  if (!level) return "Not scored";
  return level;
}

const SEARCH_STATE_KEY = "dilly_recruiter_search_state";

function getRecruiterKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(RECRUITER_API_KEY_STORAGE);
}

function initial(name: string): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function profileDepth(c: Candidate): { label: string; cls: string } {
  const facts = c.fact_count ?? 0;
  const convos = c.conversation_count ?? 0;
  if (facts >= 30 || convos >= 3) return { label: "Rich profile", cls: "dr-profile-depth--rich" };
  if (facts >= 10 || convos >= 1) return { label: "Growing profile", cls: "dr-profile-depth--growing" };
  return { label: "Early profile", cls: "" };
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const _photoBust = Math.floor(Date.now() / 60000);

function CandidateAvatar({ candidateId, name }: { candidateId: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="dr-avatar">
      {!failed && (
        <img
          src={`${API_BASE}/profile/public/${candidateId}/photo?v=${_photoBust}`}
          alt=""
          onError={() => setFailed(true)}
        />
      )}
      {failed && <span>{initial(name)}</span>}
    </div>
  );
}

// ─── Fit badge ────────────────────────────────────────────────────────────────

function FitBadge({ level }: { level?: FitLevel | null }) {
  const color = fitColor(level);
  const colorCls =
    color === "green" ? "dr-fit-badge--green" :
    color === "amber" ? "dr-fit-badge--amber" :
    color === "red"   ? "dr-fit-badge--red"   : "dr-fit-badge--none";
  const dotCls =
    color === "green" ? "dr-fit-dot--green" :
    color === "amber" ? "dr-fit-dot--amber" :
    color === "red"   ? "dr-fit-dot--red"   : "dr-fit-dot--none";
  return (
    <span className={`dr-fit-badge ${colorCls}`}>
      <span className={`dr-fit-dot ${dotCls}`} />
      {fitLabel(level)}
    </span>
  );
}

// ─── Bookmark button ──────────────────────────────────────────────────────────

function BookmarkBtn({
  candidateId,
  bookmarks,
}: {
  candidateId: string;
  bookmarks: ReturnType<typeof useRecruiterBookmarks>;
}) {
  const saved = bookmarks.isSaved(candidateId);
  return (
    <button
      type="button"
      className={`dr-btn dr-btn--icon dr-btn--outline${saved ? " dr-btn--saved" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        bookmarks.toggleBookmark(candidateId);
      }}
      title={saved ? "Remove bookmark" : "Bookmark"}
      aria-label={saved ? "Remove bookmark" : "Bookmark"}
    >
      {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
    </button>
  );
}

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  bookmarks,
}: {
  candidate: Candidate;
  bookmarks: ReturnType<typeof useRecruiterBookmarks>;
}) {
  const color = fitColor(candidate.fit_level);
  const colorCls =
    color === "green" ? "dr-candidate-card--green" :
    color === "amber" ? "dr-candidate-card--amber" :
    color === "red"   ? "dr-candidate-card--red"   : "";
  const depth = profileDepth(candidate);
  const school = candidate.school_id?.replace(/_/g, " ") ?? "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <Link href={`/recruiter/candidates/${candidate.candidate_id}`} style={{ textDecoration: "none" }}>
        <div className={`dr-candidate-card ${colorCls}`}>
          <div className="dr-card-main">
            <CandidateAvatar candidateId={candidate.candidate_id} name={candidate.name} />

            <div className="dr-card-body">
              <div className="dr-card-top">
                <span className="dr-card-name">{candidate.name || "—"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <FitBadge level={candidate.fit_level} />
                  <BookmarkBtn candidateId={candidate.candidate_id} bookmarks={bookmarks} />
                </div>
              </div>

              <div className="dr-card-meta">
                {candidate.majors?.length > 0 || candidate.major ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <GraduationCap size={11} />
                    {(candidate.majors?.length > 0 ? candidate.majors[0] : candidate.major)}
                    {school ? <><span className="dr-card-meta-sep">·</span>{school}</> : null}
                  </span>
                ) : school ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <GraduationCap size={11} />
                    {school}
                  </span>
                ) : null}
              </div>

              {/* Dilly's take — the primary signal, not a score */}
              {candidate.rerank_reason ? (
                <p className="dr-card-take">{candidate.rerank_reason}</p>
              ) : candidate.dilly_take ? (
                <p className="dr-card-take">{candidate.dilly_take}</p>
              ) : null}

              <div className="dr-card-footer">
                <span className={`dr-profile-depth ${depth.cls}`}>
                  <Sparkles size={10} />
                  {depth.label}
                </span>
                <span
                  className="dr-btn dr-btn--sm dr-btn--outline"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                >
                  View profile <ChevronRight size={13} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Bookmarks sidebar ────────────────────────────────────────────────────────

function BookmarksSidebar({
  bookmarks,
  apiKey,
}: {
  bookmarks: ReturnType<typeof useRecruiterBookmarks>;
  apiKey: string | null;
}) {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = [...bookmarks.bookmarks, ...Object.values(bookmarks.collections).flat()]
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, 60);
    if (!ids.length) { setNames({}); return; }
    const headers: Record<string, string> = {};
    if (apiKey) { headers["X-Recruiter-API-Key"] = apiKey; headers["Authorization"] = `Bearer ${apiKey}`; }
    fetch(`${API_BASE}/recruiter/candidates/batch?ids=${encodeURIComponent(ids.join(","))}`, { headers })
      .then(r => r.ok ? r.json() : { candidates: [] })
      .then(d => {
        const m: Record<string, string> = {};
        for (const c of d.candidates ?? []) if (c.candidate_id) m[c.candidate_id] = c.name || "—";
        setNames(m);
      })
      .catch(() => setNames({}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, bookmarks.bookmarks.join(",")]);

  return (
    <aside className="dr-sidebar">
      <div className="dr-sidebar-card">
        <p className="dr-sidebar-title">Bookmarks</p>
        {bookmarks.bookmarks.length === 0 ? (
          <p className="dr-sidebar-placeholder">
            Bookmark candidates from their card to save them here.
          </p>
        ) : (
          <ul className="dr-bookmark-list">
            {bookmarks.bookmarks.map(id => (
              <li key={id}>
                <Link href={`/recruiter/candidates/${id}`} className="dr-bookmark-link">
                  {names[id] || id}
                </Link>
                <button
                  type="button"
                  className="dr-bookmark-remove"
                  onClick={() => bookmarks.removeBookmark(id)}
                  aria-label="Remove"
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {Object.keys(bookmarks.collections).length > 0 && (
        <div className="dr-sidebar-card">
          <p className="dr-sidebar-title">Collections</p>
          {Object.entries(bookmarks.collections).map(([name, ids]) => (
            <div key={name} style={{ marginBottom: "0.75rem" }}>
              <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--dr-text)", marginBottom: "0.3rem" }}>{name}</p>
              <ul className="dr-bookmark-list">
                {ids.map(id => (
                  <li key={id}>
                    <Link href={`/recruiter/candidates/${id}`} className="dr-bookmark-link">
                      {names[id] || id}
                    </Link>
                    <button
                      type="button"
                      className="dr-bookmark-remove"
                      onClick={() => bookmarks.removeFromCollection(name, id)}
                      aria-label="Remove"
                    >×</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RecruiterPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [roleDescription, setRoleDescription] = useState("");
  const [submittedRole, setSubmittedRole] = useState("");
  const [interpretedAs, setInterpretedAs] = useState<string | null>(null);
  const [fitFilter, setFitFilter] = useState<FitFilter>("all");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 30;
  const bookmarks = useRecruiterBookmarks();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setApiKey(getRecruiterKey());
    const handler = () => setApiKey(getRecruiterKey());
    window.addEventListener("recruiter-key-changed", handler);
    return () => window.removeEventListener("recruiter-key-changed", handler);
  }, []);

  const search = useCallback(async (role: string, off = 0) => {
    const key = getRecruiterKey();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) { headers["X-Recruiter-API-Key"] = key; headers["Authorization"] = `Bearer ${key}`; }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/recruiter/search`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          role_description: role.trim(),
          sort: "match_score",
          limit,
          offset: off,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const msg = (d as { detail?: string })?.detail || res.statusText || "Search failed";
        setError(typeof msg === "string" ? msg : "Search failed");
        setCandidates([]);
        setTotal(0);
        return;
      }

      const data = await res.json();
      const list: Candidate[] = data.candidates ?? [];
      setCandidates(list);
      setTotal(data.total ?? list.length);
      setInterpretedAs(data.interpreted_as ?? null);
      setOffset(off);

      // Persist for candidate detail page context
      try {
        sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({ roleDescription: role, candidates: list }));
      } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(() => {
    const role = roleDescription.trim();
    if (!role) return;
    setSubmittedRole(role);
    setFitFilter("all");
    search(role, 0);
  }, [roleDescription, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSearch();
  };

  // Filtered + sorted candidates (client-side by fit color)
  const filtered = candidates.filter(c => {
    if (fitFilter === "all") return true;
    return fitColor(c.fit_level) === fitFilter;
  });

  const countByColor = (col: FitFilter) => candidates.filter(c => fitColor(c.fit_level) === col).length;

  const pop = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
    exit:    { opacity: 0, y: -4, transition: { duration: 0.15 } },
  } as const;

  return (
    <div className="dr-page">
      {/* Header */}
      <div className="dr-page-header">
        <h1 className="dr-page-title">Candidate Search</h1>
        <p className="dr-page-subtitle">
          Dilly reads the full profile, not just the resume.
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div className="dr-search-wrap">
          <div className="dr-search-field">
            <Search size={15} className="dr-search-icon" />
            <textarea
              ref={inputRef}
              className="dr-search-input"
              style={{ paddingTop: "0.7rem", resize: "none", minHeight: "44px", lineHeight: "1.5" }}
              placeholder="Describe the role — paste a JD, a sentence, or just a job title…"
              value={roleDescription}
              onChange={e => setRoleDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={roleDescription.split("\n").length > 2 ? 4 : 2}
            />
          </div>
          <button
            className="dr-search-btn"
            onClick={handleSearch}
            disabled={loading || !roleDescription.trim()}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        {roleDescription.length > 10 && (
          <p style={{ fontSize: "0.75rem", color: "var(--dr-text-muted)", marginTop: "0.3rem" }}>
            Tip: Paste the full job description for the most accurate fit signals.
          </p>
        )}
      </div>

      {/* Interpreted-as banner */}
      <AnimatePresence>
        {interpretedAs && submittedRole && (
          <motion.div className="dr-interpreted-banner" {...pop}>
            <span className="dr-interpreted-text">
              Searching for: <em>{interpretedAs}</em>
            </span>
            <button
              type="button"
              className="dr-btn dr-btn--ghost dr-btn--sm"
              onClick={() => setInterpretedAs(null)}
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div className="dr-error-msg" style={{ marginBottom: "1rem" }} {...pop}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="dr-layout">
        {/* Main column */}
        <div>
          {/* Loading skeletons */}
          {loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="dr-skeleton" style={{ height: 120 }} />
              ))}
            </div>
          )}

          {/* Results */}
          {!loading && candidates.length > 0 && (
            <>
              {/* Fit filter tabs */}
              <div className="dr-fit-tabs">
                {(["all", "green", "amber", "red"] as FitFilter[]).map(tab => {
                  const count =
                    tab === "all"   ? candidates.length :
                    tab === "green" ? countByColor("green") :
                    tab === "amber" ? countByColor("amber") :
                                     countByColor("red");
                  const label =
                    tab === "all"   ? "All" :
                    tab === "green" ? "Strong Fit" :
                    tab === "amber" ? "Partial Fit" :
                                     "Weak Fit";
                  const dotCls =
                    tab === "green" ? "dr-fit-dot--green" :
                    tab === "amber" ? "dr-fit-dot--amber" :
                    tab === "red"   ? "dr-fit-dot--red"   : "dr-fit-dot--none";
                  const tabColorCls =
                    tab === "green" ? "dr-fit-tab--green" :
                    tab === "amber" ? "dr-fit-tab--amber" :
                    tab === "red"   ? "dr-fit-tab--red"   : "";
                  return (
                    <button
                      key={tab}
                      type="button"
                      className={`dr-fit-tab ${tabColorCls} ${fitFilter === tab ? "dr-fit-tab--active" : ""}`}
                      onClick={() => setFitFilter(tab)}
                    >
                      {tab !== "all" && <span className={`dr-fit-dot ${dotCls}`} />}
                      {label}
                      <span style={{
                        fontWeight: 400,
                        opacity: 0.7,
                        fontSize: "0.75rem",
                      }}>({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Results count */}
              <div className="dr-results-bar">
                <p className="dr-results-count">
                  Showing <strong>{filtered.length}</strong> of <strong>{total}</strong> candidates
                  {submittedRole ? ` for "${submittedRole.slice(0, 60)}${submittedRole.length > 60 ? "…" : ""}"` : ""}
                </p>
              </div>

              {/* Cards */}
              <AnimatePresence mode="popLayout">
                <div className="dr-card-list">
                  {filtered.map(c => (
                    <CandidateCard key={c.candidate_id} candidate={c} bookmarks={bookmarks} />
                  ))}
                </div>
              </AnimatePresence>

              {/* Pagination */}
              {total > limit && (
                <div className="dr-pagination">
                  <button
                    type="button"
                    className="dr-btn dr-btn--outline dr-btn--sm"
                    onClick={() => search(submittedRole, Math.max(0, offset - limit))}
                    disabled={offset === 0 || loading}
                  >
                    Previous
                  </button>
                  <span className="dr-pagination-info">
                    {Math.floor(offset / limit) + 1} / {Math.ceil(total / limit)}
                  </span>
                  <button
                    type="button"
                    className="dr-btn dr-btn--outline dr-btn--sm"
                    onClick={() => search(submittedRole, offset + limit)}
                    disabled={offset + limit >= total || loading}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}

          {/* Empty — no search yet */}
          {!loading && candidates.length === 0 && !error && (
            <div className="dr-empty">
              <div className="dr-empty-icon">
                <Search size={22} />
              </div>
              <p className="dr-empty-title">Describe the role to get started</p>
              <p className="dr-empty-body">
                Paste a job description, a sentence about what you need, or just a job title.
                Dilly reads every candidate's full profile and surfaces who actually fits.
              </p>
            </div>
          )}

          {/* Empty — searched but no results */}
          {!loading && candidates.length === 0 && submittedRole && !error && (
            <div className="dr-empty">
              <p className="dr-empty-title">No candidates found</p>
              <p className="dr-empty-body">Try a broader role description or different keywords.</p>
            </div>
          )}
        </div>

        {/* Bookmarks sidebar */}
        <BookmarksSidebar bookmarks={bookmarks} apiKey={apiKey} />
      </div>
    </div>
  );
}
