"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  Rectangle,
} from "recharts";
import { API_BASE, RECRUITER_API_KEY_STORAGE } from "@/lib/dillyUtils";
import { useRecruiterBookmarks } from "@/hooks/useRecruiterBookmarks";
import { RecruiterSearchVoice } from "@/components/recruiter/RecruiterSearchVoice";
import { CompareAskAIChat } from "@/components/recruiter/CompareAskAIChat";

const RECRUITER_SEARCH_STATE_KEY = "dilly_recruiter_search_state";

type Candidate = {
  candidate_id: string;
  email: string;
  name: string;
  major: string;
  majors: string[];
  school_id: string;
  track: string;
  smart: number;
  grit: number;
  build: number;
  final_score: number;
  match_score: number;
  semantic_score: number;
  skill_fit_score: number;
  dilly_fit_score: number;
  rerank_score?: number | null;
  rerank_reason?: string | null;
  fit_level?: string | null;
  /** Peer “top %” (1–100; lower = stronger vs cohort). From API when available. */
  top_pct_sgb?: number | null;
  top_pct_final?: number | null;
  top_pct_ats?: number | null;
  top_pct_general?: number | null;
};

type JdFit = {
  smart_min: number;
  grit_min: number;
  build_min: number;
  min_final_score: number;
  track: string | null;
  signals: string[];
  unavailable: boolean;
};

const SORT_OPTIONS = [
  { value: "match_score", label: "Best match" },
  { value: "top_pct", label: "Top %" },
  { value: "smart", label: "Smart" },
  { value: "grit", label: "Grit" },
  { value: "build", label: "Build" },
  { value: "final_score", label: "Final score" },
  { value: "major", label: "Major" },
  { value: "school", label: "School" },
] as const;

const TOP_PCT_BY_OPTIONS = [
  { value: "sgb", label: "Smart · Grit · Build", api: "top_pct_sgb" as const },
  { value: "final", label: "Final", api: "top_pct_final" as const },
  { value: "ats", label: "ATS", api: "top_pct_ats" as const },
  { value: "general", label: "General", api: "top_pct_general" as const },
] as const;

function topPctApiValue(by: (typeof TOP_PCT_BY_OPTIONS)[number]["value"]): string {
  return TOP_PCT_BY_OPTIONS.find((o) => o.value === by)?.api ?? "top_pct_sgb";
}

function parseTopPctSort(sort: string): { by: (typeof TOP_PCT_BY_OPTIONS)[number]["value"] } | null {
  const m = TOP_PCT_BY_OPTIONS.find((o) => o.api === sort);
  return m ? { by: m.value } : null;
}

const TRACK_OPTIONS = ["Tech", "Pre-Health", "Pre-Law", "Humanities", "Business", "STEM", "Other"];

function getRecruiterKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(RECRUITER_API_KEY_STORAGE);
}

function initial(name: string): string {
  if (!name || !name.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Parse markdown-style comparison (## Header, - bullet) into sections. Fallback to raw text if no ##. */
function CompareAnalysisText({ text }: { text: string }) {
  const sections = parseCompareSections(text);
  if (sections.length === 0) {
    return <div className="te-compare-analysis-text">{text}</div>;
  }
  return (
    <div className="te-compare-analysis-sections">
      {sections.map((s, i) => (
        <section key={i} className={`te-compare-section te-compare-section--${i % 5}`}>
          <h4 className="te-compare-section-header">{s.header}</h4>
          <ul className="te-compare-bullets">
            {s.bullets.map((b, j) => (
              <li key={j}>{b}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function parseCompareSections(text: string): { header: string; bullets: string[] }[] {
  if (!text || !text.includes("##")) return [];
  const parts = text.split(/(?=^##\s)/m);
  const sections: { header: string; bullets: string[] }[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const headerMatch = trimmed.match(/^##\s+(.+?)(?:\n|$)/);
    const header = headerMatch ? headerMatch[1].trim() : "";
    const body = headerMatch ? trimmed.slice(trimmed.indexOf("\n") + 1) : trimmed;
    const bullets = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[-•]\s*/.test(line))
      .map((line) => line.replace(/^[-•]\s*/, "").trim())
      .filter((line) => line.length > 0);
    if (header || bullets.length > 0) {
      sections.push({ header: header || "Summary", bullets });
    }
  }
  return sections;
}

function CompareRecommendationBullets({ bullets }: { bullets: string[] }) {
  if (!bullets.length) return null;
  return (
    <div className="te-compare-recommendations">
      <h4 className="te-compare-recommendations-title">Dilly recommendations</h4>
      <ul className="te-compare-recommendations-list">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

const TE_COMPARE_TEAL = "#5eead4";
const TE_COMPARE_CORAL = "#fda4af";

const COMPARE_METRICS = [
  { key: "Smart", getVal: (c: Candidate) => c.smart ?? 0, desc: "Academic rigor, coursework, and intellectual readiness." },
  { key: "Grit", getVal: (c: Candidate) => c.grit ?? 0, desc: "Leadership, impact, and perseverance." },
  { key: "Build", getVal: (c: Candidate) => c.build ?? 0, desc: "Track readiness and relevant experience." },
  { key: "Semantic", getVal: (c: Candidate) => c.semantic_score ?? 0, desc: "Resume–job description similarity from embeddings." },
  { key: "Skill fit", getVal: (c: Candidate) => c.skill_fit_score ?? 0, desc: "Overlap of skills with role requirements." },
  { key: "Dilly fit", getVal: (c: Candidate) => c.dilly_fit_score ?? 0, desc: "Alignment with Smart, Grit, and Build requirements." },
  { key: "Match", getVal: (c: Candidate) => c.match_score ?? 0, desc: "Overall fit blend for this role." },
] as const;

const CHART_HEIGHT = 520;

function CompareBarShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { type?: string; metric?: string; bar?: string };
  fill?: string;
  selectedMetric?: string | null;
  chartHeight?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload, fill, selectedMetric, chartHeight = CHART_HEIGHT } = props;
  const isSelected = payload?.metric === selectedMetric;
  const rowCount = 21;
  const rowHeight = chartHeight / rowCount;
  const bandHeight = rowHeight * 2.9;
  if (payload?.type === "label") {
    return (
      <g>
        {isSelected && (
          <rect
            x={0}
            y={y}
            width={400}
            height={bandHeight}
            fill="rgba(var(--te-gold-rgb), 0.08)"
            rx={4}
          />
        )}
        <text
          x={x}
          y={(y ?? 0) + (height ?? 0) / 2}
          dy="0.35em"
          fill="var(--te-text-muted)"
          fontSize={11}
          fontWeight={700}
        >
          {payload.metric}
        </text>
      </g>
    );
  }
  return (
    <Rectangle
      x={x}
      y={y}
      width={Math.max(0, width ?? 0)}
      height={height ?? 0}
      fill={fill}
      radius={[0, 6, 6, 0]}
    />
  );
}

function CompareVisualizations({ candidates, retracting }: { candidates: [Candidate, Candidate]; retracting?: boolean }) {
  const [a, b] = candidates;
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const nameA = (a.name || "Candidate A").split(/\s+/)[0];
  const nameB = (b.name || "Candidate B").split(/\s+/)[0];
  const data = COMPARE_METRICS.flatMap((m) => {
    const valA = retracting ? 0 : Math.round(m.getVal(a));
    const valB = retracting ? 0 : Math.round(m.getVal(b));
    return [
      { rowKey: `${m.key}-label`, metric: m.key, value: 0, type: "label" as const },
      { rowKey: `${m.key}-a`, metric: m.key, value: valA, type: "bar" as const, bar: "A" as const },
      { rowKey: `${m.key}-b`, metric: m.key, value: valB, type: "bar" as const, bar: "B" as const },
    ];
  });
  const metricInfo = selectedMetric ? COMPARE_METRICS.find((m) => m.key === selectedMetric) : null;
  const valA = metricInfo ? Math.round(metricInfo.getVal(a)) : 0;
  const valB = metricInfo ? Math.round(metricInfo.getVal(b)) : 0;
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(CHART_HEIGHT);
  useLayoutEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setChartHeight(el.offsetHeight);
    });
    ro.observe(el);
    setChartHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [selectedMetric]);
  const handleChartClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const rowCount = 21;
    const halfRow = chartHeight / rowCount / 2;
    const rowIndex = Math.floor(((y + halfRow) / chartHeight) * rowCount);
    const metricIndex = Math.floor(rowIndex / 3);
    if (metricIndex >= 0 && metricIndex < COMPARE_METRICS.length) {
      const metric = COMPARE_METRICS[metricIndex].key;
      setSelectedMetric((prev) => (prev === metric ? null : metric));
    }
  };
  return (
    <div className="te-compare-visualizations">
      <h3 className="te-compare-visualizations-title">Score breakdown</h3>
      <motion.div
        ref={chartRef}
        layout
        transition={{ type: "tween", duration: 0.35, ease: "easeInOut" }}
        className={`te-compare-visualizations-chart${selectedMetric ? " te-compare-visualizations-chart--with-description" : ""}`}
        onClick={handleChartClick}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }} barCategoryGap="12%" barGap={8} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--te-border)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--te-text-muted)" }} tickFormatter={(v) => String(v)} axisLine={false} tickLine={false} width={32} />
            <YAxis type="category" dataKey="rowKey" tick={false} axisLine={false} tickLine={false} width={0} />
            <Legend content={() => (
              <div className="te-compare-legend" style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: TE_COMPARE_TEAL }} />
                  {nameA}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: TE_COMPARE_CORAL }} />
                  {nameB}
                </span>
              </div>
            )} />
            <Bar
              dataKey="value"
              fill={TE_COMPARE_TEAL}
              isAnimationActive
              animationDuration={600}
              animationBegin={100}
              shape={(props: React.ComponentProps<typeof CompareBarShape>) => <CompareBarShape {...props} selectedMetric={selectedMetric} chartHeight={chartHeight} />}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.type === "label" ? "transparent" : entry.bar === "A" ? TE_COMPARE_TEAL : TE_COMPARE_CORAL} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
      <AnimatePresence>
        {selectedMetric && metricInfo && (
          <motion.div
            className="te-compare-explanation"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
          >
            <h4 className="te-compare-explanation-title">{selectedMetric}</h4>
            <p className="te-compare-explanation-desc">{metricInfo.desc}</p>
            <p className="te-compare-explanation-scores">
              <strong>{nameA}</strong> scored {valA} · <strong>{nameB}</strong> scored {valB}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Normalize API error payload to a string (handles detail as string, { code, message }, or 422 array). */
function apiErrorString(data: unknown, fallback: string): string {
  if (data == null || typeof data !== "object") return fallback;
  const obj = data as Record<string, unknown>;
  const d = obj.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d.length > 0) {
    const first = d[0] as Record<string, unknown> | undefined;
    if (first && typeof first.msg === "string") return first.msg;
  }
  if (d && typeof d === "object" && typeof (d as Record<string, unknown>).message === "string") {
    return (d as Record<string, unknown>).message as string;
  }
  if (typeof obj.error === "string") return obj.error;
  if (typeof obj.message === "string") return obj.message;
  return fallback;
}

const _photoCacheBust = Math.floor(Date.now() / 60000);

type CollectionBlockProps = {
  name: string;
  ids: string[];
  candidateNames: Record<string, string>;
  bookmarks: ReturnType<typeof useRecruiterBookmarks>;
};

function CollectionBlock({ name, ids, candidateNames, bookmarks }: CollectionBlockProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      setEditValue(name);
      return;
    }
    const ok = await bookmarks.renameCollection(name, trimmed);
    setEditing(false);
    setEditValue(ok ? trimmed : name);
  }, [editValue, name, bookmarks]);

  const handleBlur = useCallback(() => {
    blurRef.current = setTimeout(() => {
      blurRef.current = null;
      handleSave();
    }, 150);
  }, [handleSave]);

  const handleFocus = useCallback(() => {
    if (blurRef.current) {
      clearTimeout(blurRef.current);
      blurRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (blurRef.current) clearTimeout(blurRef.current);
  }, []);

  return (
    <div className="te-collection-block">
      <div className="te-collection-header">
        {editing ? (
          <span className="te-collection-edit-wrap">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              onFocus={handleFocus}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (blurRef.current) {
                    clearTimeout(blurRef.current);
                    blurRef.current = null;
                  }
                  handleSave();
                }
                if (e.key === "Escape") {
                  if (blurRef.current) {
                    clearTimeout(blurRef.current);
                    blurRef.current = null;
                  }
                  setEditValue(name);
                  setEditing(false);
                }
              }}
              className="te-collection-name-input"
              autoFocus
            />
            <button
              type="button"
              className="te-collection-save-btn"
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurRef.current) {
                  clearTimeout(blurRef.current);
                  blurRef.current = null;
                }
                handleSave();
              }}
              title="Save"
              aria-label="Save"
            >
              ✓
            </button>
          </span>
        ) : (
          <span className="te-collection-name-wrap">
            <span className="te-collection-name">{name}</span>
            <button
              type="button"
              className="te-collection-edit-btn"
              onClick={() => {
                setEditValue(name);
                setEditing(true);
              }}
              title="Rename collection"
              aria-label="Rename collection"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M17.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          </span>
        )}
        {!editing && (
          <button
            type="button"
            className="te-bookmark-remove"
            onClick={() => bookmarks.deleteCollection(name)}
            aria-label={`Delete ${name}`}
          >
            ×
          </button>
        )}
      </div>
      <ul className="te-bookmarks-list">
        {ids.map((cid) => (
          <li key={cid}>
            <Link href={`/recruiter/candidates/${cid}`} className="te-bookmark-link">
              {candidateNames[cid] || cid}
            </Link>
            <button
              type="button"
              className="te-bookmark-remove"
              onClick={() => bookmarks.removeFromCollection(name, cid)}
              aria-label="Remove from collection"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type BookmarksSidebarProps = {
  bookmarks: ReturnType<typeof useRecruiterBookmarks>;
  apiKey: string | null;
};

type AddToCollectionModalProps = {
  candidateId: string;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  bookmarks: ReturnType<typeof useRecruiterBookmarks>;
};

function AddToCollectionModal({ candidateId, anchor, onClose, bookmarks }: AddToCollectionModalProps) {
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
    onClose();
  };

  const handleCreateNew = async () => {
    const name = newName.trim();
    if (!name) return;
    await handleAdd(name);
    setNewName("");
  };

  if (!anchor) return null;
  const handleToggleBookmark = async () => {
    await bookmarks.toggleBookmark(candidateId);
    onClose();
  };

  return (
    <div
      ref={ref}
      className="te-collection-modal"
      style={{ left: anchor.x, top: anchor.y }}
    >
      <div className="te-collection-modal-inner">
        <button
          type="button"
          className="te-bookmark-menu-toggle"
          onClick={handleToggleBookmark}
        >
          {bookmarks.isSaved(candidateId) ? "Remove from General Bookmarks" : "Add to General Bookmarks"}
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
    </div>
  );
}

function BookmarksSidebar({ bookmarks, apiKey }: BookmarksSidebarProps) {
  const [candidateNames, setCandidateNames] = useState<Record<string, string>>({});
  const [candidatesWithNotes, setCandidatesWithNotes] = useState<Record<string, number>>({});
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  const allIds = [
    ...bookmarks.bookmarks,
    ...Object.values(bookmarks.collections).flat(),
  ].filter((id, i, arr) => arr.indexOf(id) === i);

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["X-Recruiter-API-Key"] = apiKey;
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    fetch(`${API_BASE}/recruiter/notes/candidates`, { headers })
      .then((res) => (res.ok ? res.json() : { candidates: [] }))
      .then((d) => {
        const map: Record<string, number> = {};
        for (const c of d.candidates || []) {
          if (c.candidate_id && (c.count ?? 0) > 0) map[c.candidate_id] = c.count;
        }
        setCandidatesWithNotes(map);
      })
      .catch(() => setCandidatesWithNotes({}));
  }, [apiKey]);

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["X-Recruiter-API-Key"] = apiKey;
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const idsToFetch = [...new Set([...allIds, ...Object.keys(candidatesWithNotes)])].slice(0, 80);
    if (idsToFetch.length === 0) {
      setCandidateNames({});
      return;
    }
    fetch(`${API_BASE}/recruiter/candidates/batch?ids=${encodeURIComponent(idsToFetch.join(","))}`, { headers })
      .then((res) => (res.ok ? res.json() : { candidates: [] }))
      .then((data) => {
        const map: Record<string, string> = {};
        for (const c of data.candidates || []) {
          if (c.candidate_id) map[c.candidate_id] = c.name || "—";
        }
        setCandidateNames(map);
      })
      .catch(() => setCandidateNames({}));
  }, [apiKey, allIds.join(","), Object.keys(candidatesWithNotes).join(",")]);

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    const ok = await bookmarks.createCollection(name);
    setCreatingCollection(false);
    if (ok) setNewCollectionName("");
  };

  return (
    <div className="te-bookmarks-sidebar">
      <h3 className="te-role-sidebar-title">Bookmarks</h3>
      {bookmarks.bookmarks.length === 0 ? (
        <p className="te-role-sidebar-placeholder">No bookmarks yet. Open a candidate profile and click the bookmark icon to save.</p>
      ) : (
        <ul className="te-bookmarks-list">
          {bookmarks.bookmarks.map((cid) => (
            <li key={cid}>
              <Link href={`/recruiter/candidates/${cid}`} className="te-bookmark-link">
                {candidateNames[cid] || cid}
              </Link>
              <button
                type="button"
                className="te-bookmark-remove"
                onClick={() => bookmarks.removeBookmark(cid)}
                aria-label="Remove bookmark"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="te-role-sidebar-title" style={{ marginTop: "1.25rem" }}>Collections</h3>
      <div className="te-collections-create">
        <input
          type="text"
          placeholder="New collection name"
          value={newCollectionName}
          onChange={(e) => setNewCollectionName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateCollection()}
          className="te-search-input"
          style={{ fontSize: "0.8rem", padding: "0.4rem 0.5rem" }}
        />
        <button
          type="button"
          className="te-jdfit-btn"
          style={{ fontSize: "0.75rem", padding: "0.35rem 0.5rem" }}
          onClick={handleCreateCollection}
          disabled={creatingCollection || !newCollectionName.trim()}
        >
          Create
        </button>
      </div>
      {Object.keys(bookmarks.collections).length === 0 ? (
        <p className="te-role-sidebar-placeholder" style={{ marginTop: "0.5rem" }}>No collections yet.</p>
      ) : (
        <div className="te-collections-list">
          {Object.entries(bookmarks.collections).map(([name, ids]) => (
            <CollectionBlock
              key={name}
              name={name}
              ids={ids}
              candidateNames={candidateNames}
              bookmarks={bookmarks}
            />
          ))}
        </div>
      )}

      <h3 className="te-role-sidebar-title" style={{ marginTop: "1.25rem" }}>Notes</h3>
      {Object.keys(candidatesWithNotes).length === 0 ? (
        <p className="te-role-sidebar-placeholder" style={{ marginTop: "0.5rem" }}>
          No notes yet. Open a candidate profile and add notes there.
        </p>
      ) : (
        <ul className="te-bookmarks-list" style={{ marginTop: "0.5rem" }}>
          {Object.entries(candidatesWithNotes).map(([cid, count]) => (
            <li key={cid}>
              <Link href={`/recruiter/candidates/${cid}`} className="te-bookmark-link">
                {candidateNames[cid] || cid}
                <span className="te-notes-count" style={{ marginLeft: "0.25rem", opacity: 0.7, fontSize: "0.75rem" }}>
                  ({count})
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Avatar for recruiter grid/table: profile photo if available, else initials. */
function CandidateAvatar({
  candidateId,
  name,
  size = "card",
}: {
  candidateId: string;
  name: string;
  size?: "card" | "table";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const className = size === "table" ? "te-table-initial" : "te-card-avatar";
  const showPhoto = !imgFailed && candidateId;
  return (
    <div className={className} style={{ overflow: "hidden", position: "relative" }}>
      {showPhoto ? (
        <img
          src={`${API_BASE}/profile/public/${candidateId}/photo?v=${_photoCacheBust}`}
          alt=""
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
          style={{ position: "absolute", inset: 0 }}
        />
      ) : null}
      {!showPhoto ? (
        <span style={{ position: "relative", zIndex: 1 }}>{initial(name || "?")}</span>
      ) : null}
    </div>
  );
}

export default function RecruiterPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [roleDescription, setRoleDescription] = useState("");
  const [interpretedAs, setInterpretedAs] = useState<string | null>(null);
  const [interpretedAsConfirmed, setInterpretedAsConfirmed] = useState(false);
  const [filters, setFilters] = useState({
    major: "",
    track: "",
    school_id: "",
    cities: "",
    min_smart: "",
    min_grit: "",
    min_build: "",
  });
  const [requiredSkills, setRequiredSkills] = useState("");
  const [sort, setSort] = useState<string>("match_score");
  const [topPctBy, setTopPctBy] = useState<(typeof TOP_PCT_BY_OPTIONS)[number]["value"]>("sgb");
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [jobTitle, setJobTitle] = useState("");
  const [jdFit, setJdFit] = useState<JdFit | null>(null);
  const [jdFitLoading, setJdFitLoading] = useState(false);
  const [jdFitError, setJdFitError] = useState("");
  const [jdFitAdjusted, setJdFitAdjusted] = useState<{ smart_min: number; grit_min: number; build_min: number } | null>(null);
  const [jdFitCorrectionSaving, setJdFitCorrectionSaving] = useState(false);
  const [jdFitCorrectionSuccess, setJdFitCorrectionSuccess] = useState(false);

  const [companies, setCompanies] = useState<{ slug: string; display_name: string }[]>([]);
  const [adviceCompanySlug, setAdviceCompanySlug] = useState("");
  const [adviceText, setAdviceText] = useState("");
  const [adviceSubmitting, setAdviceSubmitting] = useState(false);
  const [adviceSuccess, setAdviceSuccess] = useState(false);
  const [adviceError, setAdviceError] = useState("");

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [employersOpen, setEmployersOpen] = useState(false);
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(null);
  const [collectionMenuCandidateId, setCollectionMenuCandidateId] = useState<string | null>(null);
  const [collectionMenuAnchor, setCollectionMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<Candidate[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareExpanded, setCompareExpanded] = useState(false);
  const [compareRetracting, setCompareRetracting] = useState(false);
  const [compareAnalysis, setCompareAnalysis] = useState<string | null>(null);
  const [compareAnalysisLoading, setCompareAnalysisLoading] = useState(false);
  const [compareRecommendations, setCompareRecommendations] = useState<Record<string, string[]>>({});
  const [compareAskOpen, setCompareAskOpen] = useState(false);
  const retractTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bookmarks = useRecruiterBookmarks();

  const handleHideBreakdown = useCallback(() => {
    if (!compareExpanded) return;
    setCompareRetracting(true);
    if (retractTimeoutRef.current) clearTimeout(retractTimeoutRef.current);
    retractTimeoutRef.current = setTimeout(() => {
      retractTimeoutRef.current = null;
      setCompareExpanded(false);
      setCompareRetracting(false);
    }, 650);
  }, [compareExpanded]);

  const handleCloseCompareModal = useCallback(() => {
    setCompareAskOpen(false);
    if (compareExpanded || compareRetracting) {
      if (!compareRetracting) setCompareRetracting(true);
      if (retractTimeoutRef.current) clearTimeout(retractTimeoutRef.current);
      retractTimeoutRef.current = setTimeout(() => {
        retractTimeoutRef.current = null;
        setCompareExpanded(false);
        setCompareRetracting(false);
        setCompareModalOpen(false);
      }, 650);
    } else {
      setCompareModalOpen(false);
    }
  }, [compareExpanded, compareRetracting]);

  useEffect(() => {
    if (!compareModalOpen) setCompareAskOpen(false);
  }, [compareModalOpen]);

  useEffect(() => {
    setCompareAskOpen(false);
  }, [compareSelection[0]?.candidate_id, compareSelection[1]?.candidate_id]);

  useEffect(() => {
    if (compareModalOpen && (compareAnalysisLoading || !compareAnalysis?.trim())) {
      setCompareAskOpen(false);
    }
  }, [compareModalOpen, compareAnalysisLoading, compareAnalysis]);

  useEffect(() => () => {
    if (retractTimeoutRef.current) clearTimeout(retractTimeoutRef.current);
  }, []);

  const toggleCompareSelection = (c: Candidate) => {
    setCompareSelection((prev) => {
      const exists = prev.some((x) => x.candidate_id === c.candidate_id);
      if (exists) return prev.filter((x) => x.candidate_id !== c.candidate_id);
      if (prev.length >= 2) return prev;
      return [...prev, c];
    });
  };

  const isCompareSelected = (candidateId: string) =>
    compareSelection.some((c) => c.candidate_id === candidateId);

  useEffect(() => {
    if (!compareModalOpen || compareSelection.length !== 2) return;
    setCompareAnalysis(null);
    setCompareRecommendations({});
    setCompareAnalysisLoading(true);
    const key = (getRecruiterKey() || "").trim() || null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    fetch(`${API_BASE}/recruiter/compare`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        candidate_ids: compareSelection.map((c) => c.candidate_id),
        role_description: roleDescription.trim() || " ",
        candidates: compareSelection.map((c) => ({
          candidate_id: c.candidate_id,
          name: c.name,
          match_score: c.match_score,
          smart: c.smart,
          grit: c.grit,
          build: c.build,
          fit_level: c.fit_level,
        })),
      }),
    })
      .then((res) => (res.ok ? res.json() : { comparison: "Could not load comparison." }))
      .then((d: { comparison?: string; recommendations?: Record<string, string[]> }) => {
        setCompareAnalysis(d.comparison || "No comparison available.");
        const rec = d.recommendations && typeof d.recommendations === "object" ? d.recommendations : {};
        const normalized: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(rec)) {
          if (Array.isArray(v)) normalized[k] = v.filter((x) => typeof x === "string" && x.trim());
        }
        setCompareRecommendations(normalized);
      })
      .catch(() => {
        setCompareAnalysis("Failed to load comparison.");
        setCompareRecommendations({});
      })
      .finally(() => setCompareAnalysisLoading(false));
  }, [compareModalOpen, compareSelection, roleDescription]);

  useEffect(() => {
    const tp = parseTopPctSort(sort);
    if (tp) setTopPctBy(tp.by);
  }, [sort]);

  useEffect(() => {
    setApiKey(getRecruiterKey());
    const onKeyChange = () => setApiKey(getRecruiterKey());
    window.addEventListener("recruiter-key-changed", onKeyChange);
    return () => window.removeEventListener("recruiter-key-changed", onKeyChange);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/companies`)
      .then((res) => (res.ok ? res.json() : { companies: [] }))
      .then((data) => setCompanies(Array.isArray(data?.companies) ? data.companies : []))
      .catch(() => setCompanies([]));
  }, []);

  // Restore last search state when returning from a candidate profile (or refresh)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(RECRUITER_SEARCH_STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Record<string, unknown>;
      if (s.roleDescription != null) setRoleDescription(String(s.roleDescription));
      if (s.jobTitle != null) setJobTitle(String(s.jobTitle));
      if (s.requiredSkills != null) setRequiredSkills(String(s.requiredSkills));
      if (s.sort != null && typeof s.sort === "string") {
        setSort(s.sort);
        const tp = parseTopPctSort(s.sort);
        if (tp) setTopPctBy(tp.by);
      }
      if (s.limit != null && typeof s.limit === "number" && [10, 25, 30, 50, 100].includes(s.limit)) setLimit(s.limit);
      if (s.viewMode === "grid" || s.viewMode === "table") setViewMode(s.viewMode);
      if (s.offset != null && typeof s.offset === "number") setOffset(s.offset);
      if (s.filters != null && typeof s.filters === "object" && !Array.isArray(s.filters)) {
        const f = s.filters as Record<string, string>;
        setFilters({
          major: f.major ?? "",
          track: f.track ?? "",
          school_id: f.school_id ?? "",
          cities: f.cities ?? "",
          min_smart: f.min_smart ?? "",
          min_grit: f.min_grit ?? "",
          min_build: f.min_build ?? "",
        });
      }
      if (Array.isArray(s.candidates)) setCandidates(s.candidates as Candidate[]);
      if (typeof s.total === "number") setTotal(s.total);
      if (typeof s.interpretedAs === "string" && s.interpretedAs.trim()) setInterpretedAs(s.interpretedAs.trim());
      if (s.interpretedAsConfirmed === true) setInterpretedAsConfirmed(true);
      if (s.jdFit != null && typeof s.jdFit === "object") {
        const j = s.jdFit as Record<string, unknown>;
        setJdFit({
          smart_min: (j.smart_min as number) ?? 60,
          grit_min: (j.grit_min as number) ?? 60,
          build_min: (j.build_min as number) ?? 60,
          min_final_score: (j.min_final_score as number) ?? 60,
          track: (j.track as string) ?? null,
          signals: Array.isArray(j.signals) ? (j.signals as string[]) : [],
          unavailable: !!j.unavailable,
        });
      }
    } catch {
      // ignore invalid or missing state
    }
  }, []);

  // Persist search state so Back from profile restores it
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasResults = candidates.length > 0 || total > 0;
    const hasInput = (roleDescription || "").trim().length > 0 || jdFit != null;
    if (!hasResults && !hasInput) return;
    try {
      sessionStorage.setItem(
        RECRUITER_SEARCH_STATE_KEY,
        JSON.stringify({
          roleDescription,
          jobTitle,
          requiredSkills,
          sort,
          limit,
          interpretedAs: interpretedAs || undefined,
          interpretedAsConfirmed: interpretedAsConfirmed || undefined,
          viewMode,
          offset,
          filters,
          candidates,
          total,
          jdFit,
        })
      );
    } catch {
      // ignore quota or other storage errors
    }
  }, [roleDescription, jobTitle, requiredSkills, sort, limit, viewMode, offset, filters, candidates, total, jdFit, interpretedAs, interpretedAsConfirmed]);

  const runSearch = useCallback(
    async (pageOffset: number = 0, skipTypoCorrection: boolean = false) => {
      const key = (getRecruiterKey() || "").trim() || null;
      setSearchError("");
      setCompareMode(false);
      setCompareSelection([]);
      setCompareModalOpen(false);
      setLoading(true);
      try {
        const citiesList = filters.cities
          ? filters.cities.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined;
        const body: Record<string, unknown> = {
          role_description: roleDescription || " ",
          ...(skipTypoCorrection && { skip_typo_correction: true }),
          filters: {
            ...(filters.major && { major: filters.major.includes(",") ? filters.major.split(",").map((s) => s.trim()) : [filters.major] }),
            ...(filters.track && { track: filters.track }),
            ...(filters.school_id && { school_id: filters.school_id }),
            ...(citiesList?.length ? { cities: citiesList } : {}),
            ...(filters.min_smart ? { min_smart: parseInt(filters.min_smart, 10) } : {}),
            ...(filters.min_grit ? { min_grit: parseInt(filters.min_grit, 10) } : {}),
            ...(filters.min_build ? { min_build: parseInt(filters.min_build, 10) } : {}),
          },
          sort,
          limit,
          offset: pageOffset,
        };
        if (requiredSkills.trim()) {
          body.required_skills = requiredSkills.split(",").map((s) => s.trim()).filter(Boolean);
        }
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (key) {
          headers["X-Recruiter-API-Key"] = key;
          headers["Authorization"] = `Bearer ${key}`;
        }
        const res = await fetch(`${API_BASE}/recruiter/search`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(apiErrorString(err, res.statusText || "Search failed"));
        }
        const data = await res.json();
        const raw = data.candidates || [];
        // Dedupe by candidate_id (keeps first occurrence) so React keys are unique
        const seen = new Set<string>();
        const deduped = raw.filter((c: { candidate_id?: string }) => {
          const id = (c?.candidate_id ?? "").trim();
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        setCandidates(deduped);
        setTotal(deduped.length > 0 ? deduped.length : (data.total ?? 0));
        setOffset(pageOffset);
        const newInterpreted = typeof data.interpreted_as === "string" && data.interpreted_as.trim() ? data.interpreted_as.trim() : null;
        setInterpretedAs(newInterpreted);
        setInterpretedAsConfirmed(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Search failed";
        const isNetwork = /failed to fetch|load failed|network|connection/i.test(msg);
        const isKeyError = /invalid|missing|key/i.test(msg);
        setSearchError(
          isNetwork
            ? "Could not reach the API. Is it running on the correct port?"
            : msg + (isKeyError ? " Make sure the key matches RECRUITER_API_KEY on the server." : "")
        );
        setCandidates([]);
        setTotal(0);
        setInterpretedAs(null);
        setInterpretedAsConfirmed(false);
      } finally {
        setLoading(false);
      }
    },
    [roleDescription, filters, requiredSkills, sort, limit]
  );

  const handleTypoCorrect = useCallback(async () => {
    if (!interpretedAs || !roleDescription.trim()) return;
    const key = (getRecruiterKey() || "").trim() || null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      await fetch(`${API_BASE}/recruiter/typo-feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: roleDescription.trim(), corrected: interpretedAs, feedback: "correct" }),
      });
      setInterpretedAsConfirmed(true);
    } catch {
      setInterpretedAsConfirmed(true);
    }
  }, [interpretedAs, roleDescription]);

  const handleTypoWrong = useCallback(async () => {
    if (!interpretedAs || !roleDescription.trim()) return;
    const key = (getRecruiterKey() || "").trim() || null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      await fetch(`${API_BASE}/recruiter/typo-feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: roleDescription.trim(), corrected: interpretedAs, feedback: "wrong" }),
      });
    } catch {
      // ignore
    }
    setInterpretedAs(null);
    setInterpretedAsConfirmed(false);
    runSearch(0, true);
  }, [interpretedAs, roleDescription, runSearch]);

  const handleGetJdFit = async () => {
    const key = (getRecruiterKey() || "").trim() || null;
    const jd = roleDescription.trim();
    if (!jd) {
      setJdFitError("Enter a role description first.");
      return;
    }
    setJdFitError("");
    setJdFit(null);
    setJdFitLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) {
        headers["X-Recruiter-API-Key"] = key;
        headers["Authorization"] = `Bearer ${key}`;
      }
      const res = await fetch(`${API_BASE}/recruiter/jd-fit`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          job_description: jd,
          ...(jobTitle.trim() && { job_title: jobTitle.trim() }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = apiErrorString(data, res.statusText || "Could not analyze role.");
        const hint = res.status === 401 && /invalid|missing|key/i.test(msg)
          ? " Make sure the key matches RECRUITER_API_KEY on the server."
          : "";
        setJdFitError(msg + hint);
        return;
      }
      setJdFit({
        smart_min: data.smart_min ?? 60,
        grit_min: data.grit_min ?? 60,
        build_min: data.build_min ?? 60,
        min_final_score: data.min_final_score ?? 60,
        track: data.track ?? null,
        signals: Array.isArray(data.signals) ? data.signals : [],
        unavailable: !!data.unavailable,
      });
      setJdFitAdjusted(null);
    } finally {
      setJdFitLoading(false);
    }
  };

  const handleUseJdFitAsFilters = () => {
    if (!jdFit) return;
    const bars = jdFitAdjusted ?? jdFit;
    setFilters((f) => ({
      ...f,
      min_smart: String(bars.smart_min),
      min_grit: String(bars.grit_min),
      min_build: String(bars.build_min),
      ...(jdFit.track && TRACK_OPTIONS.includes(jdFit.track) && { track: jdFit.track }),
    }));
  };

  const handleSaveJdFitCorrection = async () => {
    if (!jdFit || !jdFitAdjusted) return;
    const key = (getRecruiterKey() || "").trim() || null;
    setJdFitCorrectionSuccess(false);
    setJdFitCorrectionSaving(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) {
        headers["X-Recruiter-API-Key"] = key;
        headers["Authorization"] = `Bearer ${key}`;
      }
      const res = await fetch(`${API_BASE}/recruiter/jd-fit-correction`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          job_description: roleDescription.trim(),
          job_title: jobTitle.trim() || undefined,
          original_smart_min: jdFit.smart_min,
          original_grit_min: jdFit.grit_min,
          original_build_min: jdFit.build_min,
          corrected_smart_min: jdFitAdjusted.smart_min,
          corrected_grit_min: jdFitAdjusted.grit_min,
          corrected_build_min: jdFitAdjusted.build_min,
          track: jdFit.track,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setJdFitError(data?.detail || res.statusText || "Could not save correction.");
        return;
      }
      setJdFitCorrectionSuccess(true);
      setJdFit({ ...jdFit, ...jdFitAdjusted });
      setJdFitAdjusted(null);
    } finally {
      setJdFitCorrectionSaving(false);
    }
  };

  const handleSubmitAdvice = async () => {
    const slug = adviceCompanySlug.trim();
    const text = adviceText.trim();
    if (!slug || !text) {
      setAdviceError("Pick a company and enter advice.");
      return;
    }
    const key = (getRecruiterKey() || "").trim() || null;
    setAdviceError("");
    setAdviceSuccess(false);
    setAdviceSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) {
        headers["X-Recruiter-API-Key"] = key;
        headers["Authorization"] = `Bearer ${key}`;
      }
      const res = await fetch(`${API_BASE}/recruiter/company-advice`, {
        method: "POST",
        headers,
        body: JSON.stringify({ company_slug: slug, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdviceError(data?.detail || res.statusText || "Failed to submit.");
        return;
      }
      setAdviceSuccess(true);
      setAdviceText("");
    } finally {
      setAdviceSubmitting(false);
    }
  };

  const setTrackFilter = (track: string) => {
    setFilters((f) => ({ ...f, track: track === "" ? "" : track }));
  };

  /** Dilly AI + score breakdown both open: share vertical space; JD narrative lives in the AI strip. */
  const compareAskBodySplit =
    compareModalOpen &&
    compareSelection.length === 2 &&
    compareAskOpen &&
    compareExpanded &&
    !compareAnalysisLoading &&
    Boolean(compareAnalysis?.trim());

  const hideCompareAnalysisInBody =
    compareAskOpen && compareExpanded && Boolean(compareAnalysis?.trim());

  return (
    <>
      <section className="te-page-hero">
        <span className="te-hero-eyebrow">Recruiter-Facing View</span>
        <h1 className="te-hero-title">Dilly Recruiter</h1>
        <p className="te-hero-sub">
          A live, filterable showcase of talent by major, skillset, and Dilly scores (Smart, Grit, Build).
        </p>
      </section>

      <div className="te-hero-stats">
        <article className="te-stat-card">
          <div className="te-stat-value">{total > 0 ? total : "—"}</div>
          <div className="te-stat-label">Candidates in results</div>
        </article>
        <article className="te-stat-card">
          <div className="te-stat-value">{companies.length}</div>
          <div className="te-stat-label">Companies</div>
        </article>
        <article className="te-stat-card">
          <div className="te-stat-value">3</div>
          <div className="te-stat-label">Score dimensions</div>
        </article>
        <article className="te-stat-card">
          <div className="te-stat-value">1</div>
          <div className="te-stat-label">Unified talent surface</div>
        </article>
      </div>

      <div className={`te-main-grid ${jdFit || total > 0 ? "te-main-grid--center-open" : ""}`}>
        <aside className="te-main-left">
          <section className="te-section">
            <div>
              <span className="te-section-kicker">Search and segment</span>
              <h2 className="te-section-title">Discover the right candidate</h2>
            </div>

            <div className="te-search-bar">
              <input
                type="text"
                className="te-search-input"
                placeholder="Job title (optional)"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
              <textarea
                className="te-search-textarea"
                placeholder="Paste role description or keywords..."
                value={roleDescription}
                onChange={(e) => {
                  setRoleDescription(e.target.value);
                  setInterpretedAs(null);
                  setInterpretedAsConfirmed(false);
                }}
                rows={4}
              />
              {interpretedAs && (
                <div className="te-interpreted-as-row">
                  <p className="te-interpreted-as">
                    Showing results for: {interpretedAs}
                    {!interpretedAsConfirmed && (
                      <span className="te-interpreted-as-buttons">
                        <button
                          type="button"
                          className="te-interpreted-btn te-interpreted-btn--correct"
                          onClick={handleTypoCorrect}
                          title="Correct — Dilly got it right"
                          aria-label="Correct"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="te-interpreted-btn te-interpreted-btn--wrong"
                          onClick={handleTypoWrong}
                          title="Wrong — retry with my original text"
                          aria-label="Wrong"
                        >
                          ✗
                        </button>
                      </span>
                    )}
                    {interpretedAsConfirmed && <span className="te-interpreted-confirmed"> ✓</span>}
                  </p>
                </div>
              )}
              <div>
                <div className="te-result-note" style={{ marginBottom: "0.5rem" }}>Track</div>
                <div className="te-filter-row">
                  <button
                    type="button"
                    className={`te-filter-btn ${!filters.track ? "active" : ""}`}
                    onClick={() => setTrackFilter("")}
                  >
                    All
                  </button>
                  {TRACK_OPTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`te-filter-btn ${filters.track === t ? "active" : ""}`}
                      onClick={() => setTrackFilter(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="te-btn"
                  onClick={handleGetJdFit}
                  disabled={jdFitLoading || !roleDescription.trim()}
                >
                  {jdFitLoading ? "Analyzing…" : "Get Dilly fit"}
                </button>
                <button
                  type="button"
                  className="te-btn"
                  onClick={() => runSearch(0)}
                  disabled={loading}
                >
                  {loading ? "Searching…" : "Find candidates"}
                </button>
                <select
                  value={parseTopPctSort(sort) ? "top_pct" : sort}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "top_pct") {
                      setSort(topPctApiValue(topPctBy));
                    } else {
                      setSort(v);
                    }
                  }}
                  className="te-sort-dropdown"
                  aria-label="Sort by"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {parseTopPctSort(sort) ? (
                  <select
                    value={topPctBy}
                    onChange={(e) => {
                      const by = e.target.value as (typeof TOP_PCT_BY_OPTIONS)[number]["value"];
                      setTopPctBy(by);
                      setSort(topPctApiValue(by));
                    }}
                    className="te-sort-dropdown"
                    aria-label="Top % basis"
                  >
                    {TOP_PCT_BY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : null}
                <div className="te-limit-buttons">
                  <span className="te-limit-label">Show</span>
                  {[10, 25, 30, 50, 100].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`te-filter-btn ${limit === n ? "active" : ""}`}
                      onClick={() => {
                        setLimit(n);
                        if (candidates.length > 0 || total > 0) runSearch(0);
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {jdFitError && <span style={{ fontSize: "0.8rem", color: "#f87171" }}>{String(jdFitError)}</span>}
              {searchError && <span style={{ fontSize: "0.8rem", color: "#f87171" }}>{String(searchError)}</span>}
              {jdFit && (
                <div className="te-jdfit-inline">
                  <span className="te-jdfit-inline-scores">
                    Smart {(jdFitAdjusted ?? jdFit).smart_min} · Grit {(jdFitAdjusted ?? jdFit).grit_min} · Build {(jdFitAdjusted ?? jdFit).build_min}
                  </span>
                  <button type="button" className="te-jdfit-btn" onClick={handleUseJdFitAsFilters}>
                    Use as filters
                  </button>
                </div>
              )}
              <div className="te-result-note" id="resultCount">
                {loading ? "Loading…" : total > 0 ? `${total} profile${total !== 1 ? "s" : ""} visible` : "Enter a role and click Find candidates to search."}
              </div>
            </div>
          </section>

          <section className="te-section">
            <button
              type="button"
              className={`te-collapse-trigger ${employersOpen ? "te-collapse-open" : ""}`}
              onClick={() => setEmployersOpen((o) => !o)}
            >
              <span>For employers</span>
              <span className="te-chevron">▼</span>
            </button>
            <div className="te-collapse-content" style={{ display: employersOpen ? "block" : "none" }}>
              <div className="te-collapse-content-inner">
                <div className="te-highlight-box">
                  <p style={{ marginBottom: "1rem" }}>
                    Add advice for students applying to your company. Tips appear on that company&apos;s page in the Dilly app.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <select
                      value={adviceCompanySlug}
                      onChange={(e) => { setAdviceCompanySlug(e.target.value); setAdviceSuccess(false); setAdviceError(""); }}
                      className="te-search-input"
                      style={{ width: "100%", padding: "0.6rem 0.75rem" }}
                    >
                      <option value="">Select company</option>
                      {companies.map((c) => (
                        <option key={c.slug} value={c.slug}>{c.display_name}</option>
                      ))}
                    </select>
                    <textarea
                      placeholder="Advice for students applying here..."
                      value={adviceText}
                      onChange={(e) => { setAdviceText(e.target.value); setAdviceSuccess(false); setAdviceError(""); }}
                      rows={2}
                      className="te-search-textarea"
                      style={{ minHeight: "56px" }}
                    />
                    <button
                      type="button"
                      className="te-btn"
                      onClick={handleSubmitAdvice}
                      disabled={adviceSubmitting || !adviceCompanySlug.trim() || !adviceText.trim()}
                    >
                      {adviceSubmitting ? "Submitting…" : "Submit advice"}
                    </button>
                  </div>
                  {adviceError && <p style={{ fontSize: "0.8rem", color: "#f87171", marginTop: "0.5rem" }}>{adviceError}</p>}
                  {adviceSuccess && <p style={{ fontSize: "0.8rem", color: "#55f3ac", marginTop: "0.5rem" }}>Advice added.</p>}
                </div>
              </div>
            </div>
          </section>
        </aside>

        <div className="te-main-center">
          <section className="te-section te-main-center-inner" style={{ paddingTop: "0" }}>
            <div className="te-candidates-header">
              <h2 className="te-candidates-title">
                Candidates {total > 0 ? `(${total})` : ""}
              </h2>
              <div className="te-candidates-header-actions">
                {candidates.length > 0 && (
                  <button
                    type="button"
                    className={`te-compare-btn${compareMode ? " te-compare-btn--active" : ""}`}
                    onClick={() => {
                      if (compareMode) {
                        setCompareMode(false);
                        setCompareSelection([]);
                        setCompareModalOpen(false);
                      } else {
                        setCompareMode(true);
                        setCompareSelection([]);
                      }
                    }}
                  >
                    {compareMode ? "Cancel compare" : "Dilly Compare"}
                  </button>
                )}
                <div className="te-view-toggle">
                  <button
                    type="button"
                    className={viewMode === "grid" ? "active" : ""}
                    onClick={() => setViewMode("grid")}
                  >
                    Grid
                  </button>
                  <button
                    type="button"
                    className={viewMode === "table" ? "active" : ""}
                    onClick={() => setViewMode("table")}
                  >
                    Table
                  </button>
                </div>
              </div>
            </div>

            {compareMode && candidates.length > 0 && (
              <motion.div
                className="te-compare-bar"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <span className="te-compare-bar-text">
                  Select 2 candidates to compare ({compareSelection.length}/2)
                </span>
                <div className="te-compare-bar-actions">
                  <button
                    type="button"
                    className="te-compare-bar-btn"
                    onClick={() => { setCompareMode(false); setCompareSelection([]); }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="te-compare-bar-btn te-compare-bar-btn--primary"
                    disabled={compareSelection.length !== 2}
                    onClick={() => compareSelection.length === 2 && setCompareModalOpen(true)}
                  >
                    Compare
                  </button>
                </div>
              </motion.div>
            )}

            {viewMode === "grid" ? (
              <div id="talent-grid" className={`te-talent-grid${compareMode ? " te-talent-grid--compare-mode" : ""}`}>
                <AnimatePresence mode="sync">
                  {candidates.map((c, i) => {
                    const isPerfectMatch = (c.match_score ?? 0) >= 99.5;
                    return (
                    <motion.article
                      key={c.candidate_id}
                      className={`te-brother-card${compareMode ? " te-brother-card--compare" : ""}${isCompareSelected(c.candidate_id) ? " te-brother-card--compare-selected" : ""}${isPerfectMatch ? " te-brother-card--perfect-match" : ""}`}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onHoverStart={() => setHoveredCandidateId(c.candidate_id)}
                      onHoverEnd={() => setHoveredCandidateId((prev) => (prev === c.candidate_id ? null : prev))}
                      onClick={() => compareMode && toggleCompareSelection(c)}
                      style={
                        hoveredCandidateId === c.candidate_id && !compareMode
                          ? {
                              boxShadow: "0 0 0 2px rgba(253,185,19,0.22)",
                              borderColor: "rgba(253,185,19,0.58)",
                            }
                          : undefined
                      }
                      whileHover={
                        compareMode
                          ? { scale: 1.02 }
                          : {
                              y: -6,
                              boxShadow: "0 0 0 2px rgba(253,185,19,0.22)",
                              borderColor: "rgba(253,185,19,0.58)",
                            }
                      }
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 28,
                        mass: 0.8,
                        opacity: { duration: 0.2 },
                        delay: Math.min(i * 0.04, 0.4),
                      }}
                    >
                      {compareMode && (
                        <div className="te-compare-check">
                          {isCompareSelected(c.candidate_id) ? "✓" : ""}
                        </div>
                      )}
                      {isPerfectMatch && (
                        <div className="te-perfect-match-badge" title="100% match to role">
                          <span className="te-perfect-match-icon" aria-hidden>★</span>
                          <span>Perfect match</span>
                        </div>
                      )}
                      <CandidateAvatar candidateId={c.candidate_id} name={c.name || ""} size="card" />
                      <h3>{c.name || "Candidate"}</h3>
                      <span className="te-major">
                        {((c.majors && c.majors.length > 0) ? c.majors.join(", ") : c.major) || "—"}
                      </span>
                      <div className="te-skill-tags">
                        <span className="te-tag">Smart {Math.round(c.smart)}</span>
                        <span className="te-tag">Grit {Math.round(c.grit)}</span>
                        <span className="te-tag">Build {Math.round(c.build)}</span>
                      </div>
                      {(c.fit_level || c.rerank_reason) && (
                        <div className="te-rerank-reason">
                          {c.fit_level && (
                            <span className={`te-fit-badge te-fit-badge--${(c.fit_level || "").toLowerCase().replace(/\s+/g, "-")}`}>
                              {c.fit_level}
                            </span>
                          )}
                          {c.rerank_reason && <span>{c.rerank_reason}</span>}
                        </div>
                      )}
                      <div className="te-card-links">
                        {!compareMode && (
                          <Link href={`/recruiter/candidates/${c.candidate_id}`} onClick={(e) => e.stopPropagation()}>
                            View profile →
                          </Link>
                        )}
                        {compareMode && (
                          <span className="te-compare-hint">Click to select</span>
                        )}
                        <span className={`te-match-pct${isPerfectMatch ? " te-match-pct--perfect" : ""}`}>{Number(c.match_score).toFixed(1)}% match</span>
                      </div>
                    </motion.article>
                  );})}
                </AnimatePresence>
              </div>
            ) : (
              <div className={`te-talent-table-wrap${compareMode ? " te-talent-table-wrap--compare-mode" : ""}`}>
                <table className="te-talent-table">
                  <thead>
                    <tr>
                      {compareMode && <th></th>}
                      <th></th>
                      <th>Name</th>
                      <th>Major</th>
                      <th>Smart</th>
                      <th>Grit</th>
                      <th>Build</th>
                      <th>Match</th>
                      {!compareMode && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => {
                      const isPerfectMatch = (c.match_score ?? 0) >= 99.5;
                      return (
                      <tr
                        key={c.candidate_id}
                        className={`${compareMode ? "te-table-row--compare" : ""}${isCompareSelected(c.candidate_id) ? " te-table-row--compare-selected" : ""}${isPerfectMatch ? " te-table-row--perfect-match" : ""}`}
                        onClick={() => compareMode && toggleCompareSelection(c)}
                      >
                        {compareMode && (
                          <td className="te-compare-check-cell">
                            <span className="te-compare-check">{isCompareSelected(c.candidate_id) ? "✓" : ""}</span>
                          </td>
                        )}
                        <td><CandidateAvatar candidateId={c.candidate_id} name={c.name || ""} size="table" /></td>
                        <td>{c.name || "Candidate"}</td>
                        <td>{((c.majors && c.majors.length > 0) ? c.majors.join(", ") : c.major) || "—"}</td>
                        <td>{Math.round(c.smart)}</td>
                        <td>{Math.round(c.grit)}</td>
                        <td>{Math.round(c.build)}</td>
                        <td><span className={`te-table-match${isPerfectMatch ? " te-table-match--perfect" : ""}`}>{Number(c.match_score).toFixed(1)}%</span></td>
                        {!compareMode && (
                          <td>
                            <div className="te-table-actions">
                              <button
                                type="button"
                                className={`te-bookmark-btn te-bookmark-btn-icon${bookmarks.isSaved(c.candidate_id) ? " te-bookmark-btn--saved" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                                  setCollectionMenuAnchor({ x: rect.left, y: rect.bottom });
                                  setCollectionMenuCandidateId((prev) => prev === c.candidate_id ? null : c.candidate_id);
                                }}
                                title="Bookmark / Add to collection"
                                aria-label="Bookmark / Add to collection"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  {bookmarks.isSaved(c.candidate_id) ? (
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor" stroke="none" />
                                  ) : (
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                  )}
                                </svg>
                              </button>
                              <Link href={`/recruiter/candidates/${c.candidate_id}`} onClick={(e) => e.stopPropagation()}>View profile</Link>
                            </div>
                          </td>
                        )}
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="te-main-right">
          <div className="te-role-sidebar">
            <h3 className="te-role-sidebar-title">Matching this role</h3>
            {jdFit ? (
              <>
                <div className="te-jdfit-scores te-jdfit-scores-editable" style={{ marginBottom: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.8rem" }}>
                    Smart
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={jdFitAdjusted?.smart_min ?? jdFit.smart_min}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v)) setJdFitAdjusted((a) => ({ ...(a ?? jdFit), smart_min: Math.max(0, Math.min(100, v)) }));
                      }}
                      className="te-search-input"
                      style={{ width: "3rem", padding: "0.25rem 0.35rem", fontSize: "0.8rem" }}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.8rem" }}>
                    Grit
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={jdFitAdjusted?.grit_min ?? jdFit.grit_min}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v)) setJdFitAdjusted((a) => ({ ...(a ?? jdFit), grit_min: Math.max(0, Math.min(100, v)) }));
                      }}
                      className="te-search-input"
                      style={{ width: "3rem", padding: "0.25rem 0.35rem", fontSize: "0.8rem" }}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.8rem" }}>
                    Build
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={jdFitAdjusted?.build_min ?? jdFit.build_min}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v)) setJdFitAdjusted((a) => ({ ...(a ?? jdFit), build_min: Math.max(0, Math.min(100, v)) }));
                      }}
                      className="te-search-input"
                      style={{ width: "3rem", padding: "0.25rem 0.35rem", fontSize: "0.8rem" }}
                    />
                  </label>
                </div>
                {jdFit.track && <p className="te-meta" style={{ marginBottom: "0.5rem" }}>Track: {jdFit.track}</p>}
                {jdFit.signals.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: "0.8rem", color: "var(--te-text-muted)", lineHeight: 1.5 }}>
                    {jdFit.signals.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
                  <button type="button" className="te-jdfit-btn" onClick={handleUseJdFitAsFilters}>
                    Use as filters
                  </button>
                  {jdFitAdjusted && (
                    <button
                      type="button"
                      className="te-jdfit-btn"
                      onClick={handleSaveJdFitCorrection}
                      disabled={jdFitCorrectionSaving}
                      style={{ background: "rgba(var(--te-gold-rgb), 0.2)", color: "var(--te-gold)" }}
                    >
                      {jdFitCorrectionSaving ? "Saving…" : "Save correction"}
                    </button>
                  )}
                </div>
                {jdFitCorrectionSuccess && <p style={{ fontSize: "0.75rem", color: "#55f3ac", marginTop: "0.5rem" }}>Correction saved. Future JD fits will use it.</p>}
              </>
            ) : (
              <p className="te-role-sidebar-placeholder">
                Run &quot;Get Dilly fit&quot; on a role description to see the Smart, Grit, and Build bar for that role here. You can then apply it as filters.
              </p>
            )}
          </div>

          <BookmarksSidebar bookmarks={bookmarks} apiKey={apiKey} />
        </aside>
      </div>

      <AddToCollectionModal
        candidateId={collectionMenuCandidateId ?? ""}
        anchor={collectionMenuCandidateId ? collectionMenuAnchor : null}
        onClose={() => { setCollectionMenuCandidateId(null); setCollectionMenuAnchor(null); }}
        bookmarks={bookmarks}
      />

      <AnimatePresence>
        {compareModalOpen && compareSelection.length === 2 && (
          <motion.div
            className="te-compare-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseCompareModal}
          >
            <motion.div
              className={`te-compare-modal${compareExpanded ? " te-compare-modal--expanded" : ""}${
                compareAskBodySplit ? " te-compare-modal--ask-body-split" : ""
              }`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1, maxWidth: compareExpanded ? 1280 : 900 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "tween", duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`te-compare-modal-header${
                  !compareAnalysisLoading && compareAnalysis?.trim()
                    ? " te-compare-modal-header--with-compare-extras"
                    : ""
                }`}
              >
                {!compareAnalysisLoading && compareAnalysis?.trim() ? (
                  <div className="te-compare-modal-header-dilly">
                    <button
                      type="button"
                      className={`te-compare-dilly-ai-chatfield${compareAskOpen ? " te-compare-dilly-ai-chatfield--open" : ""}`}
                      onClick={() => setCompareAskOpen((o) => !o)}
                      title="Ask Dilly AI follow-up questions about this compare"
                      aria-expanded={compareAskOpen}
                      aria-label="Dilly AI — ask follow-ups about this compare"
                    >
                      <span className="te-compare-dilly-ai-chatfield-avatar-wrap" aria-hidden>
                        <img
                          src="/voice-avatars/dilly-voice-ai.png"
                          alt=""
                          className="te-compare-dilly-ai-chatfield-avatar"
                          width={40}
                          height={40}
                        />
                      </span>
                      <span className="te-compare-dilly-ai-chatfield-copy">
                        <span className="te-compare-dilly-ai-chatfield-label">Dilly AI</span>
                        <span className="te-compare-dilly-ai-chatfield-hint">Any follow ups?</span>
                      </span>
                    </button>
                  </div>
                ) : null}
                <h2 className="te-compare-modal-title">Dilly Compare</h2>
                <div className="te-compare-modal-header-actions">
                  {!compareAnalysisLoading && compareAnalysis?.trim() && (
                    <button
                      type="button"
                      className="te-compare-expand-btn"
                      onClick={() => (compareExpanded ? handleHideBreakdown() : setCompareExpanded(true))}
                      title={compareExpanded ? "Hide score breakdown" : "Show score breakdown"}
                      aria-label={compareExpanded ? "Hide score breakdown" : "Show score breakdown"}
                      disabled={compareRetracting}
                    >
                      {compareExpanded ? "Hide breakdown" : "Show score breakdown"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="te-compare-modal-close"
                    onClick={handleCloseCompareModal}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>
              {compareAskOpen &&
                compareSelection[0] &&
                compareSelection[1] &&
                !compareAnalysisLoading &&
                compareAnalysis?.trim() && (
                <CompareAskAIChat
                  variant="inline"
                  candidateIds={[compareSelection[0].candidate_id, compareSelection[1].candidate_id]}
                  nameA={compareSelection[0].name || "Candidate"}
                  nameB={compareSelection[1].name || "Candidate"}
                  roleDescription={roleDescription}
                  comparisonSummary={compareAnalysis || ""}
                  embeddedExplanation={
                    compareExpanded && compareAnalysis?.trim() ? (
                      <>
                        <h3 className="te-compare-analysis-title" style={{ marginTop: 0 }}>
                          Why one is better for this JD
                        </h3>
                        <CompareAnalysisText text={compareAnalysis} />
                      </>
                    ) : undefined
                  }
                />
              )}
              <div className={`te-compare-modal-body${compareExpanded ? " te-compare-modal-body--expanded" : ""}`}>
                {compareExpanded ? (
                  <div className="te-compare-modal-left">
                    {compareSelection.map((c) => {
                      const isPerfectMatch = (c.match_score ?? 0) >= 99.5;
                      return (
                        <div key={c.candidate_id} className={`te-compare-panel${isPerfectMatch ? " te-compare-panel--perfect-match" : ""}`}>
                          {isPerfectMatch && (
                            <div className="te-compare-panel-perfect-badge">★ Perfect match</div>
                          )}
                          <div className="te-compare-panel-header">
                            <CandidateAvatar candidateId={c.candidate_id} name={c.name || ""} size="card" />
                            <div>
                              <h3 className="te-compare-panel-name">{c.name || "Candidate"}</h3>
                              <p className="te-compare-panel-meta">
                                {((c.majors && c.majors.length > 0) ? c.majors.join(", ") : c.major) || "—"}
                                {c.track ? ` · ${c.track}` : ""}
                              </p>
                            </div>
                            <Link
                              href={`/recruiter/candidates/${c.candidate_id}`}
                              className="te-compare-panel-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View profile →
                            </Link>
                          </div>
                          <div className="te-compare-scores">
                            <div className="te-compare-score-row">
                              <span className="te-compare-score-label">Match</span>
                              <span className="te-compare-score-value">{Number(c.match_score).toFixed(1)}%</span>
                            </div>
                            <div className="te-compare-score-row">
                              <span className="te-compare-score-label">Smart</span>
                              <span className="te-compare-score-value">{Math.round(c.smart)}</span>
                            </div>
                            <div className="te-compare-score-row">
                              <span className="te-compare-score-label">Grit</span>
                              <span className="te-compare-score-value">{Math.round(c.grit)}</span>
                            </div>
                            <div className="te-compare-score-row">
                              <span className="te-compare-score-label">Build</span>
                              <span className="te-compare-score-value">{Math.round(c.build)}</span>
                            </div>
                          </div>
                          {c.fit_level && (
                            <div className="te-compare-fit">
                              <span className={`te-fit-badge te-fit-badge--${(c.fit_level || "").toLowerCase().replace(/\s+/g, "-")}`}>
                                {c.fit_level}
                              </span>
                            </div>
                          )}
                          <CompareRecommendationBullets bullets={compareRecommendations[c.candidate_id] ?? []} />
                        </div>
                      );
                    })}
                    {!hideCompareAnalysisInBody ? (
                      <div className="te-compare-analysis">
                        <h3 className="te-compare-analysis-title">Why one is better for this JD</h3>
                        {compareAnalysisLoading ? (
                          <p className="te-compare-analysis-loading">Analyzing…</p>
                        ) : compareAnalysis ? (
                          <CompareAnalysisText text={compareAnalysis} />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {compareSelection.map((c) => {
                      const isPerfectMatch = (c.match_score ?? 0) >= 99.5;
                      return (
                        <div key={c.candidate_id} className={`te-compare-panel${isPerfectMatch ? " te-compare-panel--perfect-match" : ""}`}>
                          {isPerfectMatch && (
                            <div className="te-compare-panel-perfect-badge">★ Perfect match</div>
                          )}
                          <div className="te-compare-panel-header">
                            <CandidateAvatar candidateId={c.candidate_id} name={c.name || ""} size="card" />
                            <div>
                              <h3 className="te-compare-panel-name">{c.name || "Candidate"}</h3>
                              <p className="te-compare-panel-meta">
                                {((c.majors && c.majors.length > 0) ? c.majors.join(", ") : c.major) || "—"}
                                {c.track ? ` · ${c.track}` : ""}
                              </p>
                            </div>
                            <Link
                              href={`/recruiter/candidates/${c.candidate_id}`}
                              className="te-compare-panel-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View profile →
                            </Link>
                          </div>
                          <div className="te-compare-scores">
                            <div className="te-compare-score-row">
                              <span className="te-compare-score-label">Match</span>
                              <span className="te-compare-score-value">{Number(c.match_score).toFixed(1)}%</span>
                            </div>
                            <div className="te-compare-score-row">
                              <span className="te-compare-score-label">Smart</span>
                              <span className="te-compare-score-value">{Math.round(c.smart)}</span>
                            </div>
                            <div className="te-compare-score-row">
                              <span className="te-compare-score-label">Grit</span>
                              <span className="te-compare-score-value">{Math.round(c.grit)}</span>
                            </div>
                            <div className="te-compare-score-row">
                              <span className="te-compare-score-label">Build</span>
                              <span className="te-compare-score-value">{Math.round(c.build)}</span>
                            </div>
                          </div>
                          {c.fit_level && (
                            <div className="te-compare-fit">
                              <span className={`te-fit-badge te-fit-badge--${(c.fit_level || "").toLowerCase().replace(/\s+/g, "-")}`}>
                                {c.fit_level}
                              </span>
                            </div>
                          )}
                          <CompareRecommendationBullets bullets={compareRecommendations[c.candidate_id] ?? []} />
                        </div>
                      );
                    })}
                    {!hideCompareAnalysisInBody ? (
                      <div className="te-compare-analysis">
                        <h3 className="te-compare-analysis-title">Why one is better for this JD</h3>
                        {compareAnalysisLoading ? (
                          <p className="te-compare-analysis-loading">Analyzing…</p>
                        ) : compareAnalysis ? (
                          <CompareAnalysisText text={compareAnalysis} />
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
                <AnimatePresence>
                  {compareExpanded && (
                    <motion.div
                      key="te-compare-viz"
                      className="te-compare-visualizations-wrap"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 360, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ type: "tween", duration: 0.25 }}
                    >
                      <CompareVisualizations candidates={[compareSelection[0], compareSelection[1]]} retracting={compareRetracting} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RecruiterSearchVoice roleDescription={roleDescription} />

      <footer className="te-footer">
        Dilly Recruiter
      </footer>
    </>
  );
}
