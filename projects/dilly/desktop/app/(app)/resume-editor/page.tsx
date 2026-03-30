'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '@/lib/api';
import CompanyLogo from '@/components/jobs/CompanyLogo';
import { useRightPanel } from '@/app/(app)/layout';

/* ═══════════════════════════════════════
   TYPES
═══════════════════════════════════════ */
interface Bullet { id: string; text: string; }
interface ContactSection { name: string; email: string; phone: string; location: string; linkedin: string; github?: string; portfolio?: string; }
interface EducationEntry { id: string; university: string; major: string; minor: string; graduation: string; location: string; honors: string; gpa: string; coursework?: string; }
interface ExperienceEntry { id: string; company: string; role: string; date: string; location: string; bullets: Bullet[]; }
interface ProjectEntry { id: string; name: string; date: string; location: string; tech?: string; bullets: Bullet[]; }
interface SimpleSection { id?: string; lines: string[]; }
interface ResumeSection {
  key: string; label: string;
  contact?: ContactSection | null;
  education?: EducationEntry | null;
  experiences?: ExperienceEntry[] | null;
  projects?: ProjectEntry[] | null;
  simple?: SimpleSection | null;
  leadership?: ExperienceEntry[] | null;
}
interface BulletScore { score: number; label: string; hints: string[]; }

/* ═══════════════════════════════════════
   COHORT TEMPLATES
═══════════════════════════════════════ */
interface Template {
  fontFamily: string; headerAlign: 'left' | 'center'; nameSize: number;
  sectionOrder: string[]; sectionLabel: Record<string, string>;
  hasSummary: boolean; showGPA: 'always' | 'if35' | 'never';
  showGithub: boolean; showPortfolio: boolean;
  accentColor: string; dividerStyle: 'underline' | 'rule';
  tip: string;
}

const TEMPLATES: Record<string, Template> = {
  'Software Engineering & CS': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 20,
    sectionOrder: ['contact', 'skills', 'education', 'experience', 'projects'],
    sectionLabel: { skills: 'Technical Skills', experience: 'Experience', education: 'Education', projects: 'Projects' },
    hasSummary: false, showGPA: 'if35', showGithub: true, showPortfolio: false,
    accentColor: '#2B3A8E', dividerStyle: 'rule',
    tip: 'GitHub link and a Projects section are table stakes at FAANG and top SWE internships. Skip the summary.',
  },
  'Data Science & Analytics': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 20,
    sectionOrder: ['contact', 'skills', 'education', 'experience', 'projects'],
    sectionLabel: { skills: 'Technical Skills', experience: 'Experience', education: 'Education', projects: 'Projects & Research' },
    hasSummary: false, showGPA: 'if35', showGithub: true, showPortfolio: false,
    accentColor: '#7C3AED', dividerStyle: 'rule',
    tip: 'List tools explicitly: Python, SQL, TensorFlow, Tableau. Quantify model outcomes (accuracy %, rows processed).',
  },
  'Cybersecurity & IT': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'skills', 'education', 'experience', 'projects'],
    sectionLabel: { skills: 'Technical Skills & Certifications', experience: 'Experience', education: 'Education', projects: 'CTF & Security Projects' },
    hasSummary: false, showGPA: 'if35', showGithub: true, showPortfolio: false,
    accentColor: '#0F766E', dividerStyle: 'rule',
    tip: 'List certifications (CompTIA, CEH, CISSP) near the top. CTF wins and CVEs are strong Build signals.',
  },
  'Finance & Accounting': {
    fontFamily: '"Garamond", "Times New Roman", serif', headerAlign: 'center', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'leadership', 'skills'],
    sectionLabel: { education: 'Education', experience: 'Experience', leadership: 'Leadership & Activities', skills: 'Skills' },
    hasSummary: false, showGPA: 'always', showGithub: false, showPortfolio: false,
    accentColor: '#2B3A8E', dividerStyle: 'rule',
    tip: 'Wall Street standard: centered header, Garamond, Education first. Goldman informally screens for 3.7+ GPA.',
  },
  'Marketing & Advertising': {
    fontFamily: '"Lato", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'experience', 'education', 'skills', 'projects'],
    sectionLabel: { experience: 'Experience', skills: 'Skills & Tools', education: 'Education', projects: 'Campaigns & Portfolio' },
    hasSummary: true, showGPA: 'if35', showGithub: false, showPortfolio: true,
    accentColor: '#DB2777', dividerStyle: 'rule',
    tip: 'Quantify campaign impact: CTR, ROAS, follower growth. A portfolio link is more powerful than GPA here.',
  },
  'Consulting & Strategy': {
    fontFamily: '"Garamond", "Times New Roman", serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'leadership', 'skills'],
    sectionLabel: { education: 'Education', experience: 'Work Experience', leadership: 'Leadership & Extracurriculars', skills: 'Additional Information' },
    hasSummary: false, showGPA: 'always', showGithub: false, showPortfolio: false,
    accentColor: '#7C3AED', dividerStyle: 'rule',
    tip: 'MBB standard: left-aligned, dense text, Leadership section required. Every bullet needs a metric.',
  },
  'Management & Operations': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'leadership', 'skills'],
    sectionLabel: { education: 'Education', experience: 'Experience', leadership: 'Leadership & Activities', skills: 'Skills' },
    hasSummary: false, showGPA: 'if35', showGithub: false, showPortfolio: false,
    accentColor: '#0369A1', dividerStyle: 'rule',
    tip: 'Highlight team size managed and process improvements. Operations roles want numbers: cost savings, throughput gains.',
  },
  'Economics & Public Policy': {
    fontFamily: '"Garamond", "Times New Roman", serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'leadership', 'skills'],
    sectionLabel: { education: 'Education', experience: 'Work & Research Experience', leadership: 'Leadership & Public Service', skills: 'Skills & Languages' },
    hasSummary: false, showGPA: 'always', showGithub: false, showPortfolio: false,
    accentColor: '#1D4ED8', dividerStyle: 'rule',
    tip: 'Policy employers value research, publications, and government exposure. List languages and statistical tools.',
  },
  'Entrepreneurship & Innovation': {
    fontFamily: '"Lato", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'experience', 'projects', 'education', 'skills'],
    sectionLabel: { experience: 'Ventures & Experience', projects: 'Products & Initiatives', education: 'Education', skills: 'Skills & Tools' },
    hasSummary: true, showGPA: 'never', showGithub: true, showPortfolio: true,
    accentColor: '#EA580C', dividerStyle: 'rule',
    tip: 'VCs and accelerators care about what you shipped, not your GPA. Lead with outcomes: revenue, users, funding raised.',
  },
  'Healthcare & Clinical': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'skills', 'experience', 'education', 'projects'],
    sectionLabel: { skills: 'Licensure & Certifications', experience: 'Clinical Experience', education: 'Education', projects: 'Skills & Competencies' },
    hasSummary: true, showGPA: 'never', showGithub: false, showPortfolio: false,
    accentColor: '#0284C7', dividerStyle: 'rule',
    tip: 'Certifications go near the top — hospital recruiters confirm licensure before reading anything else.',
  },
  'Life Sciences & Research': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'skills', 'experience', 'education', 'projects'],
    sectionLabel: { experience: 'Research Experience', skills: 'Technical & Laboratory Skills', projects: 'Publications & Presentations', education: 'Education' },
    hasSummary: true, showGPA: 'always', showGithub: false, showPortfolio: false,
    accentColor: '#16A34A', dividerStyle: 'rule',
    tip: 'List lab techniques explicitly — CRISPR, PCR, flow cytometry. These are ATS keywords for biotech hiring.',
  },
  'Physical Sciences & Math': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'skills', 'experience', 'education', 'projects'],
    sectionLabel: { experience: 'Research Experience', skills: 'Technical Skills', projects: 'Publications & Coursework', education: 'Education' },
    hasSummary: true, showGPA: 'always', showGithub: false, showPortfolio: false,
    accentColor: '#0F766E', dividerStyle: 'rule',
    tip: 'Math and physics employers want proof of rigor: coursework, competition results, and research outcomes.',
  },
  'Social Sciences & Nonprofit': {
    fontFamily: '"Garamond", "Times New Roman", serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'leadership', 'skills'],
    sectionLabel: { education: 'Education', experience: 'Work Experience', leadership: 'Volunteer & Community Work', skills: 'Additional Information' },
    hasSummary: false, showGPA: 'always', showGithub: false, showPortfolio: false,
    accentColor: '#7C3AED', dividerStyle: 'rule',
    tip: 'Nonprofits weight mission alignment heavily. Quantify community impact: people served, funds raised, programs launched.',
  },
  'Media & Communications': {
    fontFamily: '"Lato", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'experience', 'skills', 'education', 'projects'],
    sectionLabel: { experience: 'Experience', skills: 'Skills & Tools', education: 'Education', projects: 'Portfolio & Selected Work' },
    hasSummary: true, showGPA: 'never', showGithub: false, showPortfolio: true,
    accentColor: '#DB2777', dividerStyle: 'rule',
    tip: 'Portfolio and bylined work matter most. A published piece outweighs honor roll at media companies.',
  },
  'Design & Creative': {
    fontFamily: '"Lato", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'experience', 'skills', 'projects', 'education'],
    sectionLabel: { experience: 'Experience', skills: 'Tools & Skills', projects: 'Selected Work', education: 'Education' },
    hasSummary: true, showGPA: 'never', showGithub: false, showPortfolio: true,
    accentColor: '#E11D48', dividerStyle: 'rule',
    tip: 'Portfolio link is the most important thing on this resume. Figma, Adobe CC, and UX process keywords are ATS gold.',
  },
  'Legal & Compliance': {
    fontFamily: '"Garamond", "Times New Roman", serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'leadership', 'skills'],
    sectionLabel: { education: 'Education', experience: 'Legal Experience', leadership: 'Activities & Honors', skills: 'Additional Information' },
    hasSummary: false, showGPA: 'always', showGithub: false, showPortfolio: false,
    accentColor: '#1E3A8A', dividerStyle: 'rule',
    tip: 'Law firms expect GPA front and center. Moot court, law review, and clerkship experience carry heavy weight.',
  },
  'Human Resources & People': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'leadership', 'skills'],
    sectionLabel: { education: 'Education', experience: 'Experience', leadership: 'Leadership & Activities', skills: 'Skills & Certifications' },
    hasSummary: false, showGPA: 'if35', showGithub: false, showPortfolio: false,
    accentColor: '#0369A1', dividerStyle: 'rule',
    tip: 'SHRM certifications and headcount metrics (time-to-hire reduced, retention improved) are strong HR signals.',
  },
  'Supply Chain & Logistics': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'skills', 'projects'],
    sectionLabel: { education: 'Education', experience: 'Experience', skills: 'Tools & Certifications', projects: 'Projects & Case Studies' },
    hasSummary: false, showGPA: 'if35', showGithub: false, showPortfolio: false,
    accentColor: '#B45309', dividerStyle: 'rule',
    tip: 'Quantify inventory impact, cost savings, and lead time reductions. APICS certification is a strong differentiator.',
  },
  'Education & Teaching': {
    fontFamily: '"Garamond", "Times New Roman", serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'leadership', 'skills'],
    sectionLabel: { education: 'Education', experience: 'Teaching Experience', leadership: 'Extracurriculars & Service', skills: 'Certifications & Skills' },
    hasSummary: true, showGPA: 'if35', showGithub: false, showPortfolio: false,
    accentColor: '#16A34A', dividerStyle: 'rule',
    tip: 'Teaching licenses and student outcome data (proficiency gains, pass rates) are expected in education resumes.',
  },
  'Real Estate & Construction': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'skills', 'projects'],
    sectionLabel: { education: 'Education', experience: 'Experience', skills: 'Licenses & Skills', projects: 'Deals & Projects' },
    hasSummary: false, showGPA: 'if35', showGithub: false, showPortfolio: false,
    accentColor: '#B45309', dividerStyle: 'rule',
    tip: 'Deal volume and square footage matter in real estate. List licenses near the top and quantify project budgets.',
  },
  'Environmental & Sustainability': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'skills', 'experience', 'education', 'projects'],
    sectionLabel: { skills: 'Technical & Field Skills', experience: 'Experience', education: 'Education', projects: 'Research & Projects' },
    hasSummary: true, showGPA: 'if35', showGithub: false, showPortfolio: false,
    accentColor: '#16A34A', dividerStyle: 'rule',
    tip: 'GIS proficiency, field experience, and EPA/DEQ project work are ATS keywords in environmental recruiting.',
  },
  'Hospitality & Events': {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'experience', 'education', 'skills', 'projects'],
    sectionLabel: { experience: 'Experience', skills: 'Certifications & Skills', education: 'Education', projects: 'Events & Signature Projects' },
    hasSummary: true, showGPA: 'if35', showGithub: false, showPortfolio: false,
    accentColor: '#EA580C', dividerStyle: 'rule',
    tip: 'Highlight event scale (attendees, budget managed) and software proficiency (Eventbrite, Cvent, OPERA).',
  },
  General: {
    fontFamily: '"Calibri", "Arial", sans-serif', headerAlign: 'left', nameSize: 18,
    sectionOrder: ['contact', 'education', 'experience', 'skills', 'projects'],
    sectionLabel: { experience: 'Experience', skills: 'Skills', education: 'Education', projects: 'Projects' },
    hasSummary: false, showGPA: 'if35', showGithub: false, showPortfolio: false,
    accentColor: '#2B3A8E', dividerStyle: 'rule',
    tip: 'Quantify every bullet with a metric. Recruiters spend 7 seconds on a first pass.',
  },
};

function getTemplate(cohort: string): Template {
  return TEMPLATES[cohort] ?? TEMPLATES.General;
}

/* ═══════════════════════════════════════
   BULLET SCORE CACHE + DEBOUNCE HOOK
═══════════════════════════════════════ */
const scoreCache = new Map<string, BulletScore>();

function useBulletScore(text: string): BulletScore | null {
  const [score, setScore] = useState<BulletScore | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!text || text.length < 10) { setScore(null); return; }
    if (scoreCache.has(text)) { setScore(scoreCache.get(text)!); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch('/resume/bullet-score', { method: 'POST', body: JSON.stringify({ bullet: text }) });
        if (res.ok) {
          const data = await res.json();
          scoreCache.set(text, data);
          setScore(data);
        }
      } catch { /* silent */ }
    }, 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [text]);

  return score;
}

/* ═══════════════════════════════════════
   RESUME PAPER (LIVE PREVIEW)
═══════════════════════════════════════ */
function ResumeSection_Rule({ label, t }: { label: string; t: Template }) {
  return (
    <div style={{ marginTop: 11, marginBottom: 4 }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 2px', color: '#111', fontFamily: t.fontFamily }}>
        {label}
      </p>
      <div style={{ height: 1, background: '#222', marginBottom: 4 }} />
    </div>
  );
}

function ResumeContact({ section, t }: { section: ResumeSection; t: Template }) {
  const c = section.contact;
  if (!c) return null;
  const parts = [c.email, c.phone, c.location, c.linkedin && `linkedin.com/in/${c.linkedin.replace(/.*linkedin\.com\/in\//,'')}`].filter(Boolean);
  if (t.showGithub && c.github) parts.push(c.github.replace('https://', ''));
  if (t.showPortfolio && c.portfolio) parts.push(c.portfolio.replace('https://', ''));
  return (
    <div style={{ textAlign: t.headerAlign, marginBottom: 6 }}>
      <p style={{ fontSize: t.nameSize, fontWeight: 700, margin: '0 0 3px', fontFamily: t.fontFamily, color: '#111', letterSpacing: '-0.01em' }}>
        {c.name || 'Your Name'}
      </p>
      <p style={{ fontSize: 9, color: '#444', margin: 0, fontFamily: t.fontFamily }}>
        {parts.join(' | ')}
      </p>
    </div>
  );
}

function ResumeEducation({ section, t }: { section: ResumeSection; t: Template }) {
  const e = section.education;
  if (!e) return null;
  return (
    <>
      <ResumeSection_Rule label={t.sectionLabel.education ?? 'Education'} t={t} />
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p style={{ fontSize: 10.5, fontWeight: 700, margin: 0, fontFamily: t.fontFamily, color: '#111' }}>{e.university || 'University'}</p>
          <p style={{ fontSize: 9.5, color: '#444', margin: 0, fontFamily: t.fontFamily }}>{e.location}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p style={{ fontSize: 9.5, margin: '1px 0', fontFamily: t.fontFamily, color: '#333' }}>
            {e.major}{e.minor ? `, Minor in ${e.minor}` : ''}
            {(t.showGPA === 'always' || (t.showGPA === 'if35' && parseFloat(e.gpa) >= 3.5)) && e.gpa ? ` | GPA: ${e.gpa}` : ''}
            {e.honors ? ` | ${e.honors}` : ''}
          </p>
          <p style={{ fontSize: 9.5, color: '#444', margin: 0, fontFamily: t.fontFamily }}>{e.graduation}</p>
        </div>
        {e.coursework && <p style={{ fontSize: 9, color: '#555', margin: '1px 0', fontFamily: t.fontFamily }}>Relevant Coursework: {e.coursework}</p>}
      </div>
    </>
  );
}

function ResumeExperienceList({ entries, label, t }: { entries: ExperienceEntry[]; label: string; t: Template }) {
  if (!entries?.length) return null;
  return (
    <>
      <ResumeSection_Rule label={label} t={t} />
      {entries.map(exp => (
        <div key={exp.id} style={{ marginBottom: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, margin: 0, fontFamily: t.fontFamily, color: '#111' }}>{exp.company || 'Company'}</p>
            <p style={{ fontSize: 9.5, color: '#444', margin: 0, fontFamily: t.fontFamily }}>{exp.date}</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={{ fontSize: 9.5, fontStyle: 'italic', margin: '1px 0 3px', fontFamily: t.fontFamily, color: '#333' }}>{exp.role}</p>
            <p style={{ fontSize: 9.5, color: '#555', margin: 0, fontFamily: t.fontFamily }}>{exp.location}</p>
          </div>
          {exp.bullets?.map(b => (
            <div key={b.id} style={{ display: 'flex', gap: 5, marginBottom: 1.5 }}>
              <span style={{ fontSize: 9.5, flexShrink: 0, marginTop: 1, fontFamily: t.fontFamily }}>•</span>
              <p style={{ fontSize: 9.5, margin: 0, lineHeight: 1.35, color: '#222', fontFamily: t.fontFamily }}>{b.text}</p>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function ResumeProjects({ section, t }: { section: ResumeSection; t: Template }) {
  const projects = section.projects;
  if (!projects?.length) return null;
  const label = t.sectionLabel.projects ?? 'Projects';
  return (
    <>
      <ResumeSection_Rule label={label} t={t} />
      {projects.map(p => (
        <div key={p.id} style={{ marginBottom: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, margin: 0, fontFamily: t.fontFamily, color: '#111' }}>
              {p.name}{p.tech ? <span style={{ fontWeight: 400, fontSize: 9, color: '#555' }}> | {p.tech}</span> : null}
            </p>
            <p style={{ fontSize: 9.5, color: '#444', margin: 0, fontFamily: t.fontFamily }}>{p.date}</p>
          </div>
          {p.bullets?.map(b => (
            <div key={b.id} style={{ display: 'flex', gap: 5, marginBottom: 1.5 }}>
              <span style={{ fontSize: 9.5, flexShrink: 0, marginTop: 1 }}>•</span>
              <p style={{ fontSize: 9.5, margin: 0, lineHeight: 1.35, color: '#222', fontFamily: t.fontFamily }}>{b.text}</p>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function ResumeSkills({ section, t }: { section: ResumeSection; t: Template }) {
  const s = section.simple;
  if (!s?.lines?.length) return null;
  return (
    <>
      <ResumeSection_Rule label={t.sectionLabel.skills ?? 'Skills'} t={t} />
      {s.lines.map((line, i) => (
        <p key={i} style={{ fontSize: 9.5, margin: '0 0 2px', color: '#222', fontFamily: t.fontFamily }}>{line}</p>
      ))}
    </>
  );
}

function ResumePaper({
  sections, cohort, contentRef, overflowRef,
}: {
  sections: ResumeSection[]; cohort: string;
  contentRef: React.RefObject<HTMLDivElement>;
  overflowRef: React.RefObject<HTMLDivElement>;
}) {
  const t = getTemplate(cohort);
  const byKey = Object.fromEntries(sections.map(s => [s.key, s]));

  function renderSection(key: string) {
    switch (key) {
      case 'contact': return <ResumeContact key={key} section={byKey.contact ?? { key: 'contact', label: 'Contact' }} t={t} />;
      case 'education': return <ResumeEducation key={key} section={byKey.education ?? { key: 'education', label: 'Education' }} t={t} />;
      case 'experience': return (
        <ResumeExperienceList key={key}
          entries={(byKey.professional_experience ?? byKey.experience)?.experiences ?? []}
          label={t.sectionLabel.experience ?? 'Experience'} t={t} />
      );
      case 'leadership': return (
        <ResumeExperienceList key={key}
          entries={byKey.leadership?.experiences ?? []}
          label={t.sectionLabel.leadership ?? 'Leadership & Activities'} t={t} />
      );
      case 'projects': return <ResumeProjects key={key} section={byKey.projects ?? { key: 'projects', label: 'Projects' }} t={t} />;
      case 'skills': return <ResumeSkills key={key} section={byKey.skills ?? { key: 'skills', label: 'Skills' }} t={t} />;
      default: return null;
    }
  }

  return (
    <div ref={contentRef} style={{ fontFamily: t.fontFamily, padding: '36px 40px', background: 'white', position: 'relative' }}>
      {t.sectionOrder.map(key => renderSection(key))}
      {/* One-page boundary line */}
      <div ref={overflowRef} className="resume-page-limit" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(11in * 0.8)', height: 1.5, background: 'rgba(239,68,68,0.4)', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8 }}>
        <span style={{ fontSize: 8, color: '#ef4444', background: 'white', padding: '0 4px', fontFamily: 'sans-serif' }}>1 page limit</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   BULLET EDITOR (right panel)
═══════════════════════════════════════ */
function BulletEditorRow({
  bullet, onChange, onDelete, onImprove, accentColor, highlighted, onDismissHighlight,
}: {
  bullet: Bullet; onChange: (id: string, text: string) => void;
  onDelete: (id: string) => void; onImprove: (bullet: Bullet) => void;
  accentColor: string;
  highlighted?: boolean;
  onDismissHighlight?: () => void;
}) {
  const score = useBulletScore(bullet.text);
  const scoreColor = !score ? '#d1d5db'
    : score.score >= 80 ? '#16a34a'
    : score.score >= 60 ? '#d97706'
    : '#ef4444';

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ color: highlighted ? 'rgba(201,168,76,0.9)' : 'var(--text-3)', marginTop: 12, flexShrink: 0, transition: 'color 0.2s' }}>•</span>
        <textarea
          value={bullet.text}
          onChange={e => onChange(bullet.id, e.target.value)}
          placeholder="Start with an action verb: Built, Reduced, Led, Designed..."
          rows={2}
          style={{
            flex: 1, padding: '8px 10px', fontSize: 13, borderRadius: 6, outline: 'none',
            resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
            color: 'var(--text-1)',
            border: highlighted ? '1px solid rgba(201,168,76,0.7)' : '1px solid var(--border-main)',
            background: highlighted ? 'rgba(201,168,76,0.05)' : 'var(--surface-0)',
            boxShadow: highlighted ? '0 0 0 3px rgba(201,168,76,0.15), 0 0 12px rgba(201,168,76,0.1)' : 'none',
          }}
          onFocus={e => { if (!highlighted) e.target.style.borderColor = accentColor; }}
          onBlur={e => { if (!highlighted) e.target.style.borderColor = 'var(--border-main)'; }}
          onClick={() => { if (highlighted && onDismissHighlight) onDismissHighlight(); }}
        />
        <button onClick={() => onDelete(bullet.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '10px 4px', fontSize: 14, flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>✕</button>
      </div>

      {/* Score bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, paddingLeft: 18 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--border-main)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${score?.score ?? 0}%`, background: scoreColor, borderRadius: 2, transition: 'width 0.5s ease, background 0.3s ease' }} />
        </div>
        {score && (
          <span style={{ fontSize: 10, fontWeight: 600, color: scoreColor, whiteSpace: 'nowrap' }}>{score.score} — {score.label}</span>
        )}
        <button onClick={() => onImprove(bullet)} style={{ fontSize: 10, fontWeight: 600, color: accentColor, background: `${accentColor}10`, border: `1px solid ${accentColor}30`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Improve ✦
        </button>
      </div>

      {/* Inline hints */}
      {score?.hints != null && score.hints.length > 0 && (
        <div style={{ paddingLeft: 18, marginTop: 4 }}>
          {score.hints.slice(0, 2).map((h, i) => (
            <p key={i} style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0', lineHeight: 1.4 }}>↳ {h}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   EDITOR PANEL
═══════════════════════════════════════ */
type ActiveSection = 'contact' | 'education' | 'experience' | 'leadership' | 'projects' | 'skills';

function uid() { return Math.random().toString(36).slice(2); }
function emptyBullet(): Bullet { return { id: uid(), text: '' }; }
function emptyExp(): ExperienceEntry { return { id: uid(), company: '', role: '', date: '', location: '', bullets: [emptyBullet()] }; }
function emptyProject(): ProjectEntry { return { id: uid(), name: '', date: '', location: '', tech: '', bullets: [emptyBullet()] }; }

const FIELD: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 6,
  border: '1px solid var(--border-main)', background: 'var(--surface-0)', color: 'var(--text-1)',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
};
const LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase',
  letterSpacing: '0.08em', display: 'block', marginBottom: 4,
};

function EditorPanel({
  sections, setSections, activeSection, setActiveSection, cohort, onImprove, overflowLines, jobContext, onAskDilly,
}: {
  sections: ResumeSection[]; setSections: (s: ResumeSection[]) => void;
  activeSection: ActiveSection; setActiveSection: (s: ActiveSection) => void;
  cohort: string; onImprove: (b: Bullet) => void; overflowLines: number;
  jobContext?: { company: string; title: string };
  onAskDilly: (trigger: string) => void;
}) {
  const t = getTemplate(cohort);
  const accentColor = t.accentColor;
  const { resumeHighlight, setResumeHighlight } = useRightPanel();

  function getSection(key: string): ResumeSection {
    return sections.find(s => s.key === key) ?? { key, label: key };
  }

  function updateSection(key: string, patch: Partial<ResumeSection>) {
    setSections(sections.map(s => s.key === key ? { ...s, ...patch } : s).concat(
      sections.find(s => s.key === key) ? [] : [{ key, label: key, ...patch }]
    ));
  }

  const navItems: { key: ActiveSection; label: string }[] = [
    { key: 'contact', label: 'Contact' },
    { key: 'education', label: 'Education' },
    { key: 'experience', label: t.sectionLabel.experience ?? 'Experience' },
    ...(t.sectionOrder.includes('leadership') ? [{ key: 'leadership' as ActiveSection, label: t.sectionLabel.leadership ?? 'Leadership' }] : []),
    { key: 'projects', label: t.sectionLabel.projects ?? 'Projects' },
    { key: 'skills', label: t.sectionLabel.skills ?? 'Skills' },
  ];

  /* — Contact — */
  function renderContact() {
    const sec = getSection('contact');
    const c: ContactSection = sec.contact ?? { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' };
    const upd = (patch: Partial<ContactSection>) => updateSection('contact', { contact: { ...c, ...patch } });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={LABEL}>Full Name</label><input style={FIELD} value={c.name} onChange={e => upd({ name: e.target.value })} placeholder="Jane Doe" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={LABEL}>Email</label><input style={FIELD} value={c.email} onChange={e => upd({ email: e.target.value })} placeholder="jane@school.edu" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
          <div><label style={LABEL}>Phone</label><input style={FIELD} value={c.phone} onChange={e => upd({ phone: e.target.value })} placeholder="(555) 123-4567" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
          <div><label style={LABEL}>Location</label><input style={FIELD} value={c.location} onChange={e => upd({ location: e.target.value })} placeholder="Tampa, FL" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
          <div><label style={LABEL}>LinkedIn</label><input style={FIELD} value={c.linkedin} onChange={e => upd({ linkedin: e.target.value })} placeholder="linkedin.com/in/janedoe" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
          {t.showGithub && <div><label style={LABEL}>GitHub</label><input style={FIELD} value={c.github ?? ''} onChange={e => upd({ github: e.target.value })} placeholder="github.com/janedoe" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>}
          {t.showPortfolio && <div><label style={LABEL}>Portfolio</label><input style={FIELD} value={c.portfolio ?? ''} onChange={e => upd({ portfolio: e.target.value })} placeholder="janedoe.com" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>}
        </div>
      </div>
    );
  }

  /* — Education — */
  function renderEducation() {
    const sec = getSection('education');
    const e: EducationEntry = sec.education ?? { id: uid(), university: '', major: '', minor: '', graduation: '', location: '', honors: '', gpa: '', coursework: '' };
    const upd = (patch: Partial<EducationEntry>) => updateSection('education', { education: { ...e, ...patch } });
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={LABEL}>University</label><input style={FIELD} value={e.university} onChange={e2 => upd({ university: e2.target.value })} placeholder="University of Tampa" onFocus={e2 => e2.target.style.borderColor = accentColor} onBlur={e2 => e2.target.style.borderColor = '#e5e5e5'} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={LABEL}>Major</label><input style={FIELD} value={e.major} onChange={e2 => upd({ major: e2.target.value })} placeholder="Computer Science" onFocus={e2 => e2.target.style.borderColor = accentColor} onBlur={e2 => e2.target.style.borderColor = '#e5e5e5'} /></div>
          <div><label style={LABEL}>Minor (optional)</label><input style={FIELD} value={e.minor} onChange={e2 => upd({ minor: e2.target.value })} placeholder="Mathematics" onFocus={e2 => e2.target.style.borderColor = accentColor} onBlur={e2 => e2.target.style.borderColor = '#e5e5e5'} /></div>
          <div><label style={LABEL}>Graduation</label><input style={FIELD} value={e.graduation} onChange={e2 => upd({ graduation: e2.target.value })} placeholder="May 2027" onFocus={e2 => e2.target.style.borderColor = accentColor} onBlur={e2 => e2.target.style.borderColor = '#e5e5e5'} /></div>
          <div><label style={LABEL}>Location</label><input style={FIELD} value={e.location} onChange={e2 => upd({ location: e2.target.value })} placeholder="Tampa, FL" onFocus={e2 => e2.target.style.borderColor = accentColor} onBlur={e2 => e2.target.style.borderColor = '#e5e5e5'} /></div>
          <div><label style={LABEL}>GPA</label><input style={FIELD} value={e.gpa} onChange={e2 => upd({ gpa: e2.target.value })} placeholder="3.85" onFocus={e2 => e2.target.style.borderColor = accentColor} onBlur={e2 => e2.target.style.borderColor = '#e5e5e5'} /></div>
          <div><label style={LABEL}>Honors</label><input style={FIELD} value={e.honors} onChange={e2 => upd({ honors: e2.target.value })} placeholder="Dean's List, Cum Laude" onFocus={e2 => e2.target.style.borderColor = accentColor} onBlur={e2 => e2.target.style.borderColor = '#e5e5e5'} /></div>
        </div>
        <div><label style={LABEL}>Relevant Coursework (optional)</label><input style={FIELD} value={e.coursework ?? ''} onChange={e2 => upd({ coursework: e2.target.value })} placeholder="Corporate Finance, Data Structures, Machine Learning" onFocus={e2 => e2.target.style.borderColor = accentColor} onBlur={e2 => e2.target.style.borderColor = '#e5e5e5'} /></div>
      </div>
    );
  }

  /* — Experience / Leadership (shared) — */
  function renderExperienceList(sectionKey: string, labelOverride?: string) {
    const sec = getSection(sectionKey);
    const entries: ExperienceEntry[] = sec.experiences ?? [];
    const addEntry = () => updateSection(sectionKey, { experiences: [...entries, emptyExp()] });
    const updateEntry = (id: string, patch: Partial<ExperienceEntry>) =>
      updateSection(sectionKey, { experiences: entries.map(e => e.id === id ? { ...e, ...patch } : e) });
    const deleteEntry = (id: string) =>
      updateSection(sectionKey, { experiences: entries.filter(e => e.id !== id) });
    const addBullet = (id: string) =>
      updateEntry(id, { bullets: [...(entries.find(e => e.id === id)?.bullets ?? []), emptyBullet()] });
    const updateBullet = (expId: string, bId: string, text: string) =>
      updateEntry(expId, { bullets: (entries.find(e => e.id === expId)?.bullets ?? []).map(b => b.id === bId ? { ...b, text } : b) });
    const deleteBullet = (expId: string, bId: string) =>
      updateEntry(expId, { bullets: (entries.find(e => e.id === expId)?.bullets ?? []).filter(b => b.id !== bId) });

    return (
      <div>
        {entries.map((exp, idx) => (
          <div key={exp.id} style={{ marginBottom: 24, paddingBottom: 20, borderBottom: idx < entries.length - 1 ? '1px solid var(--border-main)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Entry {idx + 1}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => {
                    const bulletLines = exp.bullets.map((b, i) => `  [bullet:${i}] ${b.text.trim() || '(empty)'}`).join('\n');
                    onAskDilly(`User clicked Ask Dilly on their "${exp.company || 'unnamed entry'}" experience [entryId:${exp.id}].\nReview these bullets and give one specific, actionable coaching point on the weakest one right now. Include a HIGHLIGHT tag for the bullet you are addressing.\n${bulletLines}`);
                  }}
                  style={{ fontSize: 11, fontWeight: 600, color: accentColor, background: `${accentColor}10`, border: `1px solid ${accentColor}30`, borderRadius: 5, padding: '3px 9px', cursor: 'pointer' }}>
                  Ask Dilly
                </button>
                {entries.length > 1 && <button onClick={() => deleteEntry(exp.id)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={LABEL}>{sectionKey === 'leadership' ? 'Organization' : 'Company'}</label><input style={FIELD} value={exp.company} onChange={e => updateEntry(exp.id, { company: e.target.value })} onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
              <div><label style={LABEL}>Role / Title</label><input style={FIELD} value={exp.role} onChange={e => updateEntry(exp.id, { role: e.target.value })} onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
              <div><label style={LABEL}>Date Range</label><input style={FIELD} value={exp.date} onChange={e => updateEntry(exp.id, { date: e.target.value })} placeholder="Jun 2024 – Aug 2024" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
              <div><label style={LABEL}>Location</label><input style={FIELD} value={exp.location} onChange={e => updateEntry(exp.id, { location: e.target.value })} placeholder="New York, NY" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
            </div>
            <label style={LABEL}>Bullets</label>
            {exp.bullets.map((b, bulletIdx) => (
              <BulletEditorRow key={b.id} bullet={b}
                onChange={(id, text) => updateBullet(exp.id, id, text)}
                onDelete={id => deleteBullet(exp.id, id)}
                onImprove={onImprove} accentColor={accentColor}
                highlighted={resumeHighlight?.entryId === exp.id && resumeHighlight?.bulletIndex === bulletIdx}
                onDismissHighlight={() => setResumeHighlight(null)} />
            ))}
            <button onClick={() => addBullet(exp.id)} style={{ fontSize: 12, color: accentColor, background: `${accentColor}08`, border: `1px dashed ${accentColor}40`, borderRadius: 6, padding: '5px 14px', cursor: 'pointer', marginTop: 4 }}>
              + Add bullet
            </button>
          </div>
        ))}
        <button onClick={addEntry} style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 600, color: accentColor, background: `${accentColor}08`, border: `1.5px dashed ${accentColor}40`, borderRadius: 10, cursor: 'pointer' }}>
          + Add {labelOverride ?? 'Entry'}
        </button>
      </div>
    );
  }

  /* — Projects — */
  function renderProjects() {
    const sec = getSection('projects');
    const projects: ProjectEntry[] = sec.projects ?? [];
    const addProject = () => {
      if (sections.some(s => s.key === 'projects')) {
        setSections(sections.map(s => s.key === 'projects' ? { ...s, projects: [...projects, emptyProject()] } : s));
      } else {
        setSections([...sections, { key: 'projects', label: 'Projects', projects: [emptyProject()] }]);
      }
    };
    const updateProject = (id: string, patch: Partial<ProjectEntry>) =>
      setSections(sections.map(s => s.key === 'projects' ? { ...s, projects: projects.map(p => p.id === id ? { ...p, ...patch } : p) } : s));
    const deleteProject = (id: string) =>
      setSections(sections.map(s => s.key === 'projects' ? { ...s, projects: projects.filter(p => p.id !== id) } : s));
    const addBullet = (id: string) =>
      updateProject(id, { bullets: [...(projects.find(p => p.id === id)?.bullets ?? []), emptyBullet()] });
    const updateBullet = (pid: string, bId: string, text: string) =>
      updateProject(pid, { bullets: (projects.find(p => p.id === pid)?.bullets ?? []).map(b => b.id === bId ? { ...b, text } : b) });
    const deleteBullet = (pid: string, bId: string) =>
      updateProject(pid, { bullets: (projects.find(p => p.id === pid)?.bullets ?? []).filter(b => b.id !== bId) });

    return (
      <div>
        {projects.map((proj, idx) => (
          <div key={proj.id} style={{ marginBottom: 24, paddingBottom: 20, borderBottom: idx < projects.length - 1 ? '1px solid var(--border-main)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Project {idx + 1}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => {
                    const bulletLines = proj.bullets.map((b, i) => `  [bullet:${i}] ${b.text.trim() || '(empty)'}`).join('\n');
                    onAskDilly(`User clicked Ask Dilly on their "${proj.name || 'unnamed project'}" project [entryId:${proj.id}].\nReview these bullets and give one specific, actionable coaching point on the weakest one right now. Include a HIGHLIGHT tag for the bullet you are addressing.\n${bulletLines}`);
                  }}
                  style={{ fontSize: 11, fontWeight: 600, color: accentColor, background: `${accentColor}10`, border: `1px solid ${accentColor}30`, borderRadius: 5, padding: '3px 9px', cursor: 'pointer' }}>
                  Ask Dilly
                </button>
                {projects.length > 1 && <button onClick={() => deleteProject(proj.id)} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={LABEL}>Project Name</label><input style={FIELD} value={proj.name} onChange={e => updateProject(proj.id, { name: e.target.value })} onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
              <div><label style={LABEL}>Date</label><input style={FIELD} value={proj.date} onChange={e => updateProject(proj.id, { date: e.target.value })} placeholder="Mar 2025" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={LABEL}>Tech Stack (optional)</label><input style={FIELD} value={proj.tech ?? ''} onChange={e => updateProject(proj.id, { tech: e.target.value })} placeholder="Python, React, PostgreSQL, AWS" onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} /></div>
            </div>
            <label style={LABEL}>Bullets</label>
            {proj.bullets.map((b, bulletIdx) => (
              <BulletEditorRow key={b.id} bullet={b}
                onChange={(id, text) => updateBullet(proj.id, id, text)}
                onDelete={id => deleteBullet(proj.id, id)}
                onImprove={onImprove} accentColor={accentColor}
                highlighted={resumeHighlight?.entryId === proj.id && resumeHighlight?.bulletIndex === bulletIdx}
                onDismissHighlight={() => setResumeHighlight(null)} />
            ))}
            <button onClick={() => addBullet(proj.id)} style={{ fontSize: 12, color: accentColor, background: `${accentColor}08`, border: `1px dashed ${accentColor}40`, borderRadius: 6, padding: '5px 14px', cursor: 'pointer', marginTop: 4 }}>+ Add bullet</button>
          </div>
        ))}
        <button onClick={addProject} style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 600, color: accentColor, background: `${accentColor}08`, border: `1.5px dashed ${accentColor}40`, borderRadius: 10, cursor: 'pointer' }}>
          + Add Project
        </button>
      </div>
    );
  }

  /* — Skills — */
  function renderSkills() {
    const sec = getSection('skills');
    const lines: string[] = sec.simple?.lines ?? [''];
    const update = (newLines: string[]) => setSections(sections.map(s => s.key === 'skills' ? { ...s, simple: { lines: newLines } } : s));
    return (
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.6 }}>
          Each line becomes a row on your resume. Format like: <em>Languages: Python, SQL, JavaScript</em>
        </p>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input style={{ ...FIELD, flex: 1 }} value={line} onChange={e => { const n = [...lines]; n[i] = e.target.value; update(n); }}
              placeholder={i === 0 ? 'Languages: Python, JavaScript, SQL' : i === 1 ? 'Frameworks: React, Node.js, FastAPI' : 'Tools: Git, AWS, Docker, Figma'}
              onFocus={e => e.target.style.borderColor = accentColor} onBlur={e => e.target.style.borderColor = 'var(--border-main)'} />
            {lines.length > 1 && <button onClick={() => update(lines.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 14 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>✕</button>}
          </div>
        ))}
        <button onClick={() => update([...lines, ''])} style={{ fontSize: 12, color: accentColor, background: `${accentColor}08`, border: `1px dashed ${accentColor}30`, borderRadius: 6, padding: '5px 14px', cursor: 'pointer', marginTop: 4 }}>+ Add line</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Job context header */}
      {jobContext && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-main)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'var(--surface-1)' }}>
          <CompanyLogo company={jobContext.company} size={26} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jobContext.title}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>{jobContext.company}</p>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#16a34a', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', padding: '2px 7px', borderRadius: 4 }}>TAILORED</span>
        </div>
      )}
      {/* Overflow warning */}
      {overflowLines > 0 && (
        <div style={{ margin: '12px 20px 0', padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', gap: 10, alignItems: 'flex-start', flexShrink: 0 }}>
          <span style={{ fontSize: 13, flexShrink: 0, color: '#ef4444', fontWeight: 700, marginTop: 1 }}>!</span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', margin: '0 0 2px' }}>Resume is over one page</p>
            <p style={{ fontSize: 11, color: '#ef4444', margin: 0, lineHeight: 1.5 }}>
              ~{overflowLines} lines over. Trim bullets to 2–3 per role or cut the least impactful entry.
            </p>
          </div>
        </div>
      )}

      {/* Section nav */}
      <div style={{ display: 'flex', gap: 2, padding: '12px 20px 0', flexShrink: 0, flexWrap: 'wrap' }}>
        {navItems.map(item => (
          <button key={item.key} onClick={() => setActiveSection(item.key)}
            style={{ padding: '5px 11px', borderRadius: 4, fontSize: 12, fontWeight: activeSection === item.key ? 600 : 400, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: activeSection === item.key ? `${accentColor}14` : 'transparent', color: activeSection === item.key ? accentColor : 'var(--text-2)' }}>
            {item.label}
          </button>
        ))}
      </div>

      {/* Cohort tip */}
      <div style={{ margin: '10px 20px 0', padding: '8px 12px', borderRadius: 6, background: `${accentColor}08`, border: `1px solid ${accentColor}18`, flexShrink: 0 }}>
        <p style={{ fontSize: 11, color: accentColor, margin: 0, lineHeight: 1.5 }}>
          <strong style={{ fontWeight: 700 }}>dilly</strong> {t.tip}
        </p>
      </div>

      {/* Active section editor */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 24px' }}>
        {activeSection === 'contact' && renderContact()}
        {activeSection === 'education' && renderEducation()}
        {activeSection === 'experience' && renderExperienceList('professional_experience', 'Experience')}
        {activeSection === 'leadership' && renderExperienceList('leadership', 'Entry')}
        {activeSection === 'projects' && renderProjects()}
        {activeSection === 'skills' && renderSkills()}

        {/* AI disclaimer — shown only for tailored (job) variants */}
        {jobContext && (
          <div style={{ marginTop: 28, padding: '12px 14px', borderRadius: 8, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2B3A8E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#2B3A8E', margin: '0 0 4px', letterSpacing: '0.02em' }}>AI-generated — review before sending</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
                  This resume was tailored by AI and may contain inaccuracies or invented details. Some recruiters use AI-detection tools that may flag it. Read every bullet, correct anything that isn&apos;t true, and make sure it sounds like you.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   CONTEXT MENU
═══════════════════════════════════════ */
interface ContextMenuState { x: number; y: number; variantId: string; }

function ContextMenu({ menu, variants, onRename, onDuplicate, onDelete, onClose }: {
  menu: ContextMenuState;
  variants: VariantMeta[];
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const variant = variants.find(v => v.id === menu.variantId);
  const canDelete = variants.length > 1;
  const tc = variant ? getTemplate(variant.cohort).accentColor : '#2B3A8E';

  const MENU_W = 196;
  const MENU_H = 160; // approximate
  const top  = Math.min(menu.y, window.innerHeight - MENU_H - 8);
  const left = Math.min(menu.x, window.innerWidth  - MENU_W - 8);

  const ITEM: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px',
    fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-1)', textAlign: 'left',
  };

  const menu_el = (
    <>
      {/* Transparent backdrop — catches any click outside to close */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose(); }}
      />
      <div
        style={{
          position: 'fixed', top, left, zIndex: 9999,
          background: 'var(--surface-0)', border: '1px solid var(--border-main)',
          borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
          minWidth: MENU_W, padding: '4px 0', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
        {variant && (
          <div style={{ padding: '7px 14px 5px', borderBottom: '1px solid var(--border-main)', marginBottom: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: tc, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 148 }}>{variant.label}</span>
            </div>
          </div>
        )}
        <button style={ITEM}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          onClick={() => { onClose(); onRename(menu.variantId); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Rename
        </button>
        <button style={ITEM}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          onClick={() => { onClose(); onDuplicate(menu.variantId); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Duplicate
        </button>
        <div style={{ height: 1, background: 'var(--border-main)', margin: '3px 0' }} />
        <button
          style={{ ...ITEM, color: canDelete ? '#ef4444' : 'var(--text-3)', cursor: canDelete ? 'pointer' : 'default', opacity: canDelete ? 1 : 0.4 }}
          onMouseEnter={e => { if (canDelete) e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          onClick={() => { if (canDelete) { onClose(); onDelete(menu.variantId); } }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          {canDelete ? 'Delete' : "Can't delete last resume"}
        </button>
      </div>
    </>
  );

  return createPortal(menu_el, document.body);
}

/* ═══════════════════════════════════════
   EMPTY RESUME DETECTION
═══════════════════════════════════════ */
function isResumeEmpty(sections: ResumeSection[]): boolean {
  for (const s of sections) {
    if (s.contact?.name?.trim()) return false;
    if (s.education?.university?.trim()) return false;
    if (s.experiences?.some(e => e.company.trim() || e.bullets.some(b => b.text.trim()))) return false;
    if (s.leadership?.some(e => e.company.trim() || e.bullets.some(b => b.text.trim()))) return false;
    if (s.projects?.some(p => p.name.trim() || p.bullets.some(b => b.text.trim()))) return false;
    if (s.simple?.lines?.some(l => l.trim())) return false;
  }
  return true;
}

/* ═══════════════════════════════════════
   UNSAVED CHANGES MODAL
═══════════════════════════════════════ */
function UnsavedModal({ label, onSave, onDiscard, onCancel }: {
  label: string; onSave: () => void; onDiscard: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onCancel}>
      <div style={{ background: 'var(--surface-0)', borderRadius: 12, padding: '28px 28px 24px', maxWidth: 400, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid var(--border-main)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px' }}>Unsaved changes</p>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 24px', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-1)' }}>{label}</strong> has unsaved changes. Save before leaving?
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel}
            style={{ flex: 1, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 500, border: '1px solid var(--border-main)', background: 'var(--surface-1)', color: 'var(--text-2)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onDiscard}
            style={{ flex: 1, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid var(--border-main)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}>
            Discard
          </button>
          <button onClick={onSave}
            style={{ flex: 1, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: '#2B3A8E', color: 'white', cursor: 'pointer' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   RESUME OVERVIEW PANEL
═══════════════════════════════════════ */
type OverviewSort = 'cohort' | 'company' | 'date' | 'name';

function ResumeOverview({ variants, dirtySet, activeId, onSelect, onClose, sort, setSort, onContextMenu }: {
  variants: VariantMeta[];
  dirtySet: Set<string>;
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  sort: OverviewSort;
  setSort: (s: OverviewSort) => void;
  onContextMenu: (e: React.MouseEvent, variantId: string) => void;
}) {
  const sorted = [...variants].sort((a, b) => {
    if (sort === 'cohort') return (a.cohort || '').localeCompare(b.cohort || '');
    if (sort === 'company') {
      const ac = a.type === 'job' ? (a.job_company || '') : a.cohort;
      const bc = b.type === 'job' ? (b.job_company || '') : b.cohort;
      return ac.localeCompare(bc);
    }
    if (sort === 'date') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return a.label.localeCompare(b.label);
  });

  const SORTS: { key: OverviewSort; label: string }[] = [
    { key: 'date', label: 'Recent' },
    { key: 'cohort', label: 'Cohort' },
    { key: 'name', label: 'Name' },
  ];

  return (
    <div style={{
      width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--surface-0)', borderLeft: '1px solid var(--border-main)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border-main)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
            Resumes
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{variants.length}</span>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--text-3)', display: 'flex', alignItems: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        {/* Sort row */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-1)', borderRadius: 6, padding: 2 }}>
          {SORTS.map(s => (
            <button key={s.key} onClick={() => setSort(s.key)}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 10, fontWeight: 600,
                border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                background: sort === s.key ? 'var(--surface-2)' : 'transparent',
                color: sort === s.key ? 'var(--text-1)' : 'var(--text-3)',
              }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sorted.map(v => {
            const tc = getTemplate(v.cohort).accentColor;
            const isActive = v.id === activeId;
            const isJob = v.type === 'job';
            const isDirty = dirtySet.has(v.id);
            const subtitle = isJob
              ? [v.job_title, v.job_company].filter(Boolean).join(' @ ')
              : v.cohort;
            return (
              <button key={v.id} onClick={() => onSelect(v.id)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, v.id); }}
                style={{
                  textAlign: 'left', width: '100%', padding: '8px 10px', cursor: 'pointer',
                  background: isActive ? `${tc}10` : 'transparent',
                  border: isActive ? `1px solid ${tc}25` : '1px solid transparent',
                  borderRadius: 8, transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--surface-1)'; } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; } }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Color dot */}
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: tc, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <p style={{
                        fontSize: 12, fontWeight: isActive ? 700 : 500, color: 'var(--text-1)', margin: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                      }}>
                        {v.label}
                      </p>
                      {isDirty && (
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                      )}
                    </div>
                    <p style={{
                      fontSize: 10, color: 'var(--text-3)', margin: '1px 0 0',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {subtitle}
                    </p>
                  </div>
                  {isJob && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={tc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   IMPROVE MODAL
═══════════════════════════════════════ */
function ImproveModal({ bullet, cohort, onClose }: { bullet: Bullet; cohort: string; onClose: () => void }) {
  const t = getTemplate(cohort);
  const score = useBulletScore(bullet.text);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-0)', borderRadius: 12, padding: '24px 28px', maxWidth: 520, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', border: '1px solid var(--border-main)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: t.accentColor }}>dilly</span>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Improve this bullet</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-3)', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, border: '1px solid var(--border-main)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your bullet</p>
          <p style={{ fontSize: 13, color: 'var(--text-1)', margin: 0, lineHeight: 1.5 }}>{bullet.text || '(empty bullet)'}</p>
        </div>
        {score && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 3, background: 'var(--border-main)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${score.score}%`, background: score.score >= 80 ? '#16a34a' : score.score >= 60 ? '#d97706' : '#ef4444', borderRadius: 2, transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', minWidth: 50, textAlign: 'right' }}>{score.score}/100</span>
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>How to improve</p>
            {score.hints.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < score.hints.length - 1 ? '1px solid var(--border-main)' : 'none' }}>
                <span style={{ color: t.accentColor, fontWeight: 700, flexShrink: 0, fontSize: 12 }}>→</span>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>{h}</p>
              </div>
            ))}
          </>
        )}
        {!score && <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>Scoring your bullet...</p>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   COHORT DISPLAY NAMES
═══════════════════════════════════════ */
const COHORT_DISPLAY: Record<string, string> = {
  // Legacy short keys (backward compat)
  'Tech': 'Software Engineering & CS',
  'Quantitative': 'Data Science & Analytics',
  'Business': 'Finance & Accounting',
  'Science': 'Life Sciences & Research',
  'Health': 'Healthcare & Clinical',
  'Pre-Health': 'Healthcare & Clinical',
  'Social Science': 'Social Sciences & Nonprofit',
  'Humanities': 'Media & Communications',
  'Sport': 'Hospitality & Events',
  'Pre-Law': 'Legal & Compliance',
  'General': 'General',
  // 22 spec cohorts
  'Software Engineering & CS': 'Software Engineering & CS',
  'Data Science & Analytics': 'Data Science & Analytics',
  'Cybersecurity & IT': 'Cybersecurity & IT',
  'Finance & Accounting': 'Finance & Accounting',
  'Marketing & Advertising': 'Marketing & Advertising',
  'Consulting & Strategy': 'Consulting & Strategy',
  'Management & Operations': 'Management & Operations',
  'Economics & Public Policy': 'Economics & Public Policy',
  'Entrepreneurship & Innovation': 'Entrepreneurship & Innovation',
  'Healthcare & Clinical': 'Healthcare & Clinical',
  'Life Sciences & Research': 'Life Sciences & Research',
  'Physical Sciences & Math': 'Physical Sciences & Math',
  'Social Sciences & Nonprofit': 'Social Sciences & Nonprofit',
  'Media & Communications': 'Media & Communications',
  'Design & Creative': 'Design & Creative',
  'Legal & Compliance': 'Legal & Compliance',
  'Human Resources & People': 'Human Resources & People',
  'Supply Chain & Logistics': 'Supply Chain & Logistics',
  'Education & Teaching': 'Education & Teaching',
  'Real Estate & Construction': 'Real Estate & Construction',
  'Environmental & Sustainability': 'Environmental & Sustainability',
  'Hospitality & Events': 'Hospitality & Events',
};
function cohortDisplayName(c: string) { return COHORT_DISPLAY[c] ?? c; }

/* ═══════════════════════════════════════
   VARIANT TYPES
═══════════════════════════════════════ */
interface VariantMeta {
  id: string; label: string; cohort: string; type: 'cohort' | 'job';
  job_title?: string; job_company?: string; created_at: string;
}

/* ═══════════════════════════════════════
   COHORT CONSTANTS
═══════════════════════════════════════ */
const ALL_COHORTS = [
  'Software Engineering & CS',
  'Data Science & Analytics',
  'Cybersecurity & IT',
  'Finance & Accounting',
  'Marketing & Advertising',
  'Consulting & Strategy',
  'Management & Operations',
  'Economics & Public Policy',
  'Entrepreneurship & Innovation',
  'Healthcare & Clinical',
  'Life Sciences & Research',
  'Physical Sciences & Math',
  'Social Sciences & Nonprofit',
  'Media & Communications',
  'Design & Creative',
  'Legal & Compliance',
  'Human Resources & People',
  'Supply Chain & Logistics',
  'Education & Teaching',
  'Real Estate & Construction',
  'Environmental & Sustainability',
  'Hospitality & Events',
];

/* ═══════════════════════════════════════
   TAB RENAME INLINE
═══════════════════════════════════════ */
function RenameInput({ value, onDone }: { value: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  function commit() { const trimmed = v.trim(); onDone(trimmed || value); }
  return (
    <input ref={ref} value={v} onChange={e => setV(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onDone(value); }}
      style={{ fontSize: 12, fontWeight: 500, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-main)', outline: 'none', color: 'var(--text-1)', width: Math.max(60, v.length * 7.5), padding: '0 2px' }} />
  );
}

/* ═══════════════════════════════════════
   FIELD-BY-FIELD ANIMATION
═══════════════════════════════════════ */
const _sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const ANIM_MS = 85;

async function animateFillSections(
  sections: ResumeSection[],
  onFrame: (sects: ResumeSection[]) => void,
) {
  const live: ResumeSection[] = [];

  for (const section of sections) {
    if (section.contact) {
      const sec: ResumeSection = { key: section.key, label: section.label, contact: { name: '', email: '', phone: '', location: '', linkedin: '' } };
      live.push(sec);
      onFrame([...live]);
      for (const f of ['name', 'email', 'phone', 'location', 'linkedin', 'github', 'portfolio'] as const) {
        const v = (section.contact as unknown as Record<string, string | undefined>)[f];
        if (v) { await _sleep(ANIM_MS); sec.contact = { ...sec.contact!, [f]: v }; live[live.length - 1] = { ...sec }; onFrame([...live]); }
      }
    } else if (section.education) {
      live.push({ key: section.key, label: section.label, education: section.education });
      onFrame([...live]);
      await _sleep(ANIM_MS);
    } else if (section.experiences || section.leadership) {
      const entries = section.experiences || section.leadership || [];
      const field = section.leadership ? 'leadership' : 'experiences';
      const sec: ResumeSection = { key: section.key, label: section.label, [field]: [] };
      live.push(sec);
      onFrame([...live]);
      const list: ExperienceEntry[] = [];
      for (const exp of entries) {
        await _sleep(ANIM_MS);
        const entry: ExperienceEntry = { ...exp, bullets: [] };
        list.push(entry);
        (sec as unknown as Record<string, unknown>)[field] = [...list];
        live[live.length - 1] = { ...sec };
        onFrame([...live]);
        for (const b of exp.bullets || []) {
          await _sleep(ANIM_MS + 40);
          entry.bullets = [...entry.bullets, b];
          live[live.length - 1] = { ...sec };
          onFrame([...live]);
        }
      }
    } else if (section.projects) {
      const sec: ResumeSection = { key: section.key, label: section.label, projects: [] };
      live.push(sec);
      onFrame([...live]);
      const list: ProjectEntry[] = [];
      for (const proj of section.projects) {
        await _sleep(ANIM_MS);
        const entry: ProjectEntry = { ...proj, bullets: [] };
        list.push(entry);
        sec.projects = [...list];
        live[live.length - 1] = { ...sec };
        onFrame([...live]);
        for (const b of proj.bullets || []) {
          await _sleep(ANIM_MS + 40);
          entry.bullets = [...entry.bullets, b];
          live[live.length - 1] = { ...sec };
          onFrame([...live]);
        }
      }
    } else if (section.simple) {
      const sec: ResumeSection = { key: section.key, label: section.label, simple: { lines: [] } };
      live.push(sec);
      onFrame([...live]);
      const lines: string[] = [];
      for (const line of section.simple.lines || []) {
        await _sleep(ANIM_MS);
        lines.push(line);
        sec.simple = { lines: [...lines] };
        live[live.length - 1] = { ...sec };
        onFrame([...live]);
      }
    } else {
      live.push({ ...section });
      onFrame([...live]);
      await _sleep(ANIM_MS);
    }
  }
}

/* ═══════════════════════════════════════
   COACH HELPERS
═══════════════════════════════════════ */
function summarizeSections(sections: ResumeSection[], cohort: string): string {
  const lines: string[] = [`Cohort/Template: ${cohort}`];
  for (const s of sections) {
    if (s.contact) {
      const c = s.contact;
      const parts = [c.name, c.email, c.phone, c.location, c.linkedin].filter(Boolean);
      if (parts.length) lines.push(`Contact: ${parts.join(' | ')}`);
    }
    if (s.education) {
      const e = s.education;
      if (e.university) {
        const parts = [e.university, e.major, e.minor && `Minor: ${e.minor}`, e.gpa && `GPA: ${e.gpa}`, e.honors].filter(Boolean);
        lines.push(`Education: ${parts.join(' | ')}`);
      }
    }
    const expList = s.experiences ?? s.leadership;
    if (expList?.length) {
      const secLabel = s.label || (s.leadership ? 'Leadership' : 'Experience');
      lines.push(`${secLabel}:`);
      for (const exp of expList) {
        if (exp.company || exp.role) {
          lines.push(`  [id:${exp.id}] ${[exp.company, exp.role, exp.date].filter(Boolean).join(' | ')}`);
          exp.bullets.forEach((b, i) => {
            lines.push(`    [bullet:${i}] ${b.text.trim() || '(empty)'}`);
          });
        }
      }
    }
    if (s.projects?.length) {
      lines.push('Projects:');
      for (const p of s.projects) {
        if (p.name || p.bullets.some(b => b.text.trim())) {
          lines.push(`  [id:${p.id}] ${[p.name, p.date, p.tech].filter(Boolean).join(' | ')}`);
          p.bullets.forEach((b, i) => {
            lines.push(`    [bullet:${i}] ${b.text.trim() || '(empty)'}`);
          });
        }
      }
    }
    if (s.simple?.lines?.some(l => l.trim())) {
      lines.push(`${s.label}: ${s.simple.lines.filter(l => l.trim()).join('; ')}`);
    }
  }
  return lines.join('\n');
}

function buildCoachOpening(variant: VariantMeta, sections: ResumeSection[], cohort: string): string {
  if (isResumeEmpty(sections)) {
    return `Let's build your ${cohort} resume. Start by filling in your contact info and I'll coach you as you go.`;
  }
  const allExp = sections.flatMap(s => [...(s.experiences ?? []), ...(s.leadership ?? [])]);
  const firstCompany = allExp.find(e => e.company.trim())?.company;
  const bulletCount = allExp.reduce((n, e) => n + e.bullets.filter(b => b.text.trim()).length, 0);
  if (firstCompany && bulletCount > 0) {
    return `I can see you're working on ${variant.label} — ${firstCompany} is in there. You have ${bulletCount} bullet${bulletCount > 1 ? 's' : ''} so far. Tell me what you did there and I'll help you make it stronger.`;
  }
  if (firstCompany) {
    return `I see you added ${firstCompany} to your ${cohort} resume. What did you actually do there? Tell me in plain English and I'll help you turn it into strong bullets.`;
  }
  return `I'm looking at your ${variant.label} resume. What would you like help with?`;
}

/* ═══════════════════════════════════════
   JOB FIT PANEL
═══════════════════════════════════════ */
interface FitScores {
  req_smart: number; req_grit: number; req_build: number;
  stu_smart: number; stu_grit: number; stu_build: number;
}

function fitColor(student: number, required: number): string {
  const gap = required - student;
  if (gap <= 0) return '#34C759';
  if (gap <= 10) return '#FF9F0A';
  return '#FF453A';
}

function FitBar({ label, student, required }: { label: string; student: number; required: number }) {
  const color = fitColor(student, required);
  const gap = Math.max(0, required - student);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: gap > 0 ? '#FF453A' : '#34C759' }}>
          {gap > 0 ? `−${gap}` : '✓'}
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, position: 'relative', overflow: 'visible' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(student, 100)}%`, background: color, borderRadius: 3, transition: 'width 700ms cubic-bezier(0.22,1,0.36,1)' }} />
        <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${Math.min(required, 99)}%`, width: 2, background: 'rgba(255,255,255,0.55)', borderRadius: 1, zIndex: 1 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>You: <strong style={{ color: 'var(--text-2)' }}>{student}</strong></span>
        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>Needed: <strong style={{ color: 'var(--text-2)' }}>{required}</strong></span>
      </div>
    </div>
  );
}

function JobFitPanel({ variant }: { variant: VariantMeta }) {
  const [scores, setScores] = useState<FitScores | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setScores(null); setError(false); setLoading(true);
    const description = typeof window !== 'undefined'
      ? (localStorage.getItem(`dilly_jd_${variant.id}`) || '') : '';
    Promise.all([
      apiFetch('/jd-dilly-scores', {
        method: 'POST',
        body: JSON.stringify({ job_description: description, job_title: variant.job_title || '' }),
      }).catch(() => null),
      apiFetch('/profile').catch(() => null),
    ]).then(([jd, profile]) => {
      if (!jd || !profile) { setError(true); setLoading(false); return; }
      setScores({
        req_smart: Math.round(jd.smart_min ?? jd.smart ?? 70),
        req_grit:  Math.round(jd.grit_min  ?? jd.grit  ?? 70),
        req_build: Math.round(jd.build_min  ?? jd.build ?? 70),
        stu_smart: Math.round(profile.overall_smart ?? 0),
        stu_grit:  Math.round(profile.overall_grit  ?? 0),
        stu_build: Math.round(profile.overall_build ?? 0),
      });
      setLoading(false);
    });
  }, [variant.id, variant.job_title]);

  const readiness = scores ? (() => {
    const maxGap = Math.max(
      scores.req_smart - scores.stu_smart,
      scores.req_grit  - scores.stu_grit,
      scores.req_build - scores.stu_build,
    );
    if (maxGap <= 0)  return { label: 'Ready',  color: '#34C759', bg: 'rgba(52,199,89,0.1)'  };
    if (maxGap <= 15) return { label: 'Almost', color: '#FF9F0A', bg: 'rgba(255,159,10,0.1)' };
    return              { label: 'Gap',    color: '#FF453A', bg: 'rgba(255,69,58,0.1)'   };
  })() : null;

  return (
    <div style={{
      width: collapsed ? 32 : 242, flexShrink: 0,
      borderLeft: '1px solid var(--border-main)',
      background: 'var(--surface-0)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      transition: 'width 200ms ease',
    }}>
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Show job fit' : 'Hide job fit'}
        style={{
          width: 32, height: 36, flexShrink: 0, alignSelf: 'flex-end',
          background: 'none', border: 'none', borderBottom: '1px solid var(--border-main)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-3)',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {collapsed ? <polyline points="15 18 9 12 15 6"/> : <polyline points="9 18 15 12 9 6"/>}
        </svg>
      </button>

      {!collapsed && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 20px' }}>
          {/* Job header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border-main)' }}>
            <CompanyLogo company={variant.job_company || ''} size={28} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {variant.job_title || 'Role'}
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {variant.job_company || ''}
              </p>
            </div>
          </div>

          {/* Your Fit header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>
              Your Fit
            </p>
            {readiness && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                color: readiness.color, background: readiness.bg,
                border: `1px solid ${readiness.color}50`,
                borderRadius: 4, padding: '2px 7px',
              }}>
                {readiness.label}
              </span>
            )}
          </div>

          {loading && (
            <>
              <style>{`@keyframes jfpPulse { 0%,100%{opacity:.35} 50%{opacity:.75} }`}</style>
              {[100, 100, 100].map((_, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', animation: 'jfpPulse 1.4s ease infinite', marginBottom: 6, width: '60%' }} />
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', animation: 'jfpPulse 1.4s ease infinite', animationDelay: `${i * 0.15}s` }} />
                </div>
              ))}
            </>
          )}

          {!loading && error && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
              Couldn't score this role. Add a job description to improve predictions.
            </p>
          )}

          {!loading && scores && (
            <>
              <FitBar label="Smart" student={scores.stu_smart} required={scores.req_smart} />
              <FitBar label="Grit"  student={scores.stu_grit}  required={scores.req_grit}  />
              <FitBar label="Build" student={scores.stu_build} required={scores.req_build} />
              <p style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 10, lineHeight: 1.65, borderTop: '1px solid var(--border-main)', paddingTop: 10 }}>
                These scores are AI-predicted and may not be exact. A longer, more detailed job description will give you more accurate results.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   JOB IMPORT MODAL
═══════════════════════════════════════ */
const IMPORT_STEPS = [
  { id: 'company', question: 'What company is this role at?', placeholder: 'e.g. Goldman Sachs, Google...', type: 'input' as const },
  { id: 'title',   question: "What's the job title?",          placeholder: 'e.g. Data Analyst Intern...', type: 'input' as const },
  { id: 'description', question: 'Paste the job description if you have it.', placeholder: 'Paste the full JD here — the more detail, the better the resume...', type: 'textarea' as const, optional: true },
] as const;

function JobImportModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (company: string, title: string, description: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cur = IMPORT_STEPS[step];
  const isLast = step === IMPORT_STEPS.length - 1;
  const values: Record<string, string> = { company, title, description };
  const setters: Record<string, (v: string) => void> = {
    company: setCompany, title: setTitle, description: setDescription,
  };
  const canContinue = cur.optional || values[cur.id].trim().length > 0;

  useEffect(() => {
    const el = cur.type === 'input' ? inputRef.current : textareaRef.current;
    setTimeout(() => el?.focus(), 60);
  }, [step, cur.type]);

  function next(skip = false) {
    if (isLast || skip) {
      onSubmit(company.trim(), title.trim(), skip ? '' : description.trim());
    } else {
      setStep(s => s + 1);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter' && cur.type === 'input' && canContinue) { e.preventDefault(); next(); }
    if (e.key === 'Enter' && e.metaKey && cur.type === 'textarea' && canContinue) { e.preventDefault(); next(); }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes jimSlide { from { opacity:0; transform:translateY(16px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        .jim-card { animation: jimSlide 220ms cubic-bezier(0.22,1,0.36,1) forwards; }
      `}</style>
      <div
        className="jim-card"
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface-0)', borderRadius: 16, border: '1px solid var(--border-main)', boxShadow: '0 32px 80px rgba(0,0,0,0.3)', width: 480, maxWidth: '92vw', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Import a job</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
              Dilly will build a tailored resume once you fill this in
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, padding: 4, borderRadius: 6 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>×</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, padding: '14px 22px 0' }}>
          {IMPORT_STEPS.map((_, i) => (
            <div key={i} style={{ height: 3, flex: 1, borderRadius: 3, background: i <= step ? '#2B3A8E' : 'var(--border-main)', transition: 'background 260ms ease' }} />
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: '22px 22px 24px' }} onKeyDown={onKey}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{cur.question}</p>
          {cur.optional && (
            <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--text-3)' }}>
              The more detail you give, the better your resume will be. You can also skip this.
            </p>
          )}
          {!cur.optional && <div style={{ marginBottom: 12 }} />}

          {cur.type === 'input' ? (
            <input
              ref={inputRef}
              value={values[cur.id]}
              onChange={e => setters[cur.id](e.target.value)}
              placeholder={cur.placeholder}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--surface-1)', border: '1px solid rgba(59,76,192,0.4)',
                borderRadius: 10, padding: '11px 14px', fontSize: 13,
                color: 'var(--text-1)', outline: 'none',
                boxShadow: '0 0 0 3px rgba(59,76,192,0.08)',
              }}
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={values[cur.id]}
              onChange={e => setters[cur.id](e.target.value)}
              placeholder={cur.placeholder}
              rows={7}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'none',
                background: 'var(--surface-1)', border: '1px solid rgba(59,76,192,0.4)',
                borderRadius: 10, padding: '11px 14px', fontSize: 12,
                color: 'var(--text-1)', outline: 'none', lineHeight: 1.65,
                boxShadow: '0 0 0 3px rgba(59,76,192,0.08)',
                fontFamily: 'inherit',
              }}
            />
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                style={{ height: 40, paddingInline: 16, borderRadius: 9, fontSize: 13, fontWeight: 500, border: '1px solid var(--border-main)', background: 'var(--surface-1)', color: 'var(--text-2)', cursor: 'pointer' }}>
                ← Back
              </button>
            )}
            <button
              onClick={() => next()}
              disabled={!canContinue}
              style={{
                flex: 1, height: 40, borderRadius: 9, fontSize: 13, fontWeight: 700,
                border: 'none', cursor: canContinue ? 'pointer' : 'default',
                background: canContinue ? '#2B3A8E' : 'var(--surface-2)',
                color: canContinue ? '#fff' : 'var(--text-3)',
                transition: 'all 160ms ease',
              }}
              onMouseEnter={e => { if (canContinue) e.currentTarget.style.background = '#2f3da8'; }}
              onMouseLeave={e => { if (canContinue) e.currentTarget.style.background = '#2B3A8E'; }}
            >
              {isLast ? 'Generate resume →' : 'Continue →'}
            </button>
            {cur.optional && (
              <button onClick={() => next(true)}
                style={{ height: 40, paddingInline: 14, borderRadius: 9, fontSize: 12, fontWeight: 500, border: '1px solid var(--border-main)', background: 'none', color: 'var(--text-3)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
                Skip
              </button>
            )}
          </div>
          {cur.type === 'textarea' && values[cur.id].trim() && (
            <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--text-3)', textAlign: 'right' }}>⌘ + Enter to generate</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ═══════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════ */
export default function ResumeEditorPage() {
  const { showChat, setResumeCoachCtx, fireProactiveCoach, jobImportTrigger, clearJobImportTrigger, startJobImport } = useRightPanel();
  const pendingJobRef = useRef<{ company: string; title: string; description: string } | null>(null);
  // Read from sessionStorage once at module init time (before any effects can clear it in Strict Mode).
  // This runs synchronously during render, so it's immune to the double-effect problem.
  if (pendingJobRef.current === null) {
    try {
      const p = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      if (p.get('auto_generate') === '1') {
        const stored = typeof window !== 'undefined' ? sessionStorage.getItem('dilly_tailor_job') : null;
        if (stored) {
          sessionStorage.removeItem('dilly_tailor_job');
          const job = JSON.parse(stored);
          if (job.company && job.title) {
            pendingJobRef.current = { company: job.company, title: job.title, description: job.description || '' };
          }
        }
      }
    } catch { /* ignore */ }
  }

  const [variants, setVariants] = useState<VariantMeta[]>([]);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [sectionsByVariant, setSectionsByVariant] = useState<Record<string, ResumeSection[]>>({});
  const [loadedVariants, setLoadedVariants] = useState<Set<string>>(new Set());
  const [savedSnapshots, setSavedSnapshots] = useState<Record<string, string>>({});
  const [dirtyVariants, setDirtyVariants] = useState<Set<string>>(new Set());
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>('contact');
  const [improveBullet, setImproveBullet] = useState<Bullet | null>(null);
  const [overflowLines, setOverflowLines] = useState(0);
  const [jobGenerating, setJobGenerating] = useState(false);
  const [jobGeneratingCompany, setJobGeneratingCompany] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [primaryCohort, setPrimaryCohort] = useState('General');
  const [userCohorts, setUserCohorts] = useState<string[]>([]);
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [tailorError, setTailorError] = useState<{ company: string; reason: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [overviewSort, setOverviewSort] = useState<OverviewSort>('cohort');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeVariant = variants.find(v => v.id === activeVariantId) ?? null;
  const cohort = activeVariant?.cohort ?? 'General';
  const sections = (activeVariantId ? sectionsByVariant[activeVariantId] : null) ?? [];

  /* Load */
  useEffect(() => {
    async function load() {
      try {
        const [varData, profileData] = await Promise.all([
          apiFetch('/resume/variants'),
          apiFetch('/profile').catch(() => null),
        ]);
        if (profileData?.cohort) setPrimaryCohort(profileData.cohort);
        const scores = profileData?.cohort_scores ?? {};
        const cohortKeys = Object.keys(scores).filter(k => k !== 'General');
        setUserCohorts(cohortKeys.length > 0 ? cohortKeys : (profileData?.cohort ? [profileData.cohort] : []));
        setUserInterests(profileData?.interests ?? []);
        const vList: VariantMeta[] = varData?.variants ?? [];
        setVariants(vList);
        if (vList.length > 0) {
          setActiveVariantId(vList[0].id);
          const contentData = await apiFetch(`/resume/variants/${vList[0].id}`);
          const initialSections = contentData?.sections ?? [];
          setSectionsByVariant({ [vList[0].id]: initialSections });
          setSavedSnapshots({ [vList[0].id]: JSON.stringify(initialSections) });
          setLoadedVariants(new Set([vList[0].id]));
        } else {
          // No variants yet — try to import parsed resume from onboarding/audit
          try {
            const editedData = await apiFetch('/resume/edited');
            const parsedSections = editedData?.resume?.sections ?? editedData?.sections ?? [];
            if (parsedSections.length > 0) {
              const cohortLabel = profileData?.cohort || 'Base Resume';
              const newVar = await apiFetch('/resume/variants', {
                method: 'POST',
                body: JSON.stringify({ label: cohortLabel, cohort: profileData?.cohort || 'General' }),
              });
              const varId = newVar?.variant?.id;
              if (varId) {
                await apiFetch(`/resume/variants/${varId}`, { method: 'PUT', body: JSON.stringify({ sections: parsedSections }) });
                setVariants([{ id: varId, label: cohortLabel, cohort: profileData?.cohort || 'General' }]);
                setActiveVariantId(varId);
                setSectionsByVariant({ [varId]: parsedSections });
                setSavedSnapshots({ [varId]: JSON.stringify(parsedSections) });
                setLoadedVariants(new Set([varId]));
              }
            }
          } catch { /* no parsed resume available — editor stays empty */ }
        }
      } catch { /* proceed with defaults */ }
      setLoading(false);
      // Fire auto-generate after variants are loaded (job card "Tailor resume" flow)
      if (pendingJobRef.current) {
        const job = pendingJobRef.current;
        pendingJobRef.current = null;
        setTimeout(() => generateJobResume(job.company, job.title, job.description), 100);
      }
    }
    load();
  }, []);

  /* Load variant content when switching tabs */
  useEffect(() => {
    if (!activeVariantId || loadedVariants.has(activeVariantId)) return;
    apiFetch(`/resume/variants/${activeVariantId}`).then((data) => {
      const sects = data?.sections ?? [];
      setSectionsByVariant(prev => ({ ...prev, [activeVariantId]: sects }));
      setSavedSnapshots(prev => ({ ...prev, [activeVariantId]: JSON.stringify(sects) }));
      setLoadedVariants(prev => { const s = new Set(prev); s.add(activeVariantId); return s; });
    }).catch(() => {});
  }, [activeVariantId, loadedVariants]);

  /* Warn before browser navigation if dirty */
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyVariants.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtyVariants]);

  /* Sync resume coach context with RightPanel whenever sections or variant changes */
  const coachDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeVariant || !activeVariantId) return;
    if (coachDebounceRef.current) clearTimeout(coachDebounceRef.current);
    coachDebounceRef.current = setTimeout(() => {
      setResumeCoachCtx({
        resumeSections: summarizeSections(sections, cohort),
        variantLabel: activeVariant.label,
        cohort,
      });
    }, 1200);
    return () => { if (coachDebounceRef.current) clearTimeout(coachDebounceRef.current); };
  }, [sections, activeVariant, activeVariantId, cohort, setResumeCoachCtx]);

  /* Clear coach context when page unmounts */
  useEffect(() => () => { setResumeCoachCtx(null); }, [setResumeCoachCtx]);

  /* Proactive coach triggers: fire when user adds a company or writes a meaningful bullet */
  const proactiveCountRef = useRef({ companies: 0, bullets: 0 });
  const proactiveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reset counts when switching variants so we don't carry over state
  useEffect(() => { proactiveCountRef.current = { companies: 0, bullets: 0 }; }, [activeVariantId]);

  useEffect(() => {
    if (!activeVariantId || isResumeEmpty(sections)) return;
    if (proactiveDebounceRef.current) clearTimeout(proactiveDebounceRef.current);
    proactiveDebounceRef.current = setTimeout(() => {
      const allExp = sections.flatMap(s => [...(s.experiences ?? []), ...(s.leadership ?? [])]);
      const companies = allExp.filter(e => e.company.trim().length > 1);
      const bullets = allExp.flatMap(e => e.bullets).filter(b => b.text.trim().length >= 35);
      const prev = proactiveCountRef.current;
      if (companies.length > prev.companies) {
        const newCo = companies[companies.length - 1].company;
        proactiveCountRef.current = { ...prev, companies: companies.length };
        fireProactiveCoach(`User just added "${newCo}" as a new experience entry. You can see the full resume — comment on this entry specifically. Is the role clear? Do the bullets (if any) have metrics? Give one concrete coaching point. Don't ask what they wrote.`);
      } else if (bullets.length > prev.bullets) {
        const newBullet = bullets[bullets.length - 1].text.slice(0, 90);
        proactiveCountRef.current = { companies: companies.length, bullets: bullets.length };
        fireProactiveCoach(`User just finished a bullet: "${newBullet}". You can see this bullet in the resume. Give direct feedback — is it strong? Does it have a metric? Does it start with a powerful verb? Suggest one specific improvement.`);
      }
    }, 4000); // 4s — don't interrupt while typing
    return () => { if (proactiveDebounceRef.current) clearTimeout(proactiveDebounceRef.current); };
  }, [sections, activeVariantId, fireProactiveCoach]);

  /* Job import trigger — fires when Dilly collects enough info from the user in chat */
  useEffect(() => {
    if (!jobImportTrigger) return;
    clearJobImportTrigger();
    generateJobResume(jobImportTrigger.company, jobImportTrigger.title, jobImportTrigger.description);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobImportTrigger]);

  /* Close context menu on Escape */
  useEffect(() => {
    if (!contextMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setContextMenu(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  /* Overflow detection */
  useEffect(() => {
    if (!contentRef.current || !paperRef.current) return;
    const obs = new ResizeObserver(() => {
      const content = contentRef.current;
      const paper = paperRef.current;
      if (!content || !paper) return;
      const paperHeight = paper.clientWidth * (11 / 8.5);
      setOverflowLines(Math.max(0, Math.ceil((content.scrollHeight - paperHeight) / 14)));
    });
    obs.observe(contentRef.current);
    return () => obs.disconnect();
  }, [sections]);

  /* Auto-save per variant */
  const doSave = useCallback(async (variantId: string, sects: ResumeSection[]) => {
    setSaving(true);
    try {
      await apiFetch(`/resume/variants/${variantId}`, { method: 'PUT', body: JSON.stringify({ sections: sects }) });
      const snap = JSON.stringify(sects);
      setSavedSnapshots(prev => ({ ...prev, [variantId]: snap }));
      setDirtyVariants(prev => { const s = new Set(prev); s.delete(variantId); return s; });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  }, []);

  function handleSectionsChange(sects: ResumeSection[]) {
    if (!activeVariantId) return;
    setSectionsByVariant(prev => ({ ...prev, [activeVariantId]: sects }));
    // Mark dirty only if content changed from last save
    const snap = savedSnapshots[activeVariantId];
    const newSnap = JSON.stringify(sects);
    if (newSnap !== snap) {
      setDirtyVariants(prev => { const s = new Set(prev); s.add(activeVariantId); return s; });
    } else {
      setDirtyVariants(prev => { const s = new Set(prev); s.delete(activeVariantId); return s; });
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(activeVariantId, sects), 1500);
  }

  async function handleAddCohort(newCohort: string) {
    setShowAddMenu(false);
    const seed = activeVariantId ? (sectionsByVariant[activeVariantId] ?? []) : [];
    try {
      const data = await apiFetch('/resume/variants', {
        method: 'POST',
        body: JSON.stringify({ label: newCohort, cohort: newCohort, type: 'cohort', sections: seed }),
      });
      const newVariant: VariantMeta = data.variant;
      setVariants(prev => [...prev, newVariant]);
      setSectionsByVariant(prev => ({ ...prev, [newVariant.id]: seed }));
      setSavedSnapshots(prev => ({ ...prev, [newVariant.id]: JSON.stringify(seed) }));
      setLoadedVariants(prev => { const s = new Set(prev); s.add(newVariant.id); return s; });
      setActiveVariantId(newVariant.id);
    } catch { /* silent */ }
  }

  async function handleAddBlank(cohort: string) {
    const blankSections: ResumeSection[] = [
      { key: 'contact', label: 'Contact', contact: { name: '', email: '', phone: '', location: '', linkedin: '' } },
      { key: 'education', label: 'Education', education: { id: 'edu_1', university: '', major: '', minor: '', graduation: '', location: '', honors: '', gpa: '' } },
      { key: 'experience', label: 'Experience', experiences: [{ id: 'exp_1', company: '', role: '', date: '', location: '', bullets: [{ id: 'b1', text: '' }] }] },
      { key: 'skills', label: 'Skills', simple: { id: 'skills_1', lines: [] } },
    ];
    try {
      const data = await apiFetch('/resume/variants', {
        method: 'POST',
        body: JSON.stringify({ label: cohort, cohort, type: 'cohort', sections: blankSections }),
      });
      const newVariant: VariantMeta = data.variant;
      setVariants(prev => [...prev, newVariant]);
      setSectionsByVariant(prev => ({ ...prev, [newVariant.id]: blankSections }));
      setSavedSnapshots(prev => ({ ...prev, [newVariant.id]: JSON.stringify(blankSections) }));
      setLoadedVariants(prev => { const s = new Set(prev); s.add(newVariant.id); return s; });
      setActiveVariantId(newVariant.id);
      setRenamingId(newVariant.id);
    } catch { /* silent */ }
  }

  async function handleDeleteVariant(id: string) {
    if (variants.length <= 1) return; // can't delete last
    await apiFetch(`/resume/variants/${id}`, { method: 'DELETE' });
    const remaining = variants.filter(v => v.id !== id);
    setVariants(remaining);
    setDirtyVariants(prev => { const s = new Set(prev); s.delete(id); return s; });
    if (activeVariantId === id) setActiveVariantId(remaining[0]?.id ?? null);
  }

  async function handleDuplicate(id: string) {
    const variant = variants.find(v => v.id === id);
    if (!variant) return;
    const sects = sectionsByVariant[id] ?? [];
    try {
      const data = await apiFetch('/resume/variants', {
        method: 'POST',
        body: JSON.stringify({
          label: `${variant.label} (copy)`,
          cohort: variant.cohort,
          type: variant.type,
          job_title: variant.job_title,
          job_company: variant.job_company,
          sections: sects,
        }),
      });
      const newVariant: VariantMeta = data.variant;
      setVariants(prev => [...prev, newVariant]);
      setSectionsByVariant(prev => ({ ...prev, [newVariant.id]: sects }));
      setSavedSnapshots(prev => ({ ...prev, [newVariant.id]: JSON.stringify(sects) }));
      setLoadedVariants(prev => { const s = new Set(prev); s.add(newVariant.id); return s; });
      setActiveVariantId(newVariant.id);
    } catch { /* silent */ }
  }

  function openContextMenu(e: React.MouseEvent, variantId: string) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, variantId });
  }

  function trySwitch(targetId: string) {
    if (targetId === activeVariantId) return;
    const currentSections = activeVariantId ? (sectionsByVariant[activeVariantId] ?? []) : [];
    const isDirty = activeVariantId ? dirtyVariants.has(activeVariantId) : false;
    const isEmpty = isResumeEmpty(currentSections);
    if (isDirty && !isEmpty) {
      setPendingSwitch(targetId);
    } else {
      setActiveVariantId(targetId);
    }
  }

  async function handleRename(id: string, newLabel: string) {
    setRenamingId(null);
    await apiFetch(`/resume/variants/${id}`, { method: 'PATCH', body: JSON.stringify({ label: newLabel }) });
    setVariants(prev => prev.map(v => v.id === id ? { ...v, label: newLabel } : v));
  }

  async function generateJobResume(company: string, title: string, description: string) {
    if (!company.trim() || !title.trim()) {
      setTailorError({ company: company || 'this job', reason: 'Missing job title or company name.' });
      return;
    }
    setJobGenerating(true);
    setJobGeneratingCompany(company);
    setTailorError(null);
    try {
      const { getToken } = await import('@/lib/auth');
      const token = getToken();
      const apiBase = '/api/proxy';
      const res = await fetch(`${apiBase}/resume/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ job_title: title, job_company: company, job_description: description }),
      });
      if (!res.ok || !res.body) {
        setJobGenerating(false);
        const status = res.status;
        const reason = status === 404
          ? 'Resume generation is not available right now.'
          : status === 403
          ? 'Your plan does not include tailored resumes.'
          : `Server returned an error (${status}).`;
        setTailorError({ company, reason });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
      }

      const jsonMatch = full.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        setJobGenerating(false);
        setTailorError({ company, reason: 'The generated resume could not be parsed. Try again.' });
        return;
      }
      const sections: ResumeSection[] = JSON.parse(jsonMatch[0]);

      const varData = await apiFetch('/resume/variants', {
        method: 'POST',
        body: JSON.stringify({ label: `${company} – ${title}`, cohort: 'General', type: 'job', job_title: title, job_company: company, sections }),
      });
      setJobGenerating(false);
      if (varData?.variant) {
        // Persist description so JobFitPanel can score this role later
        if (typeof window !== 'undefined' && description.trim()) {
          localStorage.setItem(`dilly_jd_${varData.variant.id}`, description.trim());
        }
        await handleJobGenerated(varData.variant, sections);
      } else {
        setTailorError({ company, reason: 'Resume was generated but could not be saved.' });
      }
    } catch (err) {
      setJobGenerating(false);
      setTailorError({ company, reason: 'Something went wrong. Check your connection and try again.' });
    }
  }

  async function handleJobGenerated(variant: VariantMeta, genSections: ResumeSection[]) {
    setVariants(prev => [...prev, variant]);
    setSectionsByVariant(prev => ({ ...prev, [variant.id]: [] }));
    setLoadedVariants(prev => { const s = new Set(prev); s.add(variant.id); return s; });
    setActiveVariantId(variant.id);
    // Animate filling each section field-by-field
    await animateFillSections(genSections, (sects) => {
      setSectionsByVariant(prev => ({ ...prev, [variant.id]: sects }));
    });
    doSave(variant.id, genSections);
  }

  async function exportPDF() {
    const container = paperRef.current;
    if (!container) return;

    const resumeEl = container.querySelector<HTMLElement>(':scope > div');
    if (!resumeEl) return;

    // Get user's name for the filename
    const contactSection = sections.find(s => s.contact);
    const userName = (contactSection?.contact?.name || '').trim() || 'Resume';
    const filename = (userName.includes('Resume') ? userName : `${userName} Resume`) + '.pdf';

    // Hide the page-limit line and overflow gradient during capture
    const pageLimit = resumeEl.querySelector<HTMLElement>('.resume-page-limit');
    const overflowGradient = container.querySelector<HTMLElement>('[style*="linear-gradient"]');
    const allRedElements = resumeEl.querySelectorAll<HTMLElement>('[style*="ef4444"], [style*="239,68,68"]');
    if (pageLimit) pageLimit.style.display = 'none';
    if (overflowGradient) overflowGradient.style.display = 'none';
    allRedElements.forEach(el => { el.dataset.prevDisplay = el.style.display; el.style.display = 'none'; });

    try {
      const { default: html2canvas } = await import('html2canvas');

      // Capture the resume element as a canvas
      const canvas = await html2canvas(resumeEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      // Letter size in points: 612 x 792
      const pageW = 612;
      const pageH = 792;

      // Scale canvas to fit exactly one letter-size page
      const imgW = canvas.width;
      const imgH = canvas.height;
      const ratio = Math.min(pageW / imgW, pageH / imgH);
      const fitW = imgW * ratio;
      const fitH = imgH * ratio;

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, fitW, fitH);
      pdf.save(filename);
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      if (pageLimit) pageLimit.style.display = '';
      if (overflowGradient) overflowGradient.style.display = '';
      allRedElements.forEach(el => { el.style.display = el.dataset.prevDisplay ?? ''; delete el.dataset.prevDisplay; });
    }
  }

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-0)' }}>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading your resume...</p>
      </div>
    );
  }

  const t = getTemplate(cohort);
  const existingCohorts = new Set(variants.filter(v => v.type === 'cohort').map(v => v.cohort));
  const availableCohorts = ALL_COHORTS.filter(c => !existingCohorts.has(c));
  const availableUserCohorts = userCohorts.filter(c => !existingCohorts.has(c));

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-0)', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: 'var(--surface-0)', borderBottom: '1px solid var(--border-main)', flexShrink: 0, gap: 12 }}>
        {/* All Resumes overview button */}
        <button onClick={() => setShowOverview(prev => !prev)}
          title={showOverview ? 'Hide resumes' : 'All resumes'}
          style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: showOverview ? `1px solid ${t.accentColor}30` : '1px solid var(--border-main)',
            background: showOverview ? `${t.accentColor}10` : 'transparent',
            color: showOverview ? t.accentColor : 'var(--text-3)',
            cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s', gap: 2 }}
          onMouseEnter={e => { if (!showOverview) { e.currentTarget.style.borderColor = t.accentColor; e.currentTarget.style.color = t.accentColor; } }}
          onMouseLeave={e => { if (!showOverview) { e.currentTarget.style.borderColor = 'var(--border-main)'; e.currentTarget.style.color = 'var(--text-3)'; } }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
        </button>

        {/* Variant tabs — overflow hidden clips only the tabs, + is outside */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden', minWidth: 0 }}>
          {variants.map(v => {
            const isActive = v.id === activeVariantId;
            const isJob = v.type === 'job';
            const isDirty = dirtyVariants.has(v.id);
            const tc = getTemplate(v.cohort).accentColor;
            return (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                background: isActive ? `${tc}12` : 'transparent',
                border: isActive ? `1px solid ${tc}25` : '1px solid transparent',
                transition: 'background 120ms ease, border-color 120ms ease' }}
                onClick={() => trySwitch(v.id)}
                onContextMenu={e => openContextMenu(e, v.id)}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.borderColor = 'var(--border-main)'; }}}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}}>
                {isJob && <span style={{ fontSize: 9, color: tc }}>✦</span>}
                {isDirty && !isActive && (
                  <span title="Unsaved changes" style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                )}
                {renamingId === v.id ? (
                  <RenameInput value={v.label} onDone={label => handleRename(v.id, label)} />
                ) : (
                  <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? tc : 'var(--text-2)', whiteSpace: 'nowrap' }}
                    onDoubleClick={() => setRenamingId(v.id)}>
                    {v.label}
                  </span>
                )}
                {isDirty && isActive && (
                  <span title="Unsaved changes" style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                )}
                {variants.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); handleDeleteVariant(v.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 10, lineHeight: 1, padding: '0 0 0 2px', opacity: isActive ? 0.7 : 0.3 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>✕</button>
                )}
              </div>
            );
          })}
        </div>

        {/* + button — opens cohort picker */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowAddMenu(s => !s)}
            style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-main)', background: showAddMenu ? 'var(--surface-1)' : 'transparent', color: showAddMenu ? 'var(--text-1)' : 'var(--text-3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accentColor; e.currentTarget.style.color = t.accentColor; }}
            onMouseLeave={e => { if (!showAddMenu) { e.currentTarget.style.borderColor = 'var(--border-main)'; e.currentTarget.style.color = 'var(--text-3)'; } }}>
            +
          </button>

          {showAddMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowAddMenu(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: 'var(--surface-0)', border: '1px solid var(--border-main)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', zIndex: 200, minWidth: 240, padding: '6px 0', maxHeight: 400, overflowY: 'auto' }}>
                {/* Import a job option */}
                <button
                  onClick={() => {
                    setShowAddMenu(false);
                    setShowImportModal(true);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 14px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-1)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(59,76,192,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2B3A8E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </span>
                  <span style={{ flex: 1 }}>Import a job</span>
                  <span style={{ fontSize: 10, color: '#2B3A8E', fontWeight: 600 }}>AI</span>
                </button>
                <div style={{ height: 1, background: 'var(--border-main)', margin: '4px 0' }} />
                {userInterests.filter(c => !existingCohorts.has(c)).length > 0 && (
                  <>
                    <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 14px 6px' }}>Your interests</p>
                    {userInterests.filter(c => !existingCohorts.has(c)).map(c => (
                      <button key={c} onClick={() => { setShowAddMenu(false); handleAddBlank(c); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '7px 14px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-1)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: getTemplate(c).accentColor, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{c}</span>
                        <span style={{ fontSize: 9, color: getTemplate(c).accentColor, fontWeight: 700 }}>★</span>
                      </button>
                    ))}
                    <div style={{ height: 1, background: 'var(--border-main)', margin: '4px 0' }} />
                  </>
                )}
                <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 14px 6px' }}>
                  {userInterests.length > 0 ? 'All cohorts' : 'Your cohorts'}
                </p>
                {(userInterests.length > 0
                  ? availableCohorts.filter(c => !userInterests.includes(c))
                  : (userCohorts.length > 0 ? userCohorts.filter(c => !existingCohorts.has(c)) : availableCohorts)
                ).map(c => (
                  <button key={c} onClick={() => { setShowAddMenu(false); handleAddBlank(c); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '7px 14px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-1)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: getTemplate(c).accentColor, flexShrink: 0 }} />
                    {c}
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--border-main)', margin: '4px 0' }} />
                <a href="/academy"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px 8px', fontSize: 11, color: 'var(--text-3)', textDecoration: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#2B3A8E'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}>
                  Manage interests
                  <span style={{ fontSize: 10 }}>→</span>
                </a>
              </div>
            </>
          )}
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {saved && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Saved</span>}
          {saving && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Saving...</span>}
          <button onClick={() => setShowDeleteConfirm(true)}
            title="Delete this resume"
            style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-main)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0, transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-main)'; e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </button>
          <button
            onClick={() => {
              // Serialize current resume to text and store for ATS page
              const text = sections.map(s => {
                const lines: string[] = [];
                if (s.contact) {
                  const c = s.contact;
                  lines.push([c.name, c.email, c.phone, c.location, c.linkedin].filter(Boolean).join(' | '));
                }
                if (s.education) {
                  const e = s.education;
                  lines.push('EDUCATION');
                  lines.push([e.university, e.major, e.gpa && `GPA: ${e.gpa}`, e.graduation].filter(Boolean).join(' | '));
                }
                const expList = s.experiences ?? s.leadership;
                if (expList?.length) {
                  lines.push(s.label?.toUpperCase() || 'EXPERIENCE');
                  expList.forEach(exp => {
                    lines.push([exp.company, exp.role, exp.date].filter(Boolean).join(' | '));
                    exp.bullets.forEach(b => { if (b.text.trim()) lines.push(`• ${b.text.trim()}`); });
                  });
                }
                if (s.projects?.length) {
                  lines.push('PROJECTS');
                  s.projects.forEach(p => {
                    lines.push([p.name, p.date, p.tech].filter(Boolean).join(' | '));
                    p.bullets.forEach(b => { if (b.text.trim()) lines.push(`• ${b.text.trim()}`); });
                  });
                }
                if (s.simple?.lines?.some(l => l.trim())) {
                  lines.push((s.label || 'SKILLS').toUpperCase());
                  lines.push(s.simple.lines.filter(l => l.trim()).join(', '));
                }
                return lines.join('\n');
              }).filter(Boolean).join('\n\n');
              sessionStorage.setItem('dilly_ats_resume_text', text);
              window.location.href = '/ats';
            }}
            style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid rgba(59,76,192,0.2)', background: 'rgba(59,76,192,0.06)', color: '#2B3A8E', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 14l2 2 4-4"/>
            </svg>
            ATS Check
          </button>
          <button onClick={exportPDF} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid var(--border-main)', background: 'var(--surface-1)', color: 'var(--text-2)', cursor: 'pointer' }}>
            Download Resume
          </button>
          <button onClick={() => activeVariantId && doSave(activeVariantId, sections)}
            style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', background: t.accentColor, color: 'white', cursor: 'pointer' }}>
            Save
          </button>
        </div>
      </div>

      {/* Tailor error banner */}
      {tailorError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
          background: 'rgba(255,69,58,0.06)', borderBottom: '1px solid rgba(255,69,58,0.18)',
          flexShrink: 0,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,69,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#FF453A', margin: 0 }}>
              Couldn&apos;t tailor resume for {tailorError.company}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>{tailorError.reason}</p>
          </div>
          <button onClick={() => setTailorError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16, lineHeight: 1, padding: 4, flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = '#FF453A')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
            ✕
          </button>
        </div>
      )}

      {/* Main split */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: Resume paper preview */}
        <div ref={paperRef} style={{ flex: '0 0 55%', overflow: 'auto', padding: '20px', background: 'var(--surface-2)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }} className="resume-print-area">
          <div style={{ width: '100%', maxWidth: 680, background: 'white', boxShadow: '0 2px 20px rgba(0,0,0,0.10)', borderRadius: 2, minHeight: 880, position: 'relative' }}>
            <ResumePaper sections={sections} cohort={cohort} contentRef={contentRef as React.RefObject<HTMLDivElement>} overflowRef={overflowRef as React.RefObject<HTMLDivElement>} />
            {overflowLines > 0 && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.min(overflowLines * 14, 120), background: 'linear-gradient(to bottom, transparent, rgba(239,68,68,0.08))', pointerEvents: 'none', borderRadius: '0 0 2px 2px' }} />
            )}
          </div>
        </div>

        {/* RIGHT: Editor (with optional generating overlay) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface-0)', overflow: 'hidden', borderLeft: '1px solid var(--border-main)', position: 'relative' }}>
          <EditorPanel
            sections={sections} setSections={handleSectionsChange}
            activeSection={activeSection} setActiveSection={setActiveSection}
            cohort={cohort} onImprove={b => setImproveBullet(b)}
            overflowLines={overflowLines}
            jobContext={activeVariant?.type === 'job' ? { company: activeVariant.job_company || '', title: activeVariant.job_title || '' } : undefined}
            onAskDilly={fireProactiveCoach}
          />
          {jobGenerating && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--surface-0-rgb, 15,15,26), 0.85)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(59,76,192,0.15)', borderTop: '3px solid #2B3A8E', animation: 'spin 1s linear infinite' }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 5px' }}>Building your resume</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>Tailoring every bullet for {jobGeneratingCompany}…</p>
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
        </div>

        {/* Job Fit panel — shown for job variants */}
        {activeVariant?.type === 'job' && (
          <JobFitPanel variant={activeVariant} />
        )}

        {/* Resume list panel — slides in adjacent to AI panel */}
        {showOverview && (
          <ResumeOverview
            variants={variants}
            dirtySet={dirtyVariants}
            activeId={activeVariantId}
            sort={overviewSort}
            setSort={setOverviewSort}
            onClose={() => setShowOverview(false)}
            onSelect={id => { trySwitch(id); }}
            onContextMenu={openContextMenu}
          />
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          variants={variants}
          onClose={() => setContextMenu(null)}
          onRename={id => { setActiveVariantId(id); setRenamingId(id); }}
          onDuplicate={handleDuplicate}
          onDelete={id => { setActiveVariantId(id); setShowDeleteConfirm(true); }}
        />
      )}

      {improveBullet && <ImproveModal bullet={improveBullet} cohort={cohort} onClose={() => setImproveBullet(null)} />}

      {/* Unsaved changes warning */}
      {pendingSwitch !== null && activeVariant && (
        <UnsavedModal
          label={activeVariant.label}
          onCancel={() => setPendingSwitch(null)}
          onDiscard={() => {
            const target = pendingSwitch;
            setPendingSwitch(null);
            if (activeVariantId) {
              // Revert to saved snapshot
              const snap = savedSnapshots[activeVariantId];
              if (snap) setSectionsByVariant(prev => ({ ...prev, [activeVariantId]: JSON.parse(snap) }));
              setDirtyVariants(prev => { const s = new Set(prev); s.delete(activeVariantId); return s; });
            }
            setActiveVariantId(target);
          }}
          onSave={async () => {
            const target = pendingSwitch;
            setPendingSwitch(null);
            if (activeVariantId) await doSave(activeVariantId, sections);
            setActiveVariantId(target);
          }}
        />
      )}

      {/* Resume overview is now inline in the editor layout — see below */}

      {/* ── Job Import Modal ───────────────────── */}
      {showImportModal && (
        <JobImportModal
          onClose={() => setShowImportModal(false)}
          onSubmit={(company, title, description) => {
            setShowImportModal(false);
            generateJobResume(company, title, description);
          }}
        />
      )}

      {showDeleteConfirm && activeVariant && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background: 'var(--surface-0)', borderRadius: 12, padding: '28px 28px 24px', maxWidth: 400, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid var(--border-main)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 6px' }}>
              {variants.length <= 1 ? "Can't delete" : 'Delete this resume?'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 24px', lineHeight: 1.5 }}>
              {variants.length <= 1
                ? "You only have one resume — you can't delete your last one."
                : <><strong style={{ color: 'var(--text-1)' }}>{activeVariant.label}</strong> will be permanently deleted. This can't be undone.</>}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDeleteConfirm(false)}
                style={{ flex: 1, height: 38, borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid var(--border-main)', background: 'var(--surface-1)', color: 'var(--text-2)', cursor: 'pointer' }}>
                {variants.length <= 1 ? 'OK' : 'Cancel'}
              </button>
              {variants.length > 1 && (
                <button onClick={() => { setShowDeleteConfirm(false); handleDeleteVariant(activeVariant.id); }}
                  style={{ flex: 1, height: 38, borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer' }}>
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
