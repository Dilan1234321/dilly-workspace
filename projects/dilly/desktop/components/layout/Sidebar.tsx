'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { href: '/home', label: 'Career Center', d: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 2 3 4 6 4s6-2 6-4v-5M2 10v5' },
  { href: '/jobs', label: 'Jobs', d: 'M2 7.5A2.5 2.5 0 014.5 5h15A2.5 2.5 0 0122 7.5v9a2.5 2.5 0 01-2.5 2.5h-15A2.5 2.5 0 012 16.5v-9z M16 5V3.5A1.5 1.5 0 0014.5 2h-5A1.5 1.5 0 008 3.5V5' },
  { href: '/tracker', label: 'Tracker', d: 'M3 3h5v18H3V3zm7 0h5v12h-5V3zm7 0h5v7h-5V3z' },
  { href: '/outcomes', label: 'Outcomes', d: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { href: '/scores', label: 'Scores', d: 'M18 20V10M12 20V4M6 20v-6' },
  { href: '/leaderboard', label: 'Board', d: 'M6 9H4.5a2.5 2.5 0 010-5H6m12 5h1.5a2.5 2.5 0 000-5H18M18 2H6v7a6 6 0 1012 0V2zM4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22m7-7.34V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22' },
];

const NAV_TOOLS = [
  { href: '/resume-editor', label: 'Resume Editor', d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
  { href: '/ats', label: 'ATS Scan', d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 14l2 2 4-4' },
  { href: '/audit', label: 'Audit', d: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z' },
  { href: '/calendar', label: 'Calendar', d: 'M3 6a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6z M16 2v4M8 2v4M3 10h18' },
];

const BOTTOM = [
  { href: '/profile', label: 'My Profile', d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4a3 3 0 110 6 3 3 0 010-6zm0 14a8 8 0 01-6.36-3.12C6.96 14.56 10.48 13.5 12 13.5s5.04 1.06 6.36 3.38A8 8 0 0112 20z' },
  { href: '/academy', label: 'Academy', d: 'M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z' },
  { href: '/settings', label: 'Settings', d: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z M12 15a3 3 0 100-6 3 3 0 000 6z' },
];

function NavItem({ item, active, expanded }: { item: { href: string; label: string; d: string }; active: boolean; expanded: boolean }) {
  return (
    <Link href={item.href}
      style={{
        height: 36, borderRadius: 4, display: 'flex', alignItems: 'center',
        overflow: 'hidden', position: 'relative', textDecoration: 'none',
        transition: 'background 200ms ease',
        background: active ? 'rgba(59,76,192,0.08)' : 'transparent',
      }}
    >
      {active && (
        <div style={{
          position: 'absolute', left: 0, top: 6, bottom: 6, width: 2,
          borderRadius: '0 2px 2px 0', background: '#2B3A8E',
        }} />
      )}
      <div style={{ width: 36, minWidth: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={active ? '#2B3A8E' : 'var(--text-3)'}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={item.d} />
        </svg>
      </div>
      <span style={{
        fontSize: 13, fontWeight: active ? 600 : 400,
        color: active ? '#2B3A8E' : 'var(--text-2)',
        whiteSpace: 'nowrap',
        opacity: expanded ? 1 : 0,
        transform: expanded ? 'translateX(0)' : 'translateX(-4px)',
        transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        transitionDelay: expanded ? '50ms' : '0ms',
      }}>
        {item.label}
      </span>
    </Link>
  );
}

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        width: expanded ? 200 : 56,
        transition: 'width 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        background: 'var(--surface-0)',
        borderRight: '1px solid var(--border-main)',
        flexShrink: 0,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', overflow: 'hidden', padding: '0 10px' }}>
        <div style={{
          height: 36, display: 'flex', alignItems: 'center',
          paddingLeft: expanded ? 12 : 0,
          justifyContent: expanded ? 'flex-start' : 'center',
          width: '100%',
          transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <span style={{
            fontWeight: 800, fontSize: expanded ? 20 : 16,
            color: '#2B3A8E', letterSpacing: -0.5,
            transition: 'font-size 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}>dilly</span>
        </div>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 10px 0' }}>
        {NAV.map(item => <NavItem key={item.href} item={item} active={!!pathname?.startsWith(item.href)} expanded={expanded} />)}

        {/* Resume editor — separated with whitespace */}
        <div style={{ marginTop: 32 }}>
          {NAV_TOOLS.map(item => <NavItem key={item.href} item={item} active={!!pathname?.startsWith(item.href)} expanded={expanded} />)}
        </div>
      </nav>

      {/* Bottom nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px 12px', borderTop: '1px solid var(--border-main)', paddingTop: 8, marginTop: 4 }}>
        <button
          onClick={() => {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('dilly_theme', isDark ? 'dark' : 'light');
          }}
          className='sidebar-item' style={{ height: 36, borderRadius: 4, display: 'flex', alignItems: 'center', overflow: 'hidden', background: 'none', border: 'none', cursor: 'pointer', width: '100%', transition: 'background 200ms ease' }}

        >
          <div style={{ width: 36, minWidth: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
            </svg>
          </div>
          <span style={{
            fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap',
            opacity: expanded ? 1 : 0, transition: 'opacity 200ms ease', transitionDelay: expanded ? '50ms' : '0ms',
          }}>Theme</span>
        </button>

        {BOTTOM.map(item => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              style={{
                height: 36, borderRadius: 4, display: 'flex', alignItems: 'center',
                overflow: 'hidden', textDecoration: 'none',
                transition: 'background 200ms ease',
                background: active ? 'rgba(59,76,192,0.08)' : 'transparent',
              }}

            >
              <div style={{ width: 36, minWidth: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke={active ? '#2B3A8E' : 'var(--text-3)'}
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.d} />
                </svg>
              </div>
              <span style={{
                fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? '#2B3A8E' : 'var(--text-3)',
                whiteSpace: 'nowrap',
                opacity: expanded ? 1 : 0, transition: 'all 200ms ease', transitionDelay: expanded ? '50ms' : '0ms',
              }}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}