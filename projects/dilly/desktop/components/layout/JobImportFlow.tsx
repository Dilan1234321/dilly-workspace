'use client';

import { useState, useRef, useEffect } from 'react';
import DillyAvatar from './DillyAvatar';
import { useRightPanel } from '@/app/(app)/layout';

const STEPS = [
  {
    id: 'company',
    question: "What company is the role at?",
    hint: 'e.g. Goldman Sachs, Google, a startup...',
    type: 'text' as const,
  },
  {
    id: 'title',
    question: "What's the job title?",
    hint: 'e.g. Software Engineering Intern, Data Analyst...',
    type: 'text' as const,
  },
  {
    id: 'description',
    question: "Paste the job description if you have it.",
    hint: "The more detail you give me, the better I can tailor your resume. You can also just describe the role if you don't have the full JD.",
    type: 'textarea' as const,
    optional: true,
    skipLabel: "I don't have one — generate anyway",
  },
];

export default function JobImportFlow() {
  const { endJobImport, fireJobImport } = useRightPanel();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ company: '', title: '', description: '' });
  const [animating, setAnimating] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const currentStep = STEPS[step];
  const value = values[currentStep.id as keyof typeof values];
  const isLast = step === STEPS.length - 1;

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [step]);

  function advance(skipDescription = false) {
    if (isLast || skipDescription) {
      fireJobImport(values.company.trim(), values.title.trim(), skipDescription ? '' : values.description.trim());
      endJobImport();
      return;
    }
    setAnimating(true);
    setTimeout(() => {
      setStep(s => s + 1);
      setAnimating(false);
    }, 200);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && currentStep.type === 'text') {
      e.preventDefault();
      if (value.trim()) advance();
    }
    if (e.key === 'Enter' && e.metaKey && currentStep.type === 'textarea') {
      e.preventDefault();
      advance();
    }
  }

  const canContinue = currentStep.optional || value.trim().length > 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--surface-0)', position: 'relative',
    }}>
      <style>{`
        @keyframes jifFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .jif-fade { animation: jifFadeUp 240ms ease forwards; }
        .jif-fade-out { opacity: 0; transform: translateY(-8px); transition: all 180ms ease; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '18px 20px 14px',
        borderBottom: '1px solid var(--border-main)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', background: '#0f0f1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 1px rgba(201,168,76,0.2)',
          }}>
            <DillyAvatar size={20} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Import a Job
          </span>
        </div>
        <button
          onClick={endJobImport}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16, lineHeight: 1, padding: 4 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
        >
          ×
        </button>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 5, padding: '12px 20px 0', alignItems: 'center' }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            height: 3, flex: 1, borderRadius: 4,
            background: i <= step ? '#2B3A8E' : 'var(--border-main)',
            transition: 'background 300ms ease',
          }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500, marginLeft: 4, whiteSpace: 'nowrap' }}>
          {step + 1} / {STEPS.length}
        </span>
      </div>

      {/* Question + input */}
      <div
        className={animating ? 'jif-fade-out' : 'jif-fade'}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 20px 20px', gap: 16 }}
      >
        {/* Dilly question bubble */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', background: '#0f0f1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
          }}>
            <DillyAvatar size={16} />
          </div>
          <div style={{
            background: 'var(--surface-1)', border: '1px solid var(--border-main)',
            borderRadius: '4px 14px 14px 14px', padding: '10px 14px',
          }}>
            <p style={{
              fontFamily: 'Playfair Display, serif', fontSize: 15, fontWeight: 400,
              color: 'var(--text-1)', margin: 0, lineHeight: 1.5,
            }}>
              {currentStep.question}
            </p>
            {currentStep.hint && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '5px 0 0', lineHeight: 1.5 }}>
                {currentStep.hint}
              </p>
            )}
          </div>
        </div>

        {/* Input */}
        <div style={{ marginLeft: 32, display: 'flex', flexDirection: 'column', gap: 10, flex: currentStep.type === 'textarea' ? 1 : 0 }}>
          {currentStep.type === 'text' ? (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={value}
              onChange={e => setValues(v => ({ ...v, [currentStep.id]: e.target.value }))}
              onKeyDown={handleKey}
              placeholder={currentStep.hint}
              style={{
                width: '100%', background: 'var(--surface-1)',
                border: '1px solid rgba(59,76,192,0.35)',
                borderRadius: 10, padding: '11px 14px',
                fontSize: 13, color: 'var(--text-1)', outline: 'none',
                boxSizing: 'border-box',
                boxShadow: '0 0 0 3px rgba(59,76,192,0.08)',
              }}
            />
          ) : (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={value}
              onChange={e => setValues(v => ({ ...v, [currentStep.id]: e.target.value }))}
              onKeyDown={handleKey}
              placeholder="Paste the job description here..."
              rows={7}
              style={{
                width: '100%', flex: 1, resize: 'none',
                background: 'var(--surface-1)',
                border: '1px solid rgba(59,76,192,0.35)',
                borderRadius: 10, padding: '11px 14px',
                fontSize: 12, color: 'var(--text-1)', outline: 'none',
                lineHeight: 1.6, boxSizing: 'border-box',
                boxShadow: '0 0 0 3px rgba(59,76,192,0.08)',
                fontFamily: 'inherit',
              }}
            />
          )}

          <button
            onClick={() => advance()}
            disabled={!canContinue}
            style={{
              background: canContinue ? '#2B3A8E' : 'var(--surface-2)',
              color: canContinue ? '#fff' : 'var(--text-3)',
              border: 'none', borderRadius: 10, padding: '11px 0',
              fontSize: 13, fontWeight: 600, cursor: canContinue ? 'pointer' : 'default',
              transition: 'all 160ms ease', width: '100%',
            }}
            onMouseEnter={e => { if (canContinue) e.currentTarget.style.background = '#2f3da8'; }}
            onMouseLeave={e => { if (canContinue) e.currentTarget.style.background = '#2B3A8E'; }}
          >
            {isLast ? 'Generate resume' : 'Continue →'}
          </button>

          {currentStep.optional && (
            <button
              onClick={() => advance(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: 'var(--text-3)', textDecoration: 'underline',
                padding: '2px 0', textAlign: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              {currentStep.skipLabel}
            </button>
          )}

          {currentStep.type === 'textarea' && value.trim() && (
            <p style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
              ⌘ + Enter to generate
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
