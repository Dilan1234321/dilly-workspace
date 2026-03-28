'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { href: '/home', label: 'Home', d: 'M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z M9 21V13h6v8' },
  { href: '/jobs', label: 'Jobs', d: 'M2 7.5A2.5 2.5 0 014.5 5h15A2.5 2.5 0 0122 7.5v9a2.5 2.5 0 01-2.5 2.5h-15A2.5 2.5 0 012 16.5v-9z M16 5V3.5A1.5 1.5 0 0014.5 2h-5A1.5 1.5 0 008 3.5V5' },
  { href: '/tracker', label: 'Tracker', d: 'M3 3h5v18H3V3zm7 0h5v12h-5V3zm7 0h5v7h-5V3z' },
  { href: '/scores', label: 'Scores', d: 'M18 20V10M12 20V4M6 20v-6' },
  { href: '/calendar', label: 'Calendar', d: 'M3 6a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6z M16 2v4M8 2v4M3 10h18' },
  { href: '/leaderboard', label: 'Board', d: 'M6 9H4.5a2.5 2.5 0 010-5H6m12 5h1.5a2.5 2.5 0 000-5H18M18 2H6v7a6 6 0 1012 0V2zM4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22m7-7.34V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22' },
];

const BOTTOM = [
  { href: '/academy', label: 'Academy', d: 'M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z' },
  { href: '/settings', label: 'Settings', d: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z M12 15a3 3 0 100-6 3 3 0 000 6z' },
];

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
            color: '#3B4CC0', letterSpacing: -0.5,
            transition: 'font-size 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}>dilly</span>
        </div>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 10px 0' }}>
        {NAV.map(item => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
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
                  borderRadius: '0 2px 2px 0', background: '#3B4CC0',
                }} />
              )}
              <div style={{ width: 36, minWidth: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke={active ? '#3B4CC0' : 'var(--text-3)'}
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.d} />
                </svg>
              </div>
              <span style={{
                fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? '#3B4CC0' : 'var(--text-2)',
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
        })}
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
                  stroke={active ? '#3B4CC0' : 'var(--text-3)'}
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.d} />
                </svg>
              </div>
              <span style={{
                fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? '#3B4CC0' : 'var(--text-3)',
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