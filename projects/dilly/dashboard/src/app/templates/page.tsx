"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { AppProfileHeader } from "@/components/career-center";
import { API_BASE, AUTH_TOKEN_KEY, AUTH_USER_CACHE_KEY, AUTH_USER_CACHE_MAX_AGE_MS, getCareerCenterReturnPath } from "@/lib/dillyUtils";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";

type TemplateType = "cover_letter" | "thank_you" | "follow_up" | "linkedin" | "resume_tailor" | "interview_prep";

const TEMPLATE_CONFIG: Record<
  TemplateType,
  { label: string; desc: string; fields: { key: string; label: string; placeholder: string; required?: boolean }[] }
> = {
  cover_letter: {
    label: "Cover letter",
    desc: "Full letter from your profile + job description. Edit before sending.",
    fields: [
      { key: "company", label: "Company", placeholder: "Goldman Sachs", required: true },
      { key: "role", label: "Role", placeholder: "Summer Analyst", required: true },
      { key: "job_description", label: "Job description (optional)", placeholder: "Paste JD for better match", required: false },
    ],
  },
  thank_you: {
    label: "Thank-you email",
    desc: "Post-interview template with role/company specifics.",
    fields: [
      { key: "company", label: "Company", placeholder: "Goldman Sachs", required: true },
      { key: "role", label: "Role", placeholder: "Summer Analyst", required: true },
      { key: "interviewer_name", label: "Interviewer (optional)", placeholder: "Sarah Chen", required: false },
      { key: "notes", label: "Interview notes (optional)", placeholder: "Discussed leadership in club", required: false },
    ],
  },
  follow_up: {
    label: "Follow-up",
    desc: "Haven't heard back in 2+ weeks? Polite check-in template.",
    fields: [
      { key: "company", label: "Company", placeholder: "Goldman Sachs", required: true },
      { key: "role", label: "Role", placeholder: "Summer Analyst", required: true },
      { key: "weeks_since", label: "Weeks since applying", placeholder: "2", required: false },
    ],
  },
  linkedin: {
    label: "LinkedIn outreach",
    desc: "Connection request or message. Personal, not generic.",
    fields: [
      { key: "recipient_name", label: "Recipient", placeholder: "Sarah Chen", required: true },
      { key: "company", label: "Company (optional)", placeholder: "Goldman Sachs", required: false },
      { key: "role", label: "Role (optional)", placeholder: "Recruiter", required: false },
      { key: "type", label: "Type", placeholder: "connection", required: false },
    ],
  },
  resume_tailor: {
    label: "Resume tailoring",
    desc: "Tailored bullet suggestions for this role. One base, many versions.",
    fields: [
      { key: "company", label: "Company", placeholder: "Goldman Sachs", required: false },
      { key: "role", label: "Role", placeholder: "Summer Analyst", required: false },
      { key: "job_description", label: "Job description", placeholder: "Paste JD for best results", required: false },
    ],
  },
  interview_prep: {
    label: "Interview prep",
    desc: "Common questions + personalized stories from your profile.",
    fields: [
      { key: "company", label: "Company (optional)", placeholder: "Goldman Sachs", required: false },
      { key: "role", label: "Role (optional)", placeholder: "Summer Analyst", required: false },
      { key: "job_description", label: "Job description (optional)", placeholder: "Paste JD", required: false },
    ],
  },
};

const ENDPOINTS: Record<TemplateType, string> = {
  cover_letter: "/templates/cover-letter",
  thank_you: "/templates/thank-you",
  follow_up: "/templates/follow-up",
  linkedin: "/templates/linkedin",
  resume_tailor: "/templates/resume-tailor",
  interview_prep: "/templates/interview-prep",
};

export default function TemplatesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<{ email: string; subscribed: boolean } | null>(null);

  useEffect(() => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) {
      setAuthLoading(false);
      router.replace("/");
      return;
    }
    try {
      const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(AUTH_USER_CACHE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { email: string; subscribed: boolean; ts: number };
        if (parsed?.email && typeof parsed.ts === "number" && Date.now() - parsed.ts < AUTH_USER_CACHE_MAX_AGE_MS && parsed.subscribed) {
          setUser({ email: parsed.email, subscribed: true });
          setAuthLoading(false);
        }
      }
    } catch { /* ignore */ }

    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const u = { email: data?.email ?? "", subscribed: !!data?.subscribed };
        setUser(u);
        if (!u.subscribed) router.replace("/");
      })
      .catch(() => router.replace("/"))
      .finally(() => setAuthLoading(false));
  }, [router]);
  const [activeCard, setActiveCard] = useState<TemplateType | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [editedText, setEditedText] = useState<string>("");
  const [isExiting, setIsExiting] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const handleNavigateAway = useCallback((path: string) => {
    if (isExiting) return;
    setIsExiting(true);
    pageRef.current?.classList.add("template-pop-out");
    setTimeout(() => router.push(path), 280);
  }, [isExiting, router]);

  const handleGenerate = async (type: TemplateType) => {
    const config = TEMPLATE_CONFIG[type];
    const body: Record<string, unknown> = {};
    for (const f of config.fields) {
      const v = formValues[f.key]?.trim();
      if (v) {
        if (f.key === "weeks_since") body[f.key] = parseInt(v, 10) || 2;
        else if (f.key === "type") body[f.key] = v === "message" ? "message" : "connection";
        else body[f.key] = v;
      }
    }
    if (type === "linkedin" && !body.recipient_name) {
      toast("Recipient required", "error");
      return;
    }
    if (type === "cover_letter" && !body.company && !body.role && !body.job_description) {
      toast("Company, role, or job description required", "error");
      return;
    }
    if (type === "resume_tailor" && !body.job_description && !(body.company && body.role)) {
      toast("Job description or company+role required", "error");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
      const res = await fetch(`${API_BASE}${ENDPOINTS[type]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = res.ok ? await res.json() : null;
      if (!res.ok) {
        toast(data?.error || "Failed to generate", "error");
        return;
      }
      setResult(data);
      if (data.cover_letter) setEditedText(data.cover_letter);
      else if (data.email_body) setEditedText(data.email_body);
      else if (data.text) setEditedText(data.text);
      else setEditedText("");
      hapticSuccess();
    } catch {
      toast("Failed to generate", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    hapticSuccess();
    toast("Copied to clipboard", "success");
  };

  if (authLoading || !user?.subscribed) {
    return (
      <LoadingScreen>
        <div className="career-center-talent max-w-[390px] mx-auto px-4 text-center" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
          <h1 className="text-[15px] font-semibold mb-2" style={{ color: "var(--t1)" }}>Templates</h1>
          <p className="text-sm mb-4" style={{ color: "var(--t3)" }}>Subscribe to use Dilly templates.</p>
          <Link href={getCareerCenterReturnPath()} className="text-sm font-medium px-4 py-2 rounded-[18px] transition-opacity hover:opacity-90" style={{ background: "var(--s2)", color: "var(--t2)" }}>Back to app</Link>
        </div>
      </LoadingScreen>
    );
  }

  const TEMPLATE_ICONS: Record<TemplateType, ReactNode> = {
    cover_letter: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
    thank_you: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>,
    follow_up: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    linkedin: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>,
    resume_tailor: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>,
    interview_prep: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>,
  };

  return (
    <div ref={pageRef} className={`career-center-talent min-h-screen ${isExiting ? "template-pop-out" : ""}`} style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
      <div className="max-w-[390px] mx-auto px-4"><AppProfileHeader back={getCareerCenterReturnPath()} /></div>

      <main className="max-w-[390px] mx-auto px-4 pb-24 pt-5">
        <p className="text-sm mb-6 template-pop-in" style={{ animationDelay: "50ms", color: "var(--t3)" }}>Cover letters, thank-yous, follow-ups, LinkedIn, resume tailoring. All personalized from your profile.</p>

        {(Object.keys(TEMPLATE_CONFIG) as TemplateType[]).map((type, idx) => {
          const config = TEMPLATE_CONFIG[type];
          const isOpen = activeCard === type;
          const hasResult = result && activeCard === type;
          const isFirst = idx === 0;

          return (
            <div
              key={type}
              className={`mb-4 rounded-[18px] overflow-hidden transition-opacity hover:opacity-95 template-pop-in`}
              style={{
                background: "var(--s2)",
                borderLeft: "4px solid var(--blue)",
                animationDelay: `${100 + idx * 60}ms`,
              }}
            >
              <button
                type="button"
                onClick={() => { hapticLight(); setActiveCard(isOpen ? null : type); setResult(null); }}
                className="w-full p-4 flex items-center gap-4 text-left"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(10, 132, 255, 0.2)" }}>
                  {TEMPLATE_ICONS[type]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm" style={{ color: "var(--t1)" }}>{config.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>{config.desc}</p>
                </div>
                <svg className={`w-5 h-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-4 space-y-4" style={{ borderTop: "1px solid var(--b1)" }}>
                  {config.fields.map((f) => (
                    <div key={f.key}>
                      <label className="block text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--t3)" }}>{f.label}</label>
                      {f.key === "job_description" ? (
                        <textarea
                          value={formValues[f.key] || ""}
                          onChange={(e) => setFormValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          rows={3}
                          className="w-full px-3 py-2 rounded-lg text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--blue)] resize-none"
                          style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                        />
                      ) : f.key === "type" ? (
                        <select
                          value={formValues[f.key] || "connection"}
                          onChange={(e) => setFormValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
                          style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                        >
                          <option value="connection">Connection request</option>
                          <option value="message">Message</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={formValues[f.key] || ""}
                          onChange={(e) => setFormValues((v) => ({ ...v, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          className="w-full px-3 py-2 rounded-lg text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
                          style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                        />
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => handleGenerate(type)}
                    disabled={loading}
                    className="w-full py-2.5 rounded-[18px] font-semibold text-sm min-h-[44px] transition-opacity disabled:opacity-50 hover:opacity-90 active:opacity-80"
                    style={{ background: "var(--blue)", color: "#fff" }}
                  >
                    {loading ? "Generating…" : "Generate"}
                  </button>

                  {hasResult && (
                    <div className="space-y-3 pt-2">
                      {result.cover_letter ? (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--t3)" }}>Cover letter</span>
                            <button type="button" onClick={() => handleCopy(editedText || String(result.cover_letter))} className="text-[10px] font-medium" style={{ color: "var(--blue)" }}>Copy</button>
                          </div>
                          <textarea
                            value={editedText}
                            onChange={(e) => setEditedText(e.target.value)}
                            rows={12}
                            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[var(--blue)] resize-none"
                            style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                          />
                        </>
                      ) : null}
                      {result.email_body ? (
                        <>
                          {result.subject && <p className="text-[10px]" style={{ color: "var(--t3)" }}>Subject: {String(result.subject)}</p>}
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--t3)" }}>Email body</span>
                            <button type="button" onClick={() => handleCopy(editedText || String(result.email_body))} className="text-[10px] font-medium" style={{ color: "var(--blue)" }}>Copy</button>
                          </div>
                          <textarea
                            value={editedText}
                            onChange={(e) => setEditedText(e.target.value)}
                            rows={8}
                            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[var(--blue)] resize-none"
                            style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}
                          />
                        </>
                      ) : null}
                      {result.text ? (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--t3)" }}>LinkedIn</span>
                            <button type="button" onClick={() => handleCopy(String(result.text))} className="text-[10px] font-medium" style={{ color: "var(--blue)" }}>Copy</button>
                          </div>
                          <div className="p-3 rounded-lg text-sm whitespace-pre-wrap" style={{ border: "1px solid var(--b2)", background: "var(--s3)", color: "var(--t1)" }}>{String(result.text)}</div>
                        </>
                      ) : null}
                      {result.questions && Array.isArray(result.questions) ? (
                        <div className="space-y-3">
                          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--t3)" }}>Interview prep</span>
                          {(result.questions as { question: string; dimension: string; hint: string; story_hook: string }[]).map((q, i) => (
                            <div key={i} className="p-3 rounded-lg" style={{ border: "1px solid var(--b2)", background: "var(--s3)" }}>
                              <p className="text-sm font-medium mb-1" style={{ color: "var(--t1)" }}>{q.question}</p>
                              <p className="text-xs mb-1" style={{ color: "var(--t3)" }}>{q.dimension}</p>
                              <p className="text-xs" style={{ color: "var(--t3)" }}>{q.hint}</p>
                              {q.story_hook && <p className="text-xs mt-1 italic" style={{ color: "var(--blue)" }}>{q.story_hook}</p>}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {result.suggestions && Array.isArray(result.suggestions) ? (
                        <div className="space-y-3">
                          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--t3)" }}>Tailored bullets</span>
                          {(result.suggestions as { original: string; tailored: string; rationale: string }[]).map((s, i) => (
                            <div key={i} className="p-3 rounded-lg space-y-2" style={{ border: "1px solid var(--b2)", background: "var(--s3)" }}>
                              <p className="text-xs" style={{ color: "var(--t3)" }}>Original</p>
                              <p className="text-xs" style={{ color: "var(--t3)" }}>{s.original}</p>
                              <p className="text-xs font-medium" style={{ color: "var(--t1)" }}>Tailored</p>
                              <p className="text-xs" style={{ color: "var(--t2)" }}>{s.tailored}</p>
                              {s.rationale && <p className="text-[10px]" style={{ color: "var(--blue)" }}>{s.rationale}</p>}
                              <button type="button" onClick={() => handleCopy(s.tailored)} className="text-[10px] font-medium" style={{ color: "var(--blue)" }}>Copy tailored</button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
