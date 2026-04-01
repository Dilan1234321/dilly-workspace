"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { AppProfileHeader, CareerCenterMinibar } from "@/components/career-center";
import { useDillyVoiceNotification } from "@/context/DillyVoiceNotificationContext";
import {
  AUTH_USER_CACHE_KEY,
  auditStorageKey,
  getCareerCenterReturnPath,
  safeUuid,
} from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import type { AuditV2 } from "@/types/dilly";

// ─── Bullet Score types ───────────────────────────────────────────────────────

type BulletScore = { score: number; label: string; hints: string[] } | null;

// ─── Types ────────────────────────────────────────────────────────────────────

type BulletItem = { id: string; text: string };

type ExperienceEntry = {
  id: string;
  company: string;
  role: string;
  date: string;
  location: string;
  bullets: BulletItem[];
};

type EducationEntry = {
  id: string;
  university: string;
  major: string;
  minor: string;
  graduation: string;
  location: string;
  honors: string;
  gpa: string;
};

type ProjectEntry = {
  id: string;
  name: string;
  date: string;
  location: string;
  bullets: BulletItem[];
};

type ContactSection = {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
};

type SimpleSection = { id: string; lines: string[] };

type ResumeSection =
  | { key: "contact"; label: string; contact: ContactSection }
  | { key: "education"; label: string; education: EducationEntry }
  | {
      key:
        | "professional_experience"
        | "research"
        | "campus_involvement"
        | "volunteer_experience";
      label: string;
      experiences: ExperienceEntry[];
    }
  | { key: "projects"; label: string; projects: ProjectEntry[] }
  | {
      key:
        | "skills"
        | "honors"
        | "certifications"
        | "summary_objective"
        | "relevant_coursework"
        | "publications_presentations";
      label: string;
      simple: SimpleSection;
    };

// ─── Section-label map ───────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  contact: "Contact",
  education: "Education",
  professional_experience: "Experience",
  research: "Research",
  campus_involvement: "Campus Involvement",
  volunteer_experience: "Volunteer Experience",
  projects: "Projects",
  skills: "Skills",
  honors: "Honors",
  certifications: "Certifications",
  summary_objective: "Summary / Objective",
  relevant_coursework: "Relevant Coursework",
  publications_presentations: "Publications & Presentations",
};

const EXPERIENCE_KEYS = new Set([
  "professional_experience",
  "research",
  "campus_involvement",
  "volunteer_experience",
]);

const SIMPLE_KEYS = new Set([
  "skills",
  "honors",
  "certifications",
  "summary_objective",
  "relevant_coursework",
  "publications_presentations",
]);

// ─── Parse structured_text from audit ────────────────────────────────────────

function parseStructuredText(text: string, name?: string): ResumeSection[] {
  const sections: ResumeSection[] = [];
  const lines = text.split("\n");

  // Collect [SECTION] blocks
  const blocks: { label: string; lines: string[] }[] = [];
  let current: { label: string; lines: string[] } | null = null;
  for (const line of lines) {
    const m = line.trim().match(/^\[([^\]]+)\]$/);
    if (m) {
      if (current) blocks.push(current);
      current = { label: m[1].trim().toLowerCase(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);

  const nameFromText =
    text
      .split("\n")
      .find((l) => l.trim().startsWith("Name:"))
      ?.replace(/^Name:\s*/i, "")
      .trim() ?? name ?? "";

  for (const block of blocks) {
    const lbl = block.label;
    const content = block.lines.join("\n").trim();

    // CONTACT / TOP
    if (lbl.includes("contact") || lbl.includes("top")) {
      const getField = (field: string) => {
        const m = content.match(new RegExp(`${field}:\\s*(.+)`, "i"));
        return m ? m[1].trim() : "";
      };
      sections.push({
        key: "contact",
        label: "Contact",
        contact: {
          name: nameFromText,
          email: getField("email"),
          phone: getField("phone"),
          location: getField("location"),
          linkedin: getField("linkedin"),
        },
      });
      continue;
    }

    // EDUCATION
    if (lbl.includes("education")) {
      const getField = (field: string) => {
        const m = content.match(new RegExp(`${field}:\\s*(.+)`, "i"));
        return m ? m[1].trim().replace(/^N\/A$/i, "") : "";
      };
      sections.push({
        key: "education",
        label: "Education",
        education: {
          id: safeUuid(),
          university: getField("university"),
          major: getField("major(?:s)?"),
          minor: getField("minor(?:s)?"),
          graduation: getField("graduation date"),
          location: getField("location"),
          honors: getField("honors"),
          gpa: getField("gpa"),
        },
      });
      continue;
    }

    // EXPERIENCE-TYPE sections
    const expKey = lbl.includes("professional") || lbl.includes("work") || lbl.includes("employment")
      ? "professional_experience"
      : lbl.includes("research")
      ? "research"
      : lbl.includes("campus") || lbl.includes("involvement") || lbl.includes("leadership") || lbl.includes("activit")
      ? "campus_involvement"
      : lbl.includes("volunteer")
      ? "volunteer_experience"
      : null;

    if (expKey) {
      const entries: ExperienceEntry[] = parseExperienceEntries(content);
      if (entries.length > 0) {
        sections.push({
          key: expKey as any,
          label: SECTION_LABELS[expKey],
          experiences: entries,
        });
      }
      continue;
    }

    // PROJECTS
    if (lbl.includes("project")) {
      const projects = parseProjectEntries(content);
      if (projects.length > 0) {
        sections.push({ key: "projects", label: "Projects", projects });
      }
      continue;
    }

    // SIMPLE sections
    const simpleKey = lbl.includes("skill")
      ? "skills"
      : lbl.includes("honor") || lbl.includes("award")
      ? "honors"
      : lbl.includes("certif")
      ? "certifications"
      : lbl.includes("summary") || lbl.includes("objective")
      ? "summary_objective"
      : lbl.includes("coursework")
      ? "relevant_coursework"
      : lbl.includes("publication") || lbl.includes("presentation")
      ? "publications_presentations"
      : null;

    if (simpleKey) {
      const lineArr = content
        .split("\n")
        .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
        .filter(Boolean);
      if (lineArr.length > 0) {
        sections.push({
          key: simpleKey as any,
          label: SECTION_LABELS[simpleKey],
          simple: { id: safeUuid(), lines: lineArr },
        });
      }
    }
  }

  return sections;
}

function parseExperienceEntries(content: string): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  const lines = content.split("\n").filter((l) => l.trim());

  // Group by "Company: " lines (structured format from backend)
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^Company:/i.test(line)) {
      const entry: ExperienceEntry = {
        id: safeUuid(),
        company: line.replace(/^Company:\s*/i, "").trim().replace(/^N\/A$/i, ""),
        role: "",
        date: "",
        location: "",
        bullets: [],
      };
      i++;
      while (i < lines.length && !/^Company:/i.test(lines[i])) {
        const l = lines[i];
        if (/^Role:/i.test(l)) entry.role = l.replace(/^Role:\s*/i, "").trim().replace(/^N\/A$/i, "");
        else if (/^Date:/i.test(l)) entry.date = l.replace(/^Date:\s*/i, "").trim().replace(/^N\/A$/i, "");
        else if (/^Location:/i.test(l)) entry.location = l.replace(/^Location:\s*/i, "").trim().replace(/^N\/A$/i, "");
        else if (/^Description:/i.test(l)) {
          const desc = l.replace(/^Description:\s*/i, "").trim();
          if (desc) {
            for (const b of desc.split("\n")) {
              const t = b.replace(/^[•\-*]\s*/, "").trim();
              if (t) entry.bullets.push({ id: safeUuid(), text: t });
            }
          }
        } else if (/^[•\-*]/.test(l.trim())) {
          entry.bullets.push({ id: safeUuid(), text: l.replace(/^[•\-*]\s*/, "").trim() });
        }
        i++;
      }
      if (entry.company || entry.role || entry.bullets.length > 0) {
        entries.push(entry);
      }
    } else {
      i++;
    }
  }

  // Fallback: if no structured Company: lines found, treat bullets as one entry
  if (entries.length === 0 && lines.some((l) => /^[•\-*]/.test(l.trim()))) {
    const bullets = lines
      .filter((l) => /^[•\-*]/.test(l.trim()))
      .map((l) => ({ id: safeUuid(), text: l.replace(/^[•\-*]\s*/, "").trim() }));
    entries.push({ id: safeUuid(), company: "", role: "", date: "", location: "", bullets });
  }

  return entries;
}

function parseProjectEntries(content: string): ProjectEntry[] {
  const entries: ProjectEntry[] = [];
  const lines = content.split("\n").filter((l) => l.trim());

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^Project name:/i.test(line)) {
      const entry: ProjectEntry = {
        id: safeUuid(),
        name: line.replace(/^Project name:\s*/i, "").trim().replace(/^N\/A$/i, ""),
        date: "",
        location: "",
        bullets: [],
      };
      i++;
      while (i < lines.length && !/^Project name:/i.test(lines[i])) {
        const l = lines[i];
        if (/^Date:/i.test(l)) entry.date = l.replace(/^Date:\s*/i, "").trim().replace(/^N\/A$/i, "");
        else if (/^Location:/i.test(l)) entry.location = l.replace(/^Location:\s*/i, "").trim().replace(/^N\/A$/i, "");
        else if (/^Description:/i.test(l)) {
          const desc = l.replace(/^Description:\s*/i, "").trim();
          for (const b of desc.split("\n")) {
            const t = b.replace(/^[•\-*]\s*/, "").trim();
            if (t) entry.bullets.push({ id: safeUuid(), text: t });
          }
        } else if (/^[•\-*]/.test(l.trim())) {
          entry.bullets.push({ id: safeUuid(), text: l.replace(/^[•\-*]\s*/, "").trim() });
        }
        i++;
      }
      entries.push(entry);
    } else {
      i++;
    }
  }
  return entries;
}

// ─── Auto-resize textarea hook ────────────────────────────────────────────────

function useAutoResize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  return ref;
}

// ─── InlineField ─────────────────────────────────────────────────────────────

function InlineField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const taRef = useAutoResize(value);

  if (multiline) {
    return (
      <div className="group/field flex flex-col gap-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] leading-none px-0.5" style={{ color: "var(--t3)" }}>
          {label}
        </span>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={1}
          className="m-resume-field resize-none overflow-hidden"
          style={{ minHeight: 28 }}
        />
      </div>
    );
  }

  return (
    <div className="group/field flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-[0.1em] leading-none px-0.5" style={{ color: "var(--t3)" }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="m-resume-field"
      />
    </div>
  );
}

// ─── BulletEditor ─────────────────────────────────────────────────────────────

function BulletEditor({
  bullets,
  onChange,
  placeholder,
}: {
  bullets: BulletItem[];
  onChange: (bullets: BulletItem[]) => void;
  placeholder?: string;
}) {
  const handleChange = (id: string, text: string) => {
    onChange(bullets.map((b) => (b.id === id ? { ...b, text } : b)));
  };

  const handleAdd = () => {
    onChange([...bullets, { id: safeUuid(), text: "" }]);
  };

  const handleRemove = (id: string) => {
    if (bullets.length <= 1) {
      onChange([{ id: bullets[0]?.id ?? safeUuid(), text: "" }]);
    } else {
      onChange(bullets.filter((b) => b.id !== id));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, id: string, idx: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const newBullet = { id: safeUuid(), text: "" };
      const next = [...bullets];
      next.splice(idx + 1, 0, newBullet);
      onChange(next);
      // Focus next bullet after state update
      setTimeout(() => {
        const textareas = document.querySelectorAll<HTMLTextAreaElement>("[data-bullet-id]");
        const el = Array.from(textareas).find((t) => t.dataset.bulletId === newBullet.id);
        el?.focus();
      }, 30);
    }
    if (e.key === "Backspace" && (e.target as HTMLTextAreaElement).value === "" && bullets.length > 1) {
      e.preventDefault();
      handleRemove(id);
      // Focus previous
      setTimeout(() => {
        const textareas = document.querySelectorAll<HTMLTextAreaElement>("[data-bullet-id]");
        textareas[Math.max(0, idx - 1)]?.focus();
      }, 30);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {bullets.map((bullet, idx) => (
        <BulletRow
          key={bullet.id}
          bullet={bullet}
          idx={idx}
          placeholder={idx === 0 ? placeholder : "Add another bullet..."}
          onChange={handleChange}
          onRemove={handleRemove}
          onKeyDown={handleKeyDown}
        />
      ))}
      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-1.5 mt-0.5 text-[11px] font-medium transition-colors self-start"
        style={{ color: "var(--blue)" }}
      >
        <span className="w-4 h-4 rounded border flex items-center justify-center text-xs leading-none" style={{ borderColor: "var(--blue)" }}>+</span>
        Add bullet
      </button>
    </div>
  );
}

function BulletRow({
  bullet,
  idx,
  placeholder,
  onChange,
  onRemove,
  onKeyDown,
}: {
  bullet: BulletItem;
  idx: number;
  placeholder?: string;
  onChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, id: string, idx: number) => void;
}) {
  const taRef = useAutoResize(bullet.text);
  const [bulletScore, setBulletScore] = useState<BulletScore>(null);
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced bullet scoring — fires 900ms after user stops typing
  useEffect(() => {
    if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current);
    if (!bullet.text.trim() || bullet.text.trim().split(/\s+/).length < 4) {
      setBulletScore(null);
      return;
    }
    scoreTimerRef.current = setTimeout(async () => {
      try {
        const r = await dilly.post("/resume/bullet-score", { bullet: bullet.text.trim() });
        if (r.ok) {
          const d = await r.json();
          setBulletScore(d);
        }
      } catch {}
    }, 900);
    return () => { if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current); };
  }, [bullet.text]);

  const scoreColor =
    bulletScore === null ? null
    : bulletScore.score >= 80 ? "#4ade80"
    : bulletScore.score >= 55 ? "#c9a882"
    : bulletScore.score >= 30 ? "#f97316"
    : "#e07070";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <span className="mt-[7px] shrink-0 text-sm leading-none select-none" style={{ color: "var(--blue)" }}>•</span>
        <textarea
          ref={taRef}
          data-bullet-id={bullet.id}
          value={bullet.text}
          onChange={(e) => onChange(bullet.id, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, bullet.id, idx)}
          placeholder={placeholder || "Describe what you did and the impact..."}
          rows={1}
          className="flex-1 m-resume-field resize-none overflow-hidden leading-relaxed text-[13px]"
          style={{ minHeight: 28 }}
        />
        {bulletScore && (
          <div className="mt-[6px] shrink-0 flex items-center gap-0.5" title={bulletScore.label}>
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: scoreColor ?? "transparent" }}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => onRemove(bullet.id)}
          className="mt-[5px] shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors"
          style={{ color: "var(--t3)" }}
          aria-label="Remove bullet"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {/* Inline hint when bullet needs work */}
      {bulletScore && bulletScore.hints.length > 0 && bulletScore.score < 80 && (
        <div className="ml-5 flex flex-col gap-0.5">
          {bulletScore.hints.slice(0, 1).map((h, i) => (
            <p key={i} className="text-[10px] leading-snug" style={{ color: scoreColor ?? "var(--t3)" }}>
              {h}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ExperienceCard ────────────────────────────────────────────────────────────

function ExperienceCard({
  entry,
  onChange,
  onRemove,
  sectionLabel,
}: {
  entry: ExperienceEntry;
  onChange: (e: ExperienceEntry) => void;
  onRemove: () => void;
  sectionLabel: string;
}) {
  const [expanded, setExpanded] = useState(true);

  const title = entry.role || entry.company || `${sectionLabel} entry`;
  const subtitle = entry.company && entry.role ? entry.company : undefined;

  return (
    <div className="m-resume-entry-card">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate leading-snug" style={{ color: "var(--t1)" }}>
            {title}
          </p>
          {subtitle && (
            <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--t3)" }}>{subtitle}</p>
          )}
          {entry.date && (
            <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--t3)" }}>{entry.date}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-6 h-6 rounded flex items-center justify-center transition-colors"
            style={{ color: "var(--t3)" }}
            aria-label="Remove entry"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
            style={{ color: "var(--t3)" }}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded fields */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid var(--b1)" }}>
          <div className="pt-3 grid grid-cols-2 gap-2">
            <InlineField label="Role / Title" value={entry.role} onChange={(v) => onChange({ ...entry, role: v })} placeholder="Software Engineer Intern" />
            <InlineField label="Company / Org" value={entry.company} onChange={(v) => onChange({ ...entry, company: v })} placeholder="Acme Corp" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InlineField label="Date range" value={entry.date} onChange={(v) => onChange({ ...entry, date: v })} placeholder="May 2024 – Aug 2024" />
            <InlineField label="Location" value={entry.location} onChange={(v) => onChange({ ...entry, location: v })} placeholder="Tampa, FL" />
          </div>
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] leading-none block mb-2 px-0.5" style={{ color: "var(--t3)" }}>
              Bullets
            </span>
            <BulletEditor
              bullets={entry.bullets.length > 0 ? entry.bullets : [{ id: safeUuid(), text: "" }]}
              onChange={(bullets) => onChange({ ...entry, bullets })}
              placeholder={`Describe what you did as ${entry.role || "this role"}...`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ProjectCard ───────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onChange,
  onRemove,
}: {
  project: ProjectEntry;
  onChange: (p: ProjectEntry) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="m-resume-entry-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate leading-snug" style={{ color: "var(--t1)" }}>
            {project.name || "Untitled project"}
          </p>
          {project.date && <p className="text-[10px] mt-0.5" style={{ color: "var(--t3)" }}>{project.date}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-6 h-6 rounded flex items-center justify-center transition-colors"
            style={{ color: "var(--t3)" }}
            aria-label="Remove project"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
            style={{ color: "var(--t3)" }}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid var(--b1)" }}>
          <div className="pt-3">
            <InlineField label="Project name" value={project.name} onChange={(v) => onChange({ ...project, name: v })} placeholder="Machine Learning Classifier" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InlineField label="Date" value={project.date} onChange={(v) => onChange({ ...project, date: v })} placeholder="Spring 2024" />
            <InlineField label="Location" value={project.location} onChange={(v) => onChange({ ...project, location: v })} placeholder="Tampa, FL" />
          </div>
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] leading-none block mb-2 px-0.5" style={{ color: "var(--t3)" }}>
              Bullets
            </span>
            <BulletEditor
              bullets={project.bullets.length > 0 ? project.bullets : [{ id: safeUuid(), text: "" }]}
              onChange={(bullets) => onChange({ ...project, bullets })}
              placeholder="Built X using Y, resulting in Z..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SectionCard (wrapper) ────────────────────────────────────────────────────

function SectionCard({
  section,
  onChange,
}: {
  section: ResumeSection;
  onChange: (s: ResumeSection) => void;
}) {
  if (section.key === "contact") {
    const c = section.contact;
    return (
      <div className="m-resume-section-card">
        <SectionHeader label={section.label} icon="contact" />
        <div className="px-4 pb-5 space-y-3">
          <InlineField label="Full name" value={c.name} onChange={(v) => onChange({ ...section, contact: { ...c, name: v } })} placeholder="Jane Smith" />
          <div className="grid grid-cols-2 gap-2">
            <InlineField label="Email" value={c.email} onChange={(v) => onChange({ ...section, contact: { ...c, email: v } })} placeholder="jane@university.edu" />
            <InlineField label="Phone" value={c.phone} onChange={(v) => onChange({ ...section, contact: { ...c, phone: v } })} placeholder="(555) 000-0000" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InlineField label="Location" value={c.location} onChange={(v) => onChange({ ...section, contact: { ...c, location: v } })} placeholder="Tampa, FL" />
            <InlineField label="LinkedIn" value={c.linkedin} onChange={(v) => onChange({ ...section, contact: { ...c, linkedin: v } })} placeholder="linkedin.com/in/..." />
          </div>
        </div>
      </div>
    );
  }

  if (section.key === "education") {
    const e = section.education;
    return (
      <div className="m-resume-section-card">
        <SectionHeader label={section.label} icon="education" />
        <div className="px-4 pb-5 space-y-3">
          <InlineField label="University" value={e.university} onChange={(v) => onChange({ ...section, education: { ...e, university: v } })} placeholder="University of Tampa" />
          <div className="grid grid-cols-2 gap-2">
            <InlineField label="Major(s)" value={e.major} onChange={(v) => onChange({ ...section, education: { ...e, major: v } })} placeholder="B.S. Finance" />
            <InlineField label="Minor(s)" value={e.minor} onChange={(v) => onChange({ ...section, education: { ...e, minor: v } })} placeholder="Marketing" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InlineField label="Graduation date" value={e.graduation} onChange={(v) => onChange({ ...section, education: { ...e, graduation: v } })} placeholder="May 2026" />
            <InlineField label="GPA" value={e.gpa} onChange={(v) => onChange({ ...section, education: { ...e, gpa: v } })} placeholder="3.8" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InlineField label="Location" value={e.location} onChange={(v) => onChange({ ...section, education: { ...e, location: v } })} placeholder="Tampa, FL" />
            <InlineField label="Honors" value={e.honors} onChange={(v) => onChange({ ...section, education: { ...e, honors: v } })} placeholder="Dean's List, Honors Program" />
          </div>
        </div>
      </div>
    );
  }

  if (EXPERIENCE_KEYS.has(section.key)) {
    const sec = section as { key: string; label: string; experiences: ExperienceEntry[] };
    const updateEntry = (id: string, entry: ExperienceEntry) =>
      onChange({ ...section, experiences: sec.experiences.map((e) => (e.id === id ? entry : e)) } as any);
    const removeEntry = (id: string) =>
      onChange({ ...section, experiences: sec.experiences.filter((e) => e.id !== id) } as any);
    const addEntry = () =>
      onChange({
        ...section,
        experiences: [
          ...sec.experiences,
          { id: safeUuid(), company: "", role: "", date: "", location: "", bullets: [] },
        ],
      } as any);

    return (
      <div className="m-resume-section-card">
        <SectionHeader label={section.label} icon="experience" />
        <div className="px-4 pb-4 space-y-3">
          {sec.experiences.map((entry) => (
            <ExperienceCard
              key={entry.id}
              entry={entry}
              sectionLabel={section.label}
              onChange={(e) => updateEntry(entry.id, e)}
              onRemove={() => removeEntry(entry.id)}
            />
          ))}
          <button
            type="button"
            onClick={addEntry}
            className="m-resume-add-btn w-full"
          >
            <span className="text-base leading-none">+</span>
            Add {section.label.toLowerCase()} entry
          </button>
        </div>
      </div>
    );
  }

  if (section.key === "projects") {
    const sec = section as { key: "projects"; label: string; projects: ProjectEntry[] };
    const updateProject = (id: string, proj: ProjectEntry) =>
      onChange({ ...section, projects: sec.projects.map((p) => (p.id === id ? proj : p)) } as any);
    const removeProject = (id: string) =>
      onChange({ ...section, projects: sec.projects.filter((p) => p.id !== id) } as any);
    const addProject = () =>
      onChange({
        ...section,
        projects: [...sec.projects, { id: safeUuid(), name: "", date: "", location: "", bullets: [] }],
      } as any);

    return (
      <div className="m-resume-section-card">
        <SectionHeader label={section.label} icon="projects" />
        <div className="px-4 pb-4 space-y-3">
          {sec.projects.map((proj) => (
            <ProjectCard
              key={proj.id}
              project={proj}
              onChange={(p) => updateProject(proj.id, p)}
              onRemove={() => removeProject(proj.id)}
            />
          ))}
          <button
            type="button"
            onClick={addProject}
            className="m-resume-add-btn w-full"
          >
            <span className="text-base leading-none">+</span>
            Add project
          </button>
        </div>
      </div>
    );
  }

  if (SIMPLE_KEYS.has(section.key)) {
    const sec = section as { key: string; label: string; simple: SimpleSection };
    const lines = sec.simple.lines.length > 0 ? sec.simple.lines : [""];

    const updateLine = (i: number, v: string) => {
      const next = [...lines];
      next[i] = v;
      onChange({ ...section, simple: { ...sec.simple, lines: next } } as any);
    };
    const addLine = () =>
      onChange({ ...section, simple: { ...sec.simple, lines: [...lines, ""] } } as any);
    const removeLine = (i: number) => {
      if (lines.length <= 1) return;
      const next = lines.filter((_, idx) => idx !== i);
      onChange({ ...section, simple: { ...sec.simple, lines: next } } as any);
    };

    const isMultiLine = section.key === "summary_objective" || section.key === "publications_presentations";

    return (
      <div className="m-resume-section-card">
        <SectionHeader label={section.label} icon={section.key as any} />
        <div className="px-4 pb-5 space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-start gap-2">
              {!isMultiLine && <span className="mt-[7px] shrink-0 text-sm leading-none" style={{ color: "var(--blue)" }}>•</span>}
              <SimpleLineInput
                value={line}
                multiline={isMultiLine}
                onChange={(v) => updateLine(i, v)}
                placeholder={
                  section.key === "skills"
                    ? "Python, Excel, React..."
                    : section.key === "honors"
                    ? "Dean's List, Spring 2024"
                    : section.key === "certifications"
                    ? "Google Analytics Certified"
                    : section.key === "summary_objective"
                    ? "Motivated student seeking..."
                    : section.key === "relevant_coursework"
                    ? "Financial Modeling, Statistics..."
                    : "Add entry..."
                }
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="mt-[5px] shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors"
                  style={{ color: "var(--t3)" }}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1.5 mt-1 text-[11px] font-medium transition-colors"
            style={{ color: "var(--blue)" }}
          >
            <span className="w-4 h-4 rounded border flex items-center justify-center text-xs leading-none" style={{ borderColor: "var(--blue)" }}>+</span>
            Add line
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function SimpleLineInput({
  value,
  onChange,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const taRef = useAutoResize(value);
  if (multiline) {
    return (
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={1}
        className="flex-1 m-resume-field resize-none overflow-hidden leading-relaxed text-[13px]"
        style={{ minHeight: 28 }}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-1 m-resume-field"
    />
  );
}

// ─── Section icons ─────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ReactNode> = {
  contact: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  education: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 7V14m6-5v4a6 6 0 01-12 0V9" />
    </svg>
  ),
  experience: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  projects: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
  skills: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  honors: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  default: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
};

function SectionHeader({ label, icon }: { label: string; icon: string }) {
  const iconKey =
    icon === "professional_experience" || icon === "research" || icon === "campus_involvement" || icon === "volunteer_experience"
      ? "experience"
      : SECTION_ICONS[icon]
      ? icon
      : "default";

  return (
    <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
      <div className="w-6 h-6 rounded-[8px] flex items-center justify-center shrink-0" style={{ background: "var(--bdim)", border: "1px solid var(--blue)", color: "var(--blue)" }}>
        {SECTION_ICONS[iconKey] ?? SECTION_ICONS.default}
      </div>
      <h3 className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--t1)" }}>{label}</h3>
    </div>
  );
}

// ─── Add-section picker ────────────────────────────────────────────────────────

const ADD_SECTION_OPTIONS: { key: string; label: string }[] = [
  { key: "professional_experience", label: "Experience" },
  { key: "research", label: "Research" },
  { key: "campus_involvement", label: "Campus Involvement" },
  { key: "volunteer_experience", label: "Volunteer Experience" },
  { key: "projects", label: "Projects" },
  { key: "skills", label: "Skills" },
  { key: "honors", label: "Honors & Awards" },
  { key: "certifications", label: "Certifications" },
  { key: "summary_objective", label: "Summary / Objective" },
  { key: "relevant_coursework", label: "Relevant Coursework" },
  { key: "publications_presentations", label: "Publications & Presentations" },
];

function AddSectionPicker({
  existingKeys,
  onAdd,
  onClose,
}: {
  existingKeys: Set<string>;
  onAdd: (key: string, label: string) => void;
  onClose: () => void;
}) {
  const available = ADD_SECTION_OPTIONS.filter((o) => !existingKeys.has(o.key));
  if (available.length === 0) return null;

  return (
    <div className="rounded-[18px] overflow-hidden animate-fade-up" style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderLeft: "4px solid var(--blue)" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--b1)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t3)" }}>Add section</span>
        <button type="button" onClick={onClose} className="transition-colors" style={{ color: "var(--t3)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-2 grid grid-cols-2 gap-1">
        {available.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => { onAdd(opt.key, opt.label); onClose(); }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-[12px] text-[12px] transition-colors text-left"
            style={{ color: "var(--t2)" }}
          >
            <span className="shrink-0" style={{ color: "var(--blue)" }}>{SECTION_ICONS[opt.key] ?? SECTION_ICONS.default}</span>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: "success" | "error" | "info" }) {
  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50 flex items-center gap-2 max-w-[calc(375px-32px)] animate-fade-up whitespace-nowrap ${
        type === "success"
          ? "bg-[#1a2e1f] border border-[rgba(74,222,128,0.3)] text-[#4ade80]"
          : type === "error"
          ? "bg-[#2e1a1a] border border-[rgba(224,112,112,0.3)] text-[#e07070]"
          : "bg-[var(--s3)] border border-[var(--b1)] text-[var(--t1)]"
      }`}
    >
      {type === "success" && (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      {type === "error" && (
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      {message}
    </div>
  );
}

// ─── Unsaved changes indicator ─────────────────────────────────────────────────

function UnsavedDot() {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full animate-pulse"
      style={{ background: "var(--blue)" }}
      aria-label="Unsaved changes"
    />
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ResumeEditPage({ onBack, initialAudit }: { onBack?: () => void; initialAudit?: import("@/types/dilly").AuditV2 | null } = {}) {
  const router = useRouter();
  const [sections, setSections] = useState<ResumeSection[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [sourceAuditId, setSourceAuditId] = useState<string | undefined>();
  const sourceAuditIdRef = useRef<string | undefined>(undefined);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sourceAuditIdRef.current = sourceAuditId;
  }, [sourceAuditId]);

  const { showVoiceNotification } = useDillyVoiceNotification();
  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  // Load resume: if initialAudit prop provided, use it directly; otherwise try local cache then API
  useEffect(() => {
    let cancelled = false;

    /** Best text source for section parsing: structured_text, or resume_text if it has [SECTION] markers. */
    const structuredSourceFromAudit = (a: AuditV2 | undefined): string | null => {
      if (!a) return null;
      const st = (a.structured_text || "").trim();
      if (st) return st;
      const rt = (a.resume_text || "").trim();
      if (rt && /\[[^\]]+\]/.test(rt)) return rt;
      return null;
    };

    // Fast path: use audit passed in as prop (page.tsx already has it loaded)
    if (initialAudit) {
      const src = structuredSourceFromAudit(initialAudit);
      if (src) {
        const parsedSections = parseStructuredText(src, initialAudit.candidate_name);
        if (parsedSections.length > 0) {
          setSections(parsedSections);
          setSourceAuditId(initialAudit.id);
        }
      }
      setInitializing(false);
      return () => { cancelled = true; };
    }

    // 1. Instant path: parse from locally-cached audit (no network)
    try {
      let email: string | null = null;
      const userCache =
        typeof sessionStorage !== "undefined" ? sessionStorage.getItem(AUTH_USER_CACHE_KEY) : null;
      if (userCache) {
        const parsed = JSON.parse(userCache);
        if (parsed?.email) email = String(parsed.email).toLowerCase().trim();
      }
      if (email) {
        const cached = localStorage.getItem(auditStorageKey(email));
        if (cached) {
          const audit: AuditV2 = JSON.parse(cached);
          const src = structuredSourceFromAudit(audit);
          if (src) {
            const parsedSections = parseStructuredText(src, audit.candidate_name);
            if (parsedSections.length > 0) {
              setSections(parsedSections);
              setSourceAuditId(audit.id);
              setInitializing(false);
            }
          }
        }
      }
    } catch {
      /* ignore, try API next */
    }

    // 2. Background: try server-saved resume (may have newer edits), then /audit/latest
    const loadFromApi = async () => {
      try {
        const res = await dilly.fetch("/resume/edited");
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.resume?.sections?.length > 0) {
            setSections(data.resume.sections as ResumeSection[]);
            setSourceAuditId(data.resume.source_audit_id);
            return;
          }
        }
        // Fallback: pull latest full audit directly (single call)
        const latestRes = await dilly.fetch("/audit/latest");
        if (!cancelled && latestRes.ok) {
          const full = await latestRes.json();
          const a = full?.audit as AuditV2 | undefined;
          const src = structuredSourceFromAudit(a);
          if (src && a) {
            const parsedSections = parseStructuredText(src, a.candidate_name);
            if (parsedSections.length > 0) {
              setSections(parsedSections);
              setSourceAuditId(a.id);
            }
          }
        }
      } catch {
        /* API unavailable — local cache is fine */
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };
    loadFromApi();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, initialAudit]);

  const doSave = useCallback(async (currentSections: ResumeSection[], opts?: { silent?: boolean }): Promise<boolean> => {
    const silent = !!opts?.silent;
    if (currentSections.length === 0) return false;
    if (!silent) setSaving(true);
    try {
      const res = await dilly.post(
        "/resume/save",
        { sections: currentSections, source_audit_id: sourceAuditIdRef.current }
      );
      if (res.ok) {
        setDirty(false);
        if (!silent) showToast("Resume saved", "success");
        return true;
      }
      if (!silent) showToast("Save failed. Try again.", "error");
      return false;
    } catch {
      if (!silent) showToast("Save failed. Check connection.", "error");
      return false;
    } finally {
      if (!silent) setSaving(false);
    }
  }, [showToast]);

  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;

  // Auto-save after 2s of no changes — silent (no "Saving..." / disabled Save) so editing stays fluid.
  const handleSectionChange = useCallback((index: number, updated: ResumeSection) => {
    setSections((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
    setDirty(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      setSections((current) => {
        void doSaveRef.current(current, { silent: true });
        return current;
      });
    }, 2000);
  }, []);

  const handleSave = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    void doSave(sections, { silent: false });
  };

  const handleAudit = async () => {
    // Save first, then audit
    setSaving(true);
    const savedOk = await doSave(sections, { silent: true });
    if (!savedOk) {
      setSaving(false);
      showToast("Save failed. Check connection and try again.", "error");
      return;
    }
    setSaving(false);

    setAuditing(true);
    showToast("Running audit on your edited resume...", "info");

    try {
      const res = await dilly.post("/resume/audit", {});
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Audit failed. Try again.", "error");
        setAuditing(false);
        return;
      }
      const auditResult: AuditV2 = await res.json();

      // Store audit in localStorage (same key as normal audit flow)
      const userRes = await dilly.fetch("/auth/me");
      if (userRes.ok) {
        const user = await userRes.json();
        localStorage.setItem(auditStorageKey(user.email), JSON.stringify(auditResult));
      }

      showToast("Audit complete! Redirecting to Career Center...", "success");
      showVoiceNotification("I noted your new audit. Ask me about your scores or what to do next.");
      setTimeout(() => router.push("/?tab=report&audit_refresh=1"), 1200);
    } catch {
      showToast("Audit failed. Check connection.", "error");
    } finally {
      setAuditing(false);
    }
  };

  const handleAddSection = (key: string, label: string) => {
    let newSection: ResumeSection;
    if (key === "education") {
      newSection = {
        key: "education",
        label,
        education: { id: safeUuid(), university: "", major: "", minor: "", graduation: "", location: "", honors: "", gpa: "" },
      };
    } else if (EXPERIENCE_KEYS.has(key)) {
      newSection = {
        key: key as any,
        label,
        experiences: [{ id: safeUuid(), company: "", role: "", date: "", location: "", bullets: [] }],
      };
    } else if (key === "projects") {
      newSection = {
        key: "projects",
        label,
        projects: [{ id: safeUuid(), name: "", date: "", location: "", bullets: [] }],
      };
    } else {
      newSection = { key: key as any, label, simple: { id: safeUuid(), lines: [""] } };
    }
    setSections((prev) => [...prev, newSection]);
    setDirty(true);
  };

  const existingKeys = new Set(sections.map((s) => s.key));

  // ─── Empty state ───────────────────────────────────────────────────────────

  if (auditing) {
    return (
      <LoadingScreen
        message="Running audit on your resume…"
        className="career-center-talent"
        style={{ background: "var(--bg)" }}
        variant="career-center"
      />
    );
  }

  if (initializing && sections.length === 0) {
    return (
      <div
        className="career-center-talent min-h-[100dvh] min-h-screen flex flex-col"
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}
      >
        <div className="w-full max-w-[375px] mx-auto px-5 pt-6 flex flex-col flex-1 min-h-0 pb-32">
          <AppProfileHeader back={onBack ?? getCareerCenterReturnPath()} />
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <span className="w-8 h-8 rounded-full border-2 border-[var(--blue)] border-t-transparent animate-spin" />
            <p className="text-[13px]" style={{ color: "var(--t3)" }}>Loading your resume…</p>
          </div>
        </div>
        <CareerCenterMinibar active="edit" aboveBottomNav={false} />
      </div>
    );
  }

  if (!initializing && sections.length === 0) {
    return (
      <div
        className="career-center-talent min-h-[100dvh] min-h-screen flex flex-col template-pop-in"
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}
      >
        <div className="w-full max-w-[375px] mx-auto px-5 pt-6 flex flex-col flex-1 min-h-0 pb-32">
          <AppProfileHeader back={onBack ?? getCareerCenterReturnPath()} />
          <div className="flex-1 flex flex-col items-center justify-center gap-5 py-8 min-h-[min(420px,50dvh)]">
            <div className="w-16 h-16 rounded-[18px] flex items-center justify-center" style={{ background: "var(--bdim)", border: "1px solid var(--blue)" }}>
              <svg className="w-8 h-8" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-[15px] font-semibold mb-1" style={{ color: "var(--t1)" }}>No resume to edit yet</p>
              <p className="text-[12px] max-w-[260px] leading-relaxed" style={{ color: "var(--t3)" }}>
                Once a resume is on file from the Hiring tab, you can edit it here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onBack ? onBack() : router.push("/")}
              className="px-6 py-2.5 rounded-[12px] text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--blue)", color: "#fff" }}
            >
              Career Center
            </button>
          </div>
        </div>
        <CareerCenterMinibar active="edit" aboveBottomNav={false} />
      </div>
    );
  }

  // ─── Main UI ───────────────────────────────────────────────────────────────

  return (
    <div
      className="career-center-talent min-h-[100dvh] min-h-screen"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}
    >
      <div className="w-full max-w-[375px] mx-auto px-4 pt-0 pb-60 min-h-0">
        <div className="template-pop-in mb-2" style={{ animationDelay: "50ms" }}>
          <AppProfileHeader
            back={onBack ?? getCareerCenterReturnPath()}
            titleSuffix={dirty && !saving ? <UnsavedDot /> : undefined}
          />
        </div>

        {/* Subline */}
        <p className="text-[11px] mb-5 leading-relaxed px-0.5 template-pop-in" style={{ animationDelay: "100ms", color: "var(--t3)" }}>
          Edit sections, bullets, and details. Changes auto-save as you type.
          Re-audit when you&rsquo;re done to see your new scores.
        </p>

        {/* Section list */}
        <div className="flex flex-col gap-3">
          {sections.map((section, index) => (
            <div key={`${section.key}-${index}`} className="template-pop-in" style={{ animationDelay: `${150 + index * 50}ms` }}>
              <SectionCard
                section={section}
                onChange={(updated) => handleSectionChange(index, updated)}
              />
            </div>
          ))}
        </div>

        {/* Add section */}
        <div className="mt-4 template-pop-in" style={{ animationDelay: `${150 + sections.length * 50 + 30}ms` }}>
          {showAddSection ? (
            <AddSectionPicker
              existingKeys={existingKeys}
              onAdd={handleAddSection}
              onClose={() => setShowAddSection(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddSection(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-[18px] border border-dashed text-[12px] transition-all"
              style={{ borderColor: "var(--b2)", color: "var(--t3)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add section
            </button>
          )}
        </div>

        {/* Dilly tip */}
        <div className="mt-5 px-4 py-3.5 rounded-[18px] template-pop-in" style={{ animationDelay: `${150 + sections.length * 50 + 80}ms`, background: "var(--bdim)", border: "1px solid var(--blue)" }}>
          <p className="text-[11px] font-medium leading-relaxed" style={{ color: "var(--blue)" }}>
            <span className="font-bold">Dilly tip:</span> Strong bullets start with an action verb, include what you used, and end with an impact. &ldquo;Developed X using Y, increasing Z by N%.&rdquo;
          </p>
        </div>
      </div>

      {/* Bottom dock: minibar above actions; frosted strip below buttons blurs scrolled content + home strip */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 flex flex-col items-stretch template-pop-in"
        style={{ animationDelay: "80ms" }}
      >
        <CareerCenterMinibar active="edit" fixed={false} />
        <div
          className="w-full"
          style={{
            background: "rgba(10, 10, 12, 0.88)",
            backdropFilter: "blur(28px) saturate(1.1)",
            WebkitBackdropFilter: "blur(28px) saturate(1.1)",
          }}
        >
          <div className="max-w-[375px] mx-auto px-4 pt-3 pb-1 flex flex-row flex-nowrap items-stretch gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="min-w-0 flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-3 rounded-[12px] text-[12px] sm:text-[13px] font-semibold transition-colors disabled:opacity-40 whitespace-nowrap"
              style={{ border: "1px solid var(--b1)", color: "var(--t2)", background: "var(--s2)" }}
            >
              {saving ? (
                <span className="w-4 h-4 shrink-0 rounded-full border-2 border-[var(--t3)] border-t-transparent animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
              )}
              {saving ? "Saving..." : dirty ? "Save" : "Saved"}
            </button>

            <button
              type="button"
              onClick={handleAudit}
              disabled={auditing || saving}
              className="min-w-0 flex-[2] flex items-center justify-center gap-1.5 sm:gap-2 py-3 rounded-[12px] text-[12px] sm:text-[13px] font-bold transition-all disabled:opacity-50 active:scale-[0.98] whitespace-nowrap"
              style={{
                background: auditing ? "var(--s3)" : "var(--blue)",
                color: auditing ? "var(--t3)" : "#fff",
              }}
            >
              {auditing ? (
                <>
                  <span className="w-4 h-4 shrink-0 rounded-full border-2 border-[var(--t3)] border-t-transparent animate-spin" />
                  Auditing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Re-audit resume
                </>
              )}
            </button>
          </div>
          {/* Blur band under buttons: scrolled page shows through blurred (backdrop), clears home indicator */}
          <div
            className="w-full pointer-events-none shrink-0"
            aria-hidden
            style={{
              minHeight: "max(26px, calc(env(safe-area-inset-bottom, 0px) + 14px))",
            }}
          />
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
