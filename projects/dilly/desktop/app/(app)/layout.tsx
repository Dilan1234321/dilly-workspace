'use client';
import { createContext, useContext, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { GlobalMenuProvider } from '@/components/layout/GlobalMenu';
import RightPanel from '@/components/layout/RightPanel';
import JobDetail from '@/components/jobs/JobDetail';

interface RightPanelState {
  mode: 'chat' | 'job';
  job: any | null;
}

const RightPanelContext = createContext<{
  state: RightPanelState;
  showJob: (job: any) => void;
  showChat: () => void;
}>({
  state: { mode: 'chat', job: null },
  showJob: () => {},
  showChat: () => {},
});

export function useRightPanel() {
  return useContext(RightPanelContext);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [panelState, setPanelState] = useState<RightPanelState>({ mode: 'chat', job: null });

  const showJob = (job: any) => setPanelState({ mode: 'job', job });
  const showChat = () => setPanelState({ mode: 'chat', job: null });

  const pathname = usePathname();
  const hideRightPanel = pathname === '/scores';

  return (
    <GlobalMenuProvider>
    <RightPanelContext.Provider value={{ state: panelState, showJob, showChat }}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1  flex overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
          {!hideRightPanel && <aside className="w-[380px] flex-shrink-0 h-screen border-l border-border-main bg-surface-1 flex flex-col">
            {panelState.mode === 'job' && panelState.job ? (
              <>
                <div className="h-[40px] flex items-center justify-between px-4 border-b border-border-main">
                  <span className="text-[12px] font-semibold text-txt-2">Job detail</span>
                  <button onClick={showChat} className="text-[11px] text-dilly-blue hover:text-dilly-blue-light transition-colors">
                    Back to chat
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <JobDetail job={panelState.job} />
                </div>
              </>
            ) : (
              <RightPanel />
            )}
          </aside>}
        </main>
      </div>
    </RightPanelContext.Provider>
    </GlobalMenuProvider>
  );
}