'use client';

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import DillyAvatar from './DillyAvatar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRightPanel } from '@/app/(app)/layout';
import JobImportFlow from './JobImportFlow';

const ConversationHistory = lazy(() => import('@/components/chat/ConversationHistory'));

const TEST_TOKEN = process.env.NEXT_PUBLIC_TEST_TOKEN || '';

/** Use the Next.js rewrite proxy to avoid Safari cross-origin issues */
function getApiBase() {
  if (typeof window !== 'undefined') return '/api/proxy';
  return process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
}

function getToken() {
  if (typeof window !== 'undefined') return localStorage.getItem('dilly_token') || TEST_TOKEN;
  return TEST_TOKEN;
}

type Message = { role: 'user' | 'assistant'; content: string; ts: number };

const PAGE_CONTEXT: Record<string, string> = {
  '/home': 'home dashboard',
  '/scores': 'score breakdown page',
  '/jobs': 'jobs and matching page — help the user find and evaluate roles',
  '/tracker': 'application tracker — help the user stay on top of their applications',
  '/calendar': 'recruiting calendar — help the user manage deadlines and interviews',
  '/leaderboard': 'peer leaderboard — help the user understand how they compare and how to improve',
  '/academy': 'career academy',
  '/resume-editor': 'resume editor — the user is actively building their resume. You are their live resume coach. Read the live resume in the context block and coach them proactively.',
  '/profile': 'Dilly profile — help the user build a richer profile so Dilly can give better advice',
};

// Per-page persona config: greeting line + sub-description
const PAGE_PERSONA: Record<string, { greeting: string; sub: string; role: string }> = {
  '/home':          { greeting: 'Your career advisor.',          sub: "I know your scores, your gaps, and what's next. Ask me anything.", role: 'AI ADVISOR' },
  '/jobs':          { greeting: 'Helping you find the right roles.', sub: 'Ask about any job, your fit, or what to apply to next.',         role: 'AI ADVISOR' },
  '/tracker':       { greeting: 'Tracking your applications.',    sub: "I can remind you to follow up, prep for interviews, and more.",    role: 'TRACKER' },
  '/calendar':      { greeting: 'Your recruiting calendar.',      sub: "I can add events, set reminders, and help you plan your timeline.", role: 'CALENDAR' },
  '/leaderboard':   { greeting: 'Your career advisor.',          sub: "I can tell you exactly what to work on to move up the rankings.",  role: 'AI ADVISOR' },
  '/scores':        { greeting: 'Your career advisor.',          sub: "Ask me what your scores mean and how to improve them.",             role: 'AI ADVISOR' },
  '/resume-editor': { greeting: 'Your resume coach is ready.',   sub: "I see what you have so far. Ask me anything or press Ask Dilly.",  role: 'RESUME COACH' },
  '/profile':       { greeting: 'Building your profile.',        sub: "The more I know about you, the better my advice gets.",            role: 'PROFILE' },
};

function buildProfileSuggestions(profile: any): string[] {
  const smart = Math.round(profile?.overall_smart || 0);
  const grit = Math.round(profile?.overall_grit || 0);
  const build = Math.round(profile?.overall_build || 0);
  const dillyScore = Math.round(profile?.overall_dilly_score || 0);

  const dims = [
    { name: 'Smart', val: smart },
    { name: 'Grit', val: grit },
    { name: 'Build', val: build },
  ].sort((a, b) => a.val - b.val);
  const weakest = dims[0];

  let q1 = "Why am I not standing out to recruiters?";
  if (weakest.val > 0) {
    if (weakest.name === 'Build') q1 = "What projects would actually make me stand out?";
    else if (weakest.name === 'Grit') q1 = "What makes me look less committed than other candidates?";
    else q1 = "How do I compete with students from better-ranked schools?";
  }

  let q2 = "Which companies should I be targeting right now?";
  if (dillyScore >= 80) q2 = "Am I ready to apply to top-tier companies?";
  else if (dillyScore >= 60) q2 = "How close am I to being competitive for my dream companies?";
  else if (dillyScore > 0) q2 = "What does a recruiter actually think when they see my profile?";

  const q3Options = [
    "What's the one thing I should do this week to get closer to a job?",
    "If you were me, what would you work on first?",
    "What's the fastest way to improve my chances?",
  ];
  const q3 = q3Options[dillyScore % 3];

  return [q1, q2, q3];
}

const COACH_SUGGESTIONS = [
  "How's my resume looking so far?",
  "What's the most important section I should fill in next?",
  "What makes a strong bullet for my cohort?",
];

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%', background: 'rgba(201,168,76,0.7)',
          animation: 'dillyBounce 1.2s ease-in-out infinite',
          animationDelay: `${i * 0.18}s`,
        }} />
      ))}
    </div>
  );
}

export default function RightPanel({ initialMessage }: { initialMessage?: string }) {
  const pathname = usePathname();
  const { resumeCoachCtx, proactiveCoachTrigger, clearProactiveCoachTrigger, setResumeHighlight, fireJobImport, showJobImportForm } = useRightPanel();
  const isCoachMode = !!resumeCoachCtx;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([
    "What's holding back my Dilly score?",
    "Which companies am I closest to?",
    "What's the single most important thing I should do this week?",
  ]);
  const [focused, setFocused] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [convId, setConvId] = useState(() => `desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const prevVariantRef = useRef(resumeCoachCtx?.variantLabel ?? null);

  // Reset chat on every page navigation
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      setMessages([]);
      setStreamingText('');
      setInput('');
      setShowHistory(false);
      setConvId(`desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    }
  }, [pathname]);

  // Reset chat when user switches resume variants
  useEffect(() => {
    const cur = resumeCoachCtx?.variantLabel ?? null;
    if (prevVariantRef.current && cur && cur !== prevVariantRef.current) {
      setMessages([]);
      setStreamingText('');
      setConvId(`desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    }
    prevVariantRef.current = cur;
  }, [resumeCoachCtx?.variantLabel]);

  // Open a past conversation from history
  const openConversation = useCallback(async (historyConvId: string) => {
    try {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/voice/history/${encodeURIComponent(historyConvId)}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const msgs: Message[] = (data.messages ?? data ?? []).map((m: any) => ({
          role: m.role || 'assistant',
          content: m.content || m.text || '',
          ts: m.ts ? m.ts * 1000 : Date.now(),
        }));
        setMessages(msgs);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
    setConvId(historyConvId);
    setStreamingText('');
    setShowHistory(false);
  }, []);
  const [profileCtx, setProfileCtx] = useState<Record<string, unknown>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pageCtx = PAGE_CONTEXT[pathname] || 'desktop app';
  const persona = isCoachMode
    ? PAGE_PERSONA['/resume-editor']
    : (PAGE_PERSONA[pathname] || { greeting: 'Your career advisor.', sub: "I know your scores, your gaps, and what's next. Ask me anything.", role: 'AI ADVISOR' });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingText]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${getApiBase()}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(profile => {
        if (!profile) return;
        setSuggestions(buildProfileSuggestions(profile));
        setProfileCtx({
          name: profile.name,
          major: profile.major,
          majors: profile.majors,
          track: profile.cohort,
          career_goal: profile.career_goal,
          school: profile.school,
          graduation_year: profile.graduation_year,
          gpa: profile.gpa,
          final_score: profile.overall_dilly_score,
          scores: {
            smart: profile.overall_smart,
            grit: profile.overall_grit,
            build: profile.overall_build,
          },
          beyond_resume: profile.beyond_resume,
          experience_expansion: profile.experience_expansion,
          deadlines: profile.deadlines,
          application_target: profile.application_target,
          voice_biggest_concern: profile.voice_biggest_concern,
        });
      })
      .catch(() => {});
  }, []);

  // When switching to coach mode, swap in coach suggestions
  useEffect(() => {
    if (isCoachMode) setSuggestions(COACH_SUGGESTIONS);
  }, [isCoachMode]);

  // Ref so buildContext always reads the freshest resumeCoachCtx regardless of closure age
  const resumeCoachCtxRef = useRef(resumeCoachCtx);
  useEffect(() => { resumeCoachCtxRef.current = resumeCoachCtx; }, [resumeCoachCtx]);

  /** Build the full context payload, merging resume coach data when available.
   *  Reads resumeCoachCtx from a ref so it always reflects the latest value,
   *  even when called from a stale streamCall closure via streamCallRef. */
  const buildContext = useCallback((extraTrigger?: string) => {
    const base: Record<string, unknown> = {
      ...profileCtx,
      page: pageCtx,
      platform: 'desktop',
    };
    const coachCtx = resumeCoachCtxRef.current;
    if (coachCtx) {
      base.resume_sections = coachCtx.resumeSections;
    }
    // Always include trigger so the API builds it into the system prompt
    if (extraTrigger) {
      base.resume_coach_trigger = extraTrigger;
      // Ensure resume_sections exists so the API processes the trigger
      if (!base.resume_sections) base.resume_sections = '(no resume loaded)';
    }
    return base;
  }, [profileCtx, pageCtx]);

  /** Core streaming call — shared by user sends and proactive coach triggers */
  const streamCall = useCallback(async (
    text: string,
    historyBase: Message[],
    coachTrigger?: string,
  ) => {
    setLoading(true);
    setStreamingText('');

    const history = historyBase.slice(-10).map(m => ({ role: m.role, content: m.content }));
    const payload = {
      conv_id: convId,
      message: text,
      history,
      context: buildContext(coachTrigger),
    };

    try {
      const res = await fetch(`${getApiBase()}/voice/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload),
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = '';
        let accumulated = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          const lines = accumulated.split('\n');
          accumulated = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const evt = JSON.parse(raw);
              if (typeof evt.t === 'string' && evt.t.length > 0) {
                full += evt.t;
                const highlightMatch = full.match(/HIGHLIGHT:\s*(\{[^}]+\})/i);
                if (highlightMatch) {
                  try { setResumeHighlight(JSON.parse(highlightMatch[1])); } catch { /* ignore */ }
                }
                const forDisplay = full
                  .replace(/HIGHLIGHT:\s*\{[^}]+\}\s*/gi, '')
                  .replace(/GENERATE_RESUME:\s*\{[\s\S]*$/i, '')
                  .replace(/\n\s*SUGGESTIONS:\s*[\s\S]*$/i, '')
                  .trim();
                setStreamingText(forDisplay);
              }
              if (Array.isArray(evt.suggestions)) setSuggestions(evt.suggestions.slice(0, 3));
            } catch { /* ignore malformed lines */ }
          }
        }
        // Detect and fire job import trigger before stripping from display
        const generateMatch = full.match(/GENERATE_RESUME:\s*(\{[\s\S]*?\})\s*(?:$|\n)/);
        if (generateMatch) {
          try {
            const jobData = JSON.parse(generateMatch[1]);
            if (jobData.company && jobData.title) {
              fireJobImport(jobData.company, jobData.title, jobData.description || '');
            }
          } catch { /* ignore malformed token */ }
        }
        const finalText = full
          .replace(/HIGHLIGHT:\s*\{[^}]+\}\s*/gi, '')
          .replace(/GENERATE_RESUME:\s*\{[\s\S]*$/i, generateMatch ? '\n\nI have everything I need — generating your tailored resume now.' : '')
          .replace(/\n\s*SUGGESTIONS:\s*[\s\S]*$/i, '')
          .trim();
        if (finalText) setMessages(prev => [...prev, { role: 'assistant', content: finalText, ts: Date.now() }]);
        setStreamingText('');
      } else {
        const fb = await fetch(`${getApiBase()}/voice/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify(payload),
        });
        const data = fb.ok ? await fb.json() : null;
        setMessages(prev => [...prev, { role: 'assistant', content: data?.reply ?? "Something went wrong.", ts: Date.now() }]);
        if (Array.isArray(data?.suggestions) && data.suggestions.length > 0) setSuggestions(data.suggestions.slice(0, 3));
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Couldn't reach Dilly. Check your connection.", ts: Date.now() }]);
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  }, [convId, buildContext]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text.trim(), ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    await streamCall(text.trim(), [...messages, userMsg]);
  }, [loading, messages, streamCall]);

  // Keep stable refs so the proactive timeout can read the latest values
  // without being cancelled when clearProactiveCoachTrigger() causes a re-render.
  const streamCallRef = useRef(streamCall);
  const messagesRef = useRef(messages);
  const loadingRef = useRef(loading);
  useEffect(() => { streamCallRef.current = streamCall; }, [streamCall]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Proactive coach trigger — fires when the resume editor signals a notable change.
  // No user bubble is added; Dilly speaks first.
  // Dedup by numeric id so identical trigger text still fires on every distinct call.
  const proactiveHandled = useRef<number>(-1);
  useEffect(() => {
    if (!proactiveCoachTrigger) return;
    if (proactiveCoachTrigger.id === proactiveHandled.current) return;
    proactiveHandled.current = proactiveCoachTrigger.id;
    const trigger = proactiveCoachTrigger.text;
    const isExplicit = trigger.includes('User clicked Ask Dilly');
    clearProactiveCoachTrigger();
    // Explicit Ask Dilly clicks start a fresh conversation
    if (isExplicit) {
      setMessages([]);
      setStreamingText('');
      setConvId(`desktop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    }
    const delay = isExplicit ? 150 : 400;
    setTimeout(() => {
      if (isExplicit || !loadingRef.current) {
        streamCallRef.current(trigger, isExplicit ? [] : messagesRef.current, trigger);
      }
    }, delay);
  }, [proactiveCoachTrigger, clearProactiveCoachTrigger]);

  // Inject initial message as an assistant message (AI speaks first, no API call)
  const initialSent = useRef(false);
  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      setMessages([{ role: 'assistant', content: initialMessage, ts: Date.now() }]);
    }
  }, [initialMessage]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const hasMessages = messages.length > 0;

  // When the job import form is active, show it exclusively
  if (showJobImportForm) {
    return <JobImportFlow />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-0)', position: 'relative' }}>
      {/* Conversation History overlay — covers only this panel */}
      {showHistory && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'var(--surface-0)' }}>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading...</p>
            </div>
          }>
            <ConversationHistory onClose={() => setShowHistory(false)} onOpenConversation={openConversation} />
          </Suspense>
        </div>
      )}

      <style>{`
        @keyframes dillyBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes dillyFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dilly-msg  { animation: dillyFadeUp 220ms ease forwards; }
        .dilly-chip { transition: background 140ms ease, border-color 140ms ease; }
        .dilly-chip:hover { background: var(--surface-2) !important; border-color: rgba(201,168,76,0.35) !important; color: var(--text-1) !important; }
        .dilly-md p { margin: 0 0 6px; }
        .dilly-md p:last-child { margin-bottom: 0; }
        .dilly-md strong { font-weight: 700; color: var(--text-1); }
        .dilly-md em { font-style: italic; }
        .dilly-md del { text-decoration: line-through; opacity: 0.6; }
        .dilly-md ul, .dilly-md ol { margin: 4px 0 6px; padding-left: 18px; }
        .dilly-md li { margin-bottom: 3px; }
        .dilly-md code { font-family: monospace; font-size: 11px; background: rgba(59,76,192,0.1); color: #7b8de0; padding: 1px 5px; border-radius: 4px; }
        .dilly-md pre { background: var(--surface-2); border-radius: 6px; padding: 10px 12px; overflow-x: auto; margin: 6px 0; }
        .dilly-md pre code { background: none; color: var(--text-2); padding: 0; font-size: 11px; }
        .dilly-md a { color: #5b8def; text-decoration: underline; }
        .dilly-md h1, .dilly-md h2, .dilly-md h3 { font-weight: 700; margin: 8px 0 4px; color: var(--text-1); }
        .dilly-md h1 { font-size: 15px; }
        .dilly-md h2 { font-size: 14px; }
        .dilly-md h3 { font-size: 13px; }
        .dilly-md blockquote { border-left: 3px solid rgba(59,76,192,0.4); padding-left: 10px; margin: 4px 0; color: var(--text-2); font-style: italic; }
        .dilly-md hr { border: none; border-top: 1px solid var(--border-main); margin: 8px 0; }
      `}</style>

      {/* Empty state */}
      {!hasMessages && (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '44px 24px 24px' }}>
          <span style={{ fontWeight: 800, fontSize: 36, color: '#2B3A8E', letterSpacing: -1.5, lineHeight: 1, marginBottom: 28 }}>dilly</span>

          <div style={{
            width: 100, height: 100, borderRadius: '50%', background: '#0f0f1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
            boxShadow: '0 0 0 1px rgba(201,168,76,0.18), 0 0 24px rgba(201,168,76,0.08)',
          }}>
            <DillyAvatar size={76} />
          </div>

          <p style={{
            fontFamily: 'Playfair Display, serif', fontSize: 17, fontWeight: 300,
            letterSpacing: '-0.02em', color: 'var(--text-1)', textAlign: 'center',
            margin: '0 0 8px', lineHeight: 1.45,
          }}>
            {persona.greeting}
          </p>
          {isCoachMode && resumeCoachCtx?.variantLabel ? (
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.65, margin: 0, maxWidth: 230 }}>
              Working on <strong style={{ color: 'var(--text-2)' }}>{resumeCoachCtx.variantLabel}</strong>. {persona.sub}
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.65, margin: 0, maxWidth: 230 }}>
              {persona.sub}
            </p>
          )}

          <button
            onClick={() => setShowHistory(true)}
            style={{
              marginTop: 18, display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1px solid var(--border-main)',
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
              color: 'var(--text-3)', fontSize: 11, fontWeight: 500,
              transition: 'border-color 140ms ease, color 140ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,76,192,0.35)'; e.currentTarget.style.color = 'var(--text-2)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-main)'; e.currentTarget.style.color = 'var(--text-3)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            View past conversations
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {hasMessages && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, opacity: 0.7 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <DillyAvatar size={14} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: 0.3, flex: 1 }}>
              DILLY · {persona.role}
            </span>
            {isCoachMode && resumeCoachCtx?.variantLabel && (
              <span style={{
                fontSize: 9, fontWeight: 600, letterSpacing: 0.3,
                color: 'rgba(201,168,76,0.9)',
                background: 'rgba(201,168,76,0.1)',
                border: '1px solid rgba(201,168,76,0.25)',
                borderRadius: 4, padding: '1px 6px',
              }}>
                {resumeCoachCtx.variantLabel}
              </span>
            )}
            <button
              onClick={() => setShowHistory(true)}
              title="Conversation history"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                color: 'var(--text-3)', display: 'flex', alignItems: 'center',
                opacity: 0.7, transition: 'opacity 140ms ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </button>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="dilly-msg" style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '86%', padding: '10px 14px',
              borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
              background: m.role === 'user' ? '#2B3A8E' : 'var(--surface-1)',
              border: m.role === 'user' ? 'none' : '1px solid var(--border-main)',
            }}>
              {m.role === 'user' ? (
                <p style={{ fontSize: 13, lineHeight: 1.65, color: '#fff', margin: 0, whiteSpace: 'pre-wrap' }}>{m.content}</p>
              ) : (
                <div className="dilly-md" style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-1)' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {streamingText && (
          <div className="dilly-msg" style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ maxWidth: '86%', padding: '10px 14px', borderRadius: '4px 14px 14px 14px', background: 'var(--surface-1)', border: '1px solid var(--border-main)' }}>
              <div className="dilly-md" style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--text-1)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {loading && !streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '12px 16px', borderRadius: '4px 14px 14px 14px', background: 'var(--surface-1)', border: '1px solid var(--border-main)' }}>
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {/* Suggestion chips */}
      <div style={{ padding: '10px 14px 8px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {suggestions.map((s, i) => (
          <button
            key={i}
            className="dilly-chip"
            onClick={() => send(s)}
            disabled={loading}
            style={{
              textAlign: 'left', fontSize: 12, color: 'var(--text-2)',
              background: 'var(--surface-1)', border: '1px solid var(--border-main)',
              borderRadius: 8, padding: '8px 12px', cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.45 : 1, lineHeight: 1.45, transition: 'none',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: '4px 14px 16px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--surface-1)',
          borderRadius: 12,
          border: `1px solid ${focused ? 'rgba(59,76,192,0.45)' : 'var(--border-main)'}`,
          padding: '9px 9px 9px 14px',
          transition: 'border-color 160ms ease',
          boxShadow: focused ? '0 0 0 3px rgba(59,76,192,0.08)' : 'none',
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={isCoachMode ? "Ask about your resume..." : "Ask Dilly anything..."}
            disabled={loading}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 13, color: 'var(--text-1)', lineHeight: 1.4,
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: input.trim() ? '#2B3A8E' : 'transparent',
              border: input.trim() ? 'none' : '1px solid var(--border-main)',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 160ms ease', opacity: loading ? 0.5 : 1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke={input.trim() ? 'white' : 'var(--text-3)'}
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
