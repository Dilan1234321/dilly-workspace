'use client';
import { useState } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Event {
  date: string;
  title: string;
  type: 'deadline' | 'interview' | 'audit' | 'match';
  company?: string;
}

const DEMO_EVENTS: Event[] = [
  // March 28–31
  { date: '2026-03-28', title: 'Palantir app deadline',         type: 'deadline',  company: 'Palantir' },
  { date: '2026-03-28', title: 'Weekly score audit',            type: 'audit' },
  { date: '2026-03-30', title: 'Stripe phone screen',           type: 'interview', company: 'Stripe' },
  { date: '2026-03-31', title: '8 new job matches',             type: 'match' },
  // April
  { date: '2026-04-01', title: 'Goldman Sachs tech screen',     type: 'interview', company: 'Goldman Sachs' },
  { date: '2026-04-02', title: 'Snowflake app deadline',        type: 'deadline',  company: 'Snowflake' },
  { date: '2026-04-03', title: 'Resume refresh reminder',       type: 'audit' },
  { date: '2026-04-04', title: 'Databricks app deadline',       type: 'deadline',  company: 'Databricks' },
  { date: '2026-04-05', title: 'MongoDB final round',           type: 'interview', company: 'MongoDB' },
  { date: '2026-04-07', title: 'Stripe 2nd round',              type: 'interview', company: 'Stripe' },
  { date: '2026-04-08', title: '15 new job matches',            type: 'match' },
  { date: '2026-04-10', title: 'Goldman Sachs case interview',  type: 'interview', company: 'Goldman Sachs' },
  { date: '2026-04-12', title: 'Twilio onsite interview',       type: 'interview', company: 'Twilio' },
  { date: '2026-04-14', title: 'Weekly score audit',            type: 'audit' },
  { date: '2026-04-15', title: 'Cloudflare app deadline',       type: 'deadline',  company: 'Cloudflare' },
  { date: '2026-04-15', title: 'HubSpot app deadline',          type: 'deadline',  company: 'HubSpot' },
  { date: '2026-04-16', title: 'Figma app deadline',            type: 'deadline',  company: 'Figma' },
  { date: '2026-04-18', title: 'Okta hiring event',             type: 'interview', company: 'Okta' },
  { date: '2026-04-20', title: 'Toast app deadline',            type: 'deadline',  company: 'Toast' },
  { date: '2026-04-21', title: '11 new job matches',            type: 'match' },
  { date: '2026-04-22', title: 'Notion app deadline',           type: 'deadline',  company: 'Notion' },
  { date: '2026-04-23', title: 'Intercom final interview',      type: 'interview', company: 'Intercom' },
  { date: '2026-04-25', title: 'Monthly profile review',        type: 'audit' },
  { date: '2026-04-26', title: 'Dropbox app deadline',          type: 'deadline',  company: 'Dropbox' },
  { date: '2026-04-28', title: 'Figma final round',             type: 'interview', company: 'Figma' },
];

const EVENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  deadline: { bg: 'rgba(255,69,58,0.1)', text: '#FF453A', dot: '#FF453A' },
  interview: { bg: 'rgba(255,159,10,0.1)', text: '#FF9F0A', dot: '#FF9F0A' },
  audit: { bg: 'rgba(201,168,76,0.1)', text: '#C9A84C', dot: '#C9A84C' },
  match: { bg: 'rgba(52,199,89,0.1)', text: '#34C759', dot: '#34C759' },
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const now = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(toDateStr(now));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toDateStr(now);

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const selectedEvents = selectedDate ? DEMO_EVENTS.filter(e => e.date === selectedDate) : [];

  function dateStr(day: number) {
    return toDateStr(new Date(year, month, day));
  }

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1000px] mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 24, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 0.5 }}>Calendar</h1>
          <div className="flex items-center gap-1">
            <span className="flex items-center gap-2 mr-4"><span className="w-2 h-2 rounded-full bg-gap" /><span className="text-[10px] text-txt-3">Deadline</span></span>
            <span className="flex items-center gap-2 mr-4"><span className="w-2 h-2 rounded-full bg-almost" /><span className="text-[10px] text-txt-3">Interview</span></span>
            <span className="flex items-center gap-2 mr-4"><span className="w-2 h-2 rounded-full bg-dilly-gold" /><span className="text-[10px] text-txt-3">Audit</span></span>
            <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-ready" /><span className="text-[10px] text-txt-3">Matches</span></span>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Calendar grid */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-surface-1 hover:bg-surface-2 flex items-center justify-center text-txt-2 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span className="text-[16px] font-semibold text-txt-1">{MONTHS[month]} {year}</span>
              <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-surface-1 hover:bg-surface-2 flex items-center justify-center text-txt-2 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0">
              {DAYS.map(d => (
                <div key={d} className="text-center py-2 text-[11px] font-semibold text-txt-3 uppercase tracking-wider">{d}</div>
              ))}
              {days.map((day, i) => {
                if (day === null) return <div key={i} />;
                const ds = dateStr(day);
                const isToday = ds === today;
                const isSelected = ds === selectedDate;
                const dayEvents = DEMO_EVENTS.filter(e => e.date === ds);
                const hasEvents = dayEvents.length > 0;

                return (
                  <button key={i} onClick={() => setSelectedDate(ds)}
                    className={`relative h-[72px] p-1.5 border border-transparent transition-all duration-100 rounded-lg
                      ${isSelected ? 'bg-dilly-blue/10 border-dilly-blue/30' : 'hover:bg-surface-1'}
                      ${isToday ? 'ring-1 ring-dilly-blue/40' : ''}`}>
                    <span className={`text-[13px] font-medium ${isToday ? 'text-dilly-blue font-bold' : isSelected ? 'text-txt-1' : 'text-txt-2'}`}>
                      {day}
                    </span>
                    {hasEvents && (
                      <div className="flex gap-0.5 mt-1 flex-wrap">
                        {dayEvents.slice(0, 3).map((e, j) => (
                          <div key={j} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: EVENT_COLORS[e.type]?.dot }} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Event sidebar */}
          <div className="w-[280px] flex-shrink-0">
            <p className="text-[11px] font-bold text-txt-3 uppercase tracking-widest mb-3">
              {selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a date'}
            </p>
            {selectedEvents.length === 0 ? (
              <p className="text-[13px] text-txt-3">No events</p>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map((e, i) => {
                  const ec = EVENT_COLORS[e.type] || EVENT_COLORS.audit;
                  return (
                    <div key={i} className="rounded-xl p-3.5 transition-all hover:-translate-y-[1px]"
                      style={{ backgroundColor: ec.bg }}>
                      <p className="text-[13px] font-semibold" style={{ color: ec.text }}>{e.title}</p>
                      {e.company && <p className="text-[11px] mt-0.5" style={{ color: ec.text, opacity: 0.7 }}>{e.company}</p>}
                      <p className="text-[10px] mt-1 uppercase font-bold tracking-wider" style={{ color: ec.text, opacity: 0.5 }}>{e.type}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Upcoming */}
            <p className="text-[11px] font-bold text-txt-3 uppercase tracking-widest mt-6 mb-3">Upcoming</p>
            <div className="space-y-1.5">
              {DEMO_EVENTS.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5).map((e, i) => {
                const ec = EVENT_COLORS[e.type] || EVENT_COLORS.audit;
                const d = new Date(e.date + 'T12:00:00');
                return (
                  <button key={i} onClick={() => setSelectedDate(e.date)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-surface-1 transition-colors text-left">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ec.dot }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-txt-1 truncate">{e.title}</p>
                      <p className="text-[10px] text-txt-3">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}