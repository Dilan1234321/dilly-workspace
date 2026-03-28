'use client';
import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface MenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  color?: string;
  divider?: boolean;
  action: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

const GlobalMenuContext = createContext<{
  showMenu: (x: number, y: number, items: MenuItem[]) => void;
  closeMenu: () => void;
}>({ showMenu: () => {}, closeMenu: () => {} });

export function useGlobalMenu() {
  return useContext(GlobalMenuContext);
}

export function GlobalMenuProvider({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdSearch, setCmdSearch] = useState('');
  const router = useRouter();
  const pathname = usePathname();

  const showMenu = useCallback((x: number, y: number, items: MenuItem[]) => {
    setMenu({ x, y, items });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // Global right-click handler
  useEffect(() => {
    function handleContext(e: MouseEvent) {
      // Check if a component already handled this
      if ((e as any)._dillyHandled) return;
      e.preventDefault();

      const pageName = pathname?.split('/').pop() || 'home';
      const defaultItems: MenuItem[] = [
        { label: '__dilly_logo__', icon: '', action: () => {} },
        { divider: true, label: '', action: () => {} },
        { label: 'Command palette', icon: 'cmd', shortcut: '\u2318K', action: () => setCmdOpen(true) },
        { divider: true, label: '', action: () => {} },
        { label: 'Home', icon: 'home', action: () => router.push('/home') },
        { label: 'Jobs', icon: 'briefcase', action: () => router.push('/jobs') },
        { label: 'Tracker', icon: 'kanban', action: () => router.push('/tracker') },
        { label: 'Scores', icon: 'chart', action: () => router.push('/scores') },
        { label: 'Calendar', icon: 'calendar', action: () => router.push('/calendar') },
        { divider: true, label: '', action: () => {} },
        { label: 'Toggle theme', icon: 'moon', action: () => document.documentElement.classList.toggle('dark') },
        { label: 'Shortcuts', icon: 'keyboard', action: () => setCmdOpen(true) },
      ];

      setMenu({ x: e.clientX, y: e.clientY, items: defaultItems });
    }

    // Cmd+K handler
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setCmdOpen(false);
        setMenu(null);
      }
    }

    window.addEventListener('contextmenu', handleContext);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('contextmenu', handleContext);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pathname, router]);

  // Command palette items
  const commands = [
    { label: 'Go to Home', section: 'Navigation', icon: 'home', action: () => { router.push('/home'); setCmdOpen(false); } },
    { label: 'Go to Jobs', section: 'Navigation', icon: 'briefcase', action: () => { router.push('/jobs'); setCmdOpen(false); } },
    { label: 'Go to Tracker', section: 'Navigation', icon: 'kanban', action: () => { router.push('/tracker'); setCmdOpen(false); } },
    { label: 'Go to Scores', section: 'Navigation', icon: 'chart', action: () => { router.push('/scores'); setCmdOpen(false); } },
    { label: 'Go to Calendar', section: 'Navigation', icon: 'calendar', action: () => { router.push('/calendar'); setCmdOpen(false); } },
    { label: 'Go to Leaderboard', section: 'Navigation', icon: 'trophy', action: () => { router.push('/leaderboard'); setCmdOpen(false); } },
    { label: 'Go to Settings', section: 'Navigation', icon: 'settings', action: () => { router.push('/settings'); setCmdOpen(false); } },
    { label: 'Toggle dark/light mode', section: 'Actions', icon: 'moon', action: () => { document.documentElement.classList.toggle('dark'); setCmdOpen(false); } },
    { label: 'Upload new resume', section: 'Actions', icon: 'file', action: () => { setCmdOpen(false); } },
    { label: 'Run new audit', section: 'Actions', icon: 'zap', action: () => { setCmdOpen(false); } },
    { label: 'Search jobs', section: 'Actions', icon: 'search', action: () => { router.push('/jobs'); setCmdOpen(false); } },
    { label: 'Ask Dilly', section: 'Actions', icon: 'chat', action: () => { setCmdOpen(false); } },
  ];

  const filteredCmds = cmdSearch
    ? commands.filter(c => c.label.toLowerCase().includes(cmdSearch.toLowerCase()))
    : commands;

  const sections = [...new Set(filteredCmds.map(c => c.section))];

  return (
    <GlobalMenuContext.Provider value={{ showMenu, closeMenu }}>
      {children}

      {/* Context menu */}
      {menu && <ContextMenuUI menu={menu} onClose={closeMenu} />}

      {/* Command palette */}
      {cmdOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]"
          onClick={() => setCmdOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-[560px] bg-surface-1 border border-border-main rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'cmdIn 150ms ease-out' }}>
            {/* Search */}
            <div className="flex items-center gap-3 px-5 h-[52px] border-b border-border-main">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-txt-3 flex-shrink-0">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                autoFocus
                type="text"
                value={cmdSearch}
                onChange={e => setCmdSearch(e.target.value)}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent text-[15px] text-txt-1 placeholder:text-txt-3 outline-none"
              />
              <span className="text-[10px] text-txt-3 bg-surface-2 px-2 py-0.5 rounded font-mono">ESC</span>
            </div>

            {/* Results */}
            <div className="max-h-[360px] overflow-y-auto py-2">
              {filteredCmds.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-[13px] text-txt-3">No commands found</p>
                </div>
              ) : (
                sections.map(section => (
                  <div key={section}>
                    <p className="px-5 pt-3 pb-1.5 text-[10px] font-bold text-txt-3 uppercase tracking-widest">{section}</p>
                    {filteredCmds.filter(c => c.section === section).map((cmd, i) => (
                      <button key={i} onClick={cmd.action}
                        className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-dilly-blue/10 transition-colors group">
                        <CtxIcon name={cmd.icon} />
                        <span className="text-[13px] text-txt-1 font-medium group-hover:text-dilly-blue transition-colors">{cmd.label}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-5 py-2.5 border-t border-border-main text-[10px] text-txt-3">
              <span><span className="font-mono bg-surface-2 px-1.5 py-0.5 rounded">↑↓</span> navigate</span>
              <span><span className="font-mono bg-surface-2 px-1.5 py-0.5 rounded">↵</span> select</span>
              <span><span className="font-mono bg-surface-2 px-1.5 py-0.5 rounded">esc</span> close</span>
            </div>
          </div>
          <style>{`@keyframes cmdIn { from { opacity:0; transform:scale(0.96) translateY(-8px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
        </div>
      )}
    </GlobalMenuContext.Provider>
  );
}

function CtxIcon({ name }: { name: string }) {
  const s = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const icons: Record<string, JSX.Element> = {
    cmd: <svg {...s}><path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z"/></svg>,
    home: <svg {...s}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V13h6v8"/></svg>,
    briefcase: <svg {...s}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>,
    kanban: <svg {...s}><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="7" rx="1"/></svg>,
    chart: <svg {...s}><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
    calendar: <svg {...s}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
    moon: <svg {...s}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
    keyboard: <svg {...s}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 16h8"/></svg>,
    trophy: <svg {...s}><path d="M6 9H4.5a2.5 2.5 0 010-5H6m12 5h1.5a2.5 2.5 0 000-5H18M18 2H6v7a6 6 0 1012 0V2zM4 22h16"/></svg>,
    settings: <svg {...s}><circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/></svg>,
    file: <svg {...s}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
    zap: <svg {...s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    search: <svg {...s}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
    chat: <svg {...s}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  };
  return <span style={{ opacity: 0.4, display: 'flex', alignItems: 'center' }}>{icons[name] || null}</span>;
}

function ContextMenuUI({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const adjustedX = Math.min(menu.x, window.innerWidth - 220);
  const adjustedY = Math.min(menu.y, window.innerHeight - menu.items.length * 36 - 20);

  return (
    <div className="fixed inset-0 z-[150]" onContextMenu={e => e.preventDefault()}>
      <div ref={ref}
        className="absolute bg-surface-1 border border-border-main rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] py-1.5 min-w-[200px] backdrop-blur-xl overflow-hidden"
        style={{ left: adjustedX, top: adjustedY, animation: 'ctxIn 120ms ease-out' }}>
        {menu.items.map((item, i) => (
          item.divider ? (
            <div key={i} style={{ height: 1, background: 'var(--border-main)', margin: '4px 10px' }} />
          ) : item.label === '__dilly_logo__' ? (
            <div key={i} style={{ padding: '8px 14px 4px' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#3B4CC0', letterSpacing: -0.3 }}>dilly</span>
            </div>
          ) : (
            <button key={i} onClick={() => { item.action(); onClose(); }}
              className="ctx-item"
              style={{
                width: 'calc(100% - 8px)', display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                textAlign: 'left', borderRadius: 4, margin: '0 4px', transition: 'background 100ms ease',
              }}>
              <span className="ctx-icon" style={{ opacity: 0.4, transition: 'opacity 100ms ease', display: 'flex', alignItems: 'center' }}><CtxIcon name={item.icon || ''} /></span>
              <span className="ctx-label" style={{ fontSize: 13, fontWeight: 500, flex: 1, color: 'var(--text-1)', transition: 'color 100ms ease' }}>
                {item.label}
              </span>
              {item.shortcut && <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 3 }}>{item.shortcut}</span>}
            </button>
          )
        ))}
      </div>
      <style>{`@keyframes ctxIn { from { opacity:0; transform:scale(0.95) translateY(-4px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
    </div>
  );
}