'use client';
import { createContext, useContext, useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { GlobalMenuProvider } from '@/components/layout/GlobalMenu';
import RightPanel from '@/components/layout/RightPanel';
import JobDetail from '@/components/jobs/JobDetail';

import { getToken } from '@/lib/auth';
import { CustomCursor } from '@/components/layout/CustomCursor';

interface RightPanelState {
  mode: 'chat' | 'job';
  job: any | null;
  chatInitialMessage?: string;
}

// Extra context the resume editor pushes into the chat panel so Dilly can coach in real-time.
export interface ResumeCoachCtx {
  resumeSections: string;   // serialized plain-text summary of current resume sections
  variantLabel: string;     // e.g. "Goldman Sachs / Finance"
  cohort: string;           // e.g. "Finance"
}

// A highlight that RightPanel sets after parsing the AI response — resume editor reads it.
export interface ResumeHighlight {
  type: 'experience' | 'project';
  entryId: string;
  bulletIndex: number;
}

const RightPanelContext = createContext<{
  state: RightPanelState;
  showJob: (job: any) => void;
  showChat: (initialMessage?: string) => void;
  resumeCoachCtx: ResumeCoachCtx | null;
  setResumeCoachCtx: (ctx: ResumeCoachCtx | null) => void;
  fireProactiveCoach: (trigger: string) => void;
  proactiveCoachTrigger: { text: string; id: number } | null;
  clearProactiveCoachTrigger: () => void;
  resumeHighlight: ResumeHighlight | null;
  setResumeHighlight: (h: ResumeHighlight | null) => void;
  jobImportTrigger: { company: string; title: string; description: string; id: number } | null;
  fireJobImport: (company: string, title: string, description: string) => void;
  clearJobImportTrigger: () => void;
  showJobImportForm: boolean;
  startJobImport: () => void;
  endJobImport: () => void;
  panelOpen: boolean;
  togglePanel: () => void;
}>({
  state: { mode: 'chat', job: null },
  showJob: () => {},
  showChat: () => {},
  resumeCoachCtx: null,
  setResumeCoachCtx: () => {},
  fireProactiveCoach: () => {},
  proactiveCoachTrigger: null,
  clearProactiveCoachTrigger: () => {},
  resumeHighlight: null,
  setResumeHighlight: () => {},
  jobImportTrigger: null,
  fireJobImport: () => {},
  clearJobImportTrigger: () => {},
  showJobImportForm: false,
  startJobImport: () => {},
  endJobImport: () => {},
  panelOpen: true,
  togglePanel: () => {},
});

export function useRightPanel() {
  return useContext(RightPanelContext);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [panelState, setPanelState] = useState<RightPanelState>({ mode: 'chat', job: null });
  const [resumeCoachCtx, setResumeCoachCtx] = useState<ResumeCoachCtx | null>(null);
  const [resumeHighlight, setResumeHighlight] = useState<ResumeHighlight | null>(null);
  // A trigger object causes RightPanel to auto-fire a coach message. The numeric id ensures
  // every call is treated as a new event — even if the trigger text is identical.
  const [proactiveCoachTrigger, setProactiveCoachTrigger] = useState<{ text: string; id: number } | null>(null);
  const [jobImportTrigger, setJobImportTrigger] = useState<{ company: string; title: string; description: string; id: number } | null>(null);
  const [showJobImportForm, setShowJobImportForm] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const triggerIdRef = useRef(0);

  // Auth gate: useLayoutEffect runs before paint — no loading flash, no hydration mismatch
  useLayoutEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/onboarding');
    } else {
      setAuthChecked(true);
    }
  }, [router]);

  // Clear coach context and highlights when navigating away from resume editor
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname?.includes('resume-editor')) {
      setResumeCoachCtx(null);
      setResumeHighlight(null);
    }
    // Clear job detail panel when navigating away from jobs or resume editor
    if (!pathname?.includes('/jobs') && !pathname?.includes('resume-editor')) {
      setPanelState(prev => prev.mode === 'job' ? { mode: 'chat', job: null } : prev);
    }
  }, [pathname]);

  const showJob = (job: any) => setPanelState({ mode: 'job', job });
  const showChat = (initialMessage?: string) => setPanelState({ mode: 'chat', job: null, chatInitialMessage: initialMessage });

  const fireProactiveCoach = useCallback((trigger: string) => {
    // Increment id so React always sees a new object — identical trigger text still fires
    setProactiveCoachTrigger({ text: trigger, id: ++triggerIdRef.current });
  }, []);

  const clearProactiveCoachTrigger = useCallback(() => {
    setProactiveCoachTrigger(null);
  }, []);

  const fireJobImport = useCallback((company: string, title: string, description: string) => {
    setJobImportTrigger({ company, title, description, id: ++triggerIdRef.current });
  }, []);

  const clearJobImportTrigger = useCallback(() => {
    setJobImportTrigger(null);
  }, []);

  const startJobImport = useCallback(() => {
    setPanelState({ mode: 'chat', job: null });
    setShowJobImportForm(true);
  }, []);

  const endJobImport = useCallback(() => {
    setShowJobImportForm(false);
  }, []);

  const togglePanel = useCallback(() => setPanelOpen(p => !p), []);

  const hideRightPanel = pathname === '/scores';

  // Don't render app shell until auth is confirmed
  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--surface-0)' }}>
        <div className="text-center">
          <p style={{ fontFamily: 'Cinzel, serif', fontSize: 20, fontWeight: 700, color: '#2B3A8E', letterSpacing: -0.5 }}>dilly</p>
        </div>
      </div>
    );
  }

  return (
    <GlobalMenuProvider>
    <RightPanelContext.Provider value={{
      state: panelState,
      showJob,
      showChat,
      resumeCoachCtx,
      setResumeCoachCtx,
      fireProactiveCoach,
      proactiveCoachTrigger,
      clearProactiveCoachTrigger,
      resumeHighlight,
      setResumeHighlight,
      jobImportTrigger,
      fireJobImport,
      clearJobImportTrigger,
      showJobImportForm,
      startJobImport,
      endJobImport,
      panelOpen,
      togglePanel,
    }}>
      <CustomCursor />
      <div className="dilly-app-shell flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1  flex overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <PageTransition pathname={pathname}>{children}</PageTransition>
          </div>
          {/* Right panel — Job Detail + AI Chat, toggled open/closed */}
          {!hideRightPanel && panelOpen && (
            <>
              {/* Job Detail panel — slides in left of chat when a job is selected */}
              {panelState.mode === 'job' && panelState.job && (
                <aside className="flex-shrink-0 h-screen border-l border-border-main bg-surface-1 flex flex-col page-enter"
                  style={{ width: 360 }}>
                  <div className="h-[40px] flex items-center justify-between px-4 border-b border-border-main">
                    <span className="text-[11px] font-semibold text-txt-2">Job Details</span>
                    <button onClick={() => showChat()} className="text-[11px] font-medium text-[#5B8DEF] hover:text-[#7AA5FF] transition-colors">
                      Close ×
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <JobDetail job={panelState.job} />
                  </div>
                </aside>
              )}

              {/* AI Chat panel */}
              <aside className="flex-shrink-0 h-screen border-l border-border-main bg-surface-1 flex flex-col"
                style={{ width: 340, position: 'relative' }}>
                {/* Dismiss button */}
                <button
                  onClick={togglePanel}
                  title="Collapse Dilly"
                  style={{
                    position: 'absolute', top: 10, right: 10, zIndex: 10,
                    width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border-main)',
                    background: 'var(--surface-2)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-3)', transition: 'all 140ms ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,76,192,0.35)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-main)'; e.currentTarget.style.color = 'var(--text-3)'; }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
                <RightPanel initialMessage={typeof panelState.chatInitialMessage === 'string' ? panelState.chatInitialMessage : undefined} />
              </aside>
            </>
          )}

          {/* FAB — shown when panel is dismissed */}
          {!hideRightPanel && !panelOpen && (
            <button
              onClick={togglePanel}
              title="Open Dilly"
              style={{
                position: 'fixed', bottom: 24, right: 24, zIndex: 200,
                width: 52, height: 52, borderRadius: '50%',
                background: '#2B3A8E', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(59,76,192,0.45)',
                transition: 'transform 160ms ease, box-shadow 160ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(59,76,192,0.6)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(59,76,192,0.45)'; }}
            >
              {/* Chat bubble icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              {/* "dilly" label */}
              <span style={{
                position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)',
                fontSize: 9, fontWeight: 800, color: '#2B3A8E', letterSpacing: -0.3,
                fontFamily: 'Cinzel, serif', whiteSpace: 'nowrap',
              }}>dilly</span>
            </button>
          )}
        </main>
      </div>
    </RightPanelContext.Provider>
    </GlobalMenuProvider>
  );
}

/* ── Page Transition ───────────────────────────────── */
function PageTransition({ pathname, children }: { pathname: string | null; children: React.ReactNode }) {
  const [displayChildren, setDisplayChildren] = useState(children);
  const [phase, setPhase] = useState<'enter' | 'exit'>('enter');
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (pathname !== prevPath.current) {
      // Route changed — exit old, then enter new
      setPhase('exit');
      const t = setTimeout(() => {
        setDisplayChildren(children);
        setPhase('enter');
        prevPath.current = pathname;
      }, 150); // exit duration
      return () => clearTimeout(t);
    } else {
      // Same route, just update children (data changes)
      setDisplayChildren(children);
    }
  }, [pathname, children]);

  return (
    <div
      className={phase === 'enter' ? 'page-enter' : 'page-exit'}
      style={{ minHeight: '100%' }}
    >
      {displayChildren}
    </div>
  );
}
