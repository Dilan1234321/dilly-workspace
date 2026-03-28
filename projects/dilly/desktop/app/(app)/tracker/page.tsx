'use client';
import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiFetch } from '@/lib/api';
import CompanyLogo from '@/components/jobs/CompanyLogo';

type Status = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected';

interface Application {
  id: string;
  company: string;
  role: string;
  status: Status;
  applied_at?: string;
  deadline?: string;
  job_url?: string;
  notes?: string;
}

const COLUMNS: { key: Status; label: string; color: string; emptyText: string }[] = [
  { key: 'saved', label: 'Saved', color: '#8E8E93', emptyText: 'Save jobs from the feed' },
  { key: 'applied', label: 'Applied', color: '#3B4CC0', emptyText: 'Drag saved jobs here when you apply' },
  { key: 'interviewing', label: 'Interviewing', color: '#FF9F0A', emptyText: 'Move jobs here when you hear back' },
  { key: 'offer', label: 'Offer', color: '#34C759', emptyText: 'The goal' },
  { key: 'rejected', label: 'Rejected', color: '#FF453A', emptyText: 'It happens. Keep going.' },
];

const DEMO_APPS: Application[] = [
  // Saved (6)
  { id: '1',  company: 'Cloudflare',    role: 'Data Analytics Intern',          status: 'saved',        deadline: '2026-04-15' },
  { id: '2',  company: 'Toast',         role: 'Product Analyst Intern',          status: 'saved',        deadline: '2026-04-20' },
  { id: '3',  company: 'Figma',         role: 'Business Analytics Intern',       status: 'saved',        deadline: '2026-04-28' },
  { id: '4',  company: 'HubSpot',       role: 'Marketing Data Analyst Intern',   status: 'saved',        deadline: '2026-05-01' },
  { id: '5',  company: 'Notion',        role: 'Growth Analytics Intern',         status: 'saved' },
  { id: '6',  company: 'Intercom',      role: 'Data Science Intern',             status: 'saved' },
  // Applied (5)
  { id: '7',  company: 'Dropbox',       role: 'People Data Analyst',             status: 'applied',      applied_at: '2026-03-25' },
  { id: '8',  company: 'Okta',          role: 'Data Analyst Intern',             status: 'applied',      applied_at: '2026-03-22' },
  { id: '9',  company: 'Databricks',    role: 'Data Engineering Intern',         status: 'applied',      applied_at: '2026-03-18' },
  { id: '10', company: 'Snowflake',     role: 'Solutions Engineer Intern',       status: 'applied',      applied_at: '2026-03-15' },
  { id: '11', company: 'Palantir',      role: 'Forward Deployed SW Intern',      status: 'applied',      applied_at: '2026-03-12' },
  // Interviewing (3)
  { id: '12', company: 'Stripe',        role: 'Software Engineer Intern',        status: 'interviewing', applied_at: '2026-03-10' },
  { id: '13', company: 'Goldman Sachs', role: 'Summer Analyst — Tech',           status: 'interviewing', applied_at: '2026-03-05' },
  { id: '14', company: 'Twilio',        role: 'Data Analyst Intern',             status: 'interviewing', applied_at: '2026-03-02' },
  // Offer (1)
  { id: '15', company: 'MongoDB',       role: 'Sales Development Rep Intern',    status: 'offer',        applied_at: '2026-02-20' },
  // Rejected (2)
  { id: '16', company: 'Visa',          role: 'AI Center of Excellence Analyst', status: 'rejected',     applied_at: '2026-03-01' },
  { id: '17', company: 'JPMorgan',      role: 'Technology Analyst Intern',       status: 'rejected',     applied_at: '2026-02-28' },
];

export default function TrackerPage() {
  const [apps, setApps] = useState<Application[]>(DEMO_APPS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; app: Application } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart(event: any) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event: any) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const overId = over.id as string;
    const activeApp = apps.find(a => a.id === active.id);
    if (!activeApp) return;

    // Check if dropped on a column
    const targetColumn = COLUMNS.find(c => c.key === overId);
    if (targetColumn) {
      setApps(prev => prev.map(a =>
        a.id === active.id ? { ...a, status: targetColumn.key } : a
      ));
      return;
    }

    // Dropped on another card - move to that card's column
    const targetApp = apps.find(a => a.id === overId);
    if (targetApp && targetApp.status !== activeApp.status) {
      setApps(prev => prev.map(a =>
        a.id === active.id ? { ...a, status: targetApp.status } : a
      ));
    }
  }

  const activeApp = apps.find(a => a.id === activeId);

  // Stats
  const total = apps.length;
  const applied = apps.filter(a => a.status !== 'saved').length;
  const interviewing = apps.filter(a => a.status === 'interviewing').length;
  const offers = apps.filter(a => a.status === 'offer').length;
  const responseRate = applied > 0 ? Math.round((interviewing + offers) / applied * 100) : 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header + Stats */}
      <div className="px-6 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 24, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 0.5 }}>Application tracker</h1>
            <p className="text-[13px] text-txt-3 mt-1">Drag cards between columns to update status</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total" value={total} color="#f5f5f7" />
          <StatCard label="Applied" value={applied} color="#3B4CC0" />
          <StatCard label="Response rate" value={responseRate + '%'} color="#FF9F0A" />
          <StatCard label="Offers" value={offers} color="#34C759" />
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto px-4 pb-4">
        <DndContext sensors={sensors} collisionDetection={closestCorners}
          onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 h-full min-w-max">
            {COLUMNS.map(col => {
              const colApps = apps.filter(a => a.status === col.key);
              return (
                <Column key={col.key} col={col} apps={colApps}
                  onContext={(e, app) => setCtxMenu({ x: e.clientX, y: e.clientY, app })} />
              );
            })}
          </div>

          <DragOverlay>
            {activeApp && <AppCard app={activeApp} isDragging />}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} app={ctxMenu.app}
          onClose={() => setCtxMenu(null)}
          onMove={(status) => {
            setApps(prev => prev.map(a => a.id === ctxMenu.app.id ? { ...a, status } : a));
            setCtxMenu(null);
          }}
          onDelete={() => {
            setApps(prev => prev.filter(a => a.id !== ctxMenu.app.id));
            setCtxMenu(null);
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-surface-1 rounded-xl p-3.5">
      <p className="text-[10px] text-txt-3 font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-[24px] font-bold font-mono mt-0.5" style={{ color }}>{value}</p>
    </div>
  );
}

function Column({ col, apps, onContext }: {
  col: typeof COLUMNS[number]; apps: Application[];
  onContext: (e: React.MouseEvent, app: Application) => void;
}) {
  const { setNodeRef } = useSortable({ id: col.key });

  return (
    <div ref={setNodeRef}
      className="w-[240px] flex-shrink-0 flex flex-col bg-surface-1 rounded-xl overflow-hidden">
      {/* Column header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border-main">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
          <span className="text-[13px] font-semibold text-txt-1">{col.label}</span>
        </div>
        <span className="text-[11px] font-mono text-txt-3 bg-surface-2 px-2 py-0.5 rounded-md">{apps.length}</span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        <SortableContext items={apps.map(a => a.id)} strategy={verticalListSortingStrategy}>
          {apps.length === 0 ? (
            <div className="flex items-center justify-center h-[80px] text-[11px] text-txt-3 text-center px-4">
              {col.emptyText}
            </div>
          ) : (
            apps.map(app => (
              <SortableAppCard key={app.id} app={app} onContext={onContext} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableAppCard({ app, onContext }: { app: Application; onContext: (e: React.MouseEvent, app: Application) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <AppCard app={app} onContext={onContext} />
    </div>
  );
}

function AppCard({ app, isDragging, onContext }: { app: Application; isDragging?: boolean; onContext?: (e: React.MouseEvent, app: Application) => void }) {
  const daysAgo = app.applied_at ? Math.floor((Date.now() - new Date(app.applied_at).getTime()) / 86400000) : null;
  const deadlineDays = app.deadline ? Math.floor((new Date(app.deadline).getTime() - Date.now()) / 86400000) : null;

  return (
    <div
      onContextMenu={(e) => { e.preventDefault(); onContext?.(e, app); }}
      className={`bg-surface-2 rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all duration-150
        hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)]
        ${isDragging ? 'shadow-[0_8px_30px_rgba(59,76,192,0.2)] scale-105 rotate-1' : ''}`}>
      <div className="flex items-center gap-2.5 mb-2">
        <CompanyLogo company={app.company} size={24} />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-txt-1 truncate">{app.role}</p>
          <p className="text-[10px] text-txt-2 truncate">{app.company}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {daysAgo !== null && (
          <span className="text-[9px] text-txt-3">{daysAgo}d ago</span>
        )}
        {deadlineDays !== null && (
          <span className={`text-[9px] font-semibold ${deadlineDays <= 3 ? 'text-gap' : deadlineDays <= 7 ? 'text-almost' : 'text-txt-3'}`}>
            {deadlineDays <= 0 ? 'Past due' : deadlineDays + 'd left'}
          </span>
        )}
      </div>
    </div>
  );
}

function CtxMenu({ x, y, app, onClose, onMove, onDelete }: {
  x: number; y: number; app: Application;
  onClose: () => void; onMove: (s: Status) => void; onDelete: () => void;
}) {
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 250);

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={e => e.preventDefault()}>
      <div className="absolute bg-surface-1 border border-border-main rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] py-1.5 min-w-[180px]"
        style={{ left: adjustedX, top: adjustedY, animation: 'ctxIn 120ms ease-out' }}
        onClick={e => e.stopPropagation()}>
        <p className="px-3 py-1.5 text-[11px] text-txt-3 font-semibold truncate">{app.role}</p>
        <div className="h-px bg-border-main mx-2 my-1" />
        <p className="px-3 py-1 text-[10px] text-txt-3 font-semibold uppercase tracking-wider">Move to</p>
        {COLUMNS.filter(c => c.key !== app.status).map(c => (
          <button key={c.key} onClick={() => onMove(c.key)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-dilly-blue/10 transition-colors group">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
            <span className="text-[12px] text-txt-1 group-hover:text-dilly-blue transition-colors">{c.label}</span>
          </button>
        ))}
        <div className="h-px bg-border-main mx-2 my-1" />
        {app.job_url && (
          <button onClick={() => { window.open(app.job_url, '_blank'); onClose(); }}
            className="w-full px-3 py-2 text-left text-[12px] text-txt-2 hover:bg-dilly-blue/10 hover:text-dilly-blue transition-colors">
            Open listing
          </button>
        )}
        <button onClick={onDelete}
          className="w-full px-3 py-2 text-left text-[12px] text-gap hover:bg-gap/10 transition-colors">
          Remove
        </button>
      </div>
      <style>{`@keyframes ctxIn { from { opacity:0; transform:scale(0.95) translateY(-4px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
    </div>
  );
}