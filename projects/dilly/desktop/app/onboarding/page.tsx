'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const COHORTS = [
  'Data Science & Analytics', 'Software Engineering & CS', 'Finance & Accounting',
  'Marketing & Advertising', 'Consulting & Strategy', 'Healthcare & Clinical',
  'Life Sciences & Research', 'Entrepreneurship & Innovation', 'Management & Operations',
  'Economics & Public Policy', 'Social Sciences & Nonprofit', 'Physical Sciences & Math',
  'Media & Communications', 'Design & Creative', 'Cybersecurity & IT',
  'Legal & Compliance', 'Human Resources & People', 'Supply Chain & Logistics',
  'Education & Teaching', 'Real Estate & Construction', 'Environmental & Sustainability',
  'Hospitality & Events',
];

const STEPS = ['email', 'majors', 'interests', 'goals', 'photo', 'resume'];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [majors, setMajors] = useState<string[]>([]);
  const [minors, setMinors] = useState<string[]>([]);
  const [majorInput, setMajorInput] = useState('');
  const [minorInput, setMinorInput] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [goalType, setGoalType] = useState<'internship' | 'fulltime' | 'both'>('internship');
  const [locations, setLocations] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLInputElement>(null);

  function next() { setDirection(1); setStep(s => Math.min(s + 1, STEPS.length - 1)); }
  function prev() { setDirection(-1); setStep(s => Math.max(s - 1, 0)); }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setPhotoFile(f);
      setPhotoPreview(URL.createObjectURL(f));
    }
  }

  function handleResume(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setResumeFile(f);
  }

  function toggleInterest(c: string) {
    setInterests(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  function addMajor() {
    if (majorInput.trim() && !majors.includes(majorInput.trim())) {
      setMajors([...majors, majorInput.trim()]);
      setMajorInput('');
    }
  }

  function addMinor() {
    if (minorInput.trim() && !minors.includes(minorInput.trim())) {
      setMinors([...minors, minorInput.trim()]);
      setMinorInput('');
    }
  }

  async function finish() {
    setLoading(true);
    // TODO: wire to real API
    await new Promise(r => setTimeout(r, 1500));
    router.push('/home');
  }

  const progress = ((step + 1) / STEPS.length) * 100;
  const isValid = [
    email.includes('.edu'),
    majors.length > 0,
    interests.length > 0,
    goalType !== null,
    true, // photo is optional
    true, // resume is optional but encouraged
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-0)' }}>
      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--border-main)', flexShrink: 0 }}>
        <div style={{ height: '100%', background: '#3B4CC0', width: progress + '%', transition: 'width 400ms cubic-bezier(0.16, 1, 0.3, 1)', borderRadius: '0 2px 2px 0' }} />
      </div>

      {/* Header */}
      <div style={{ padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#3B4CC0', letterSpacing: -0.5 }}>dilly</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Step {step + 1} of {STEPS.length}</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div key={step} style={{
          width: 480, maxWidth: '90vw',
          animation: `slideFrom${direction > 0 ? 'Right' : 'Left'} 350ms cubic-bezier(0.16, 1, 0.3, 1)`,
        }}>

          {/* Step 0: Email */}
          {step === 0 && (
            <div>
              <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 28, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>
                Welcome to Dilly
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-2)', margin: '0 0 32px', lineHeight: 1.6 }}>
                Enter your .edu email to get started. We'll send you a verification link.
              </p>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@school.edu"
                onKeyDown={e => { if (e.key === 'Enter' && email.includes('.edu')) next(); }}
                style={{
                  width: '100%', padding: '14px 16px', fontSize: 15, borderRadius: 4,
                  border: '1px solid var(--border-main)', background: 'var(--surface-1)',
                  color: 'var(--text-1)', outline: 'none', transition: 'border 200ms ease',
                }}
                onFocus={e => { e.target.style.borderColor = '#3B4CC0'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-main)'; }}
                autoFocus
              />
              {email && !email.includes('.edu') && (
                <p style={{ fontSize: 12, color: '#FF453A', marginTop: 8 }}>Please use a .edu email address</p>
              )}
            </div>
          )}

          {/* Step 1: Majors/Minors */}
          {step === 1 && (
            <div>
              <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 28, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>
                What do you study?
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-2)', margin: '0 0 32px', lineHeight: 1.6 }}>
                Add your major(s) and minor(s). This helps us match you to the right roles.
              </p>

              <p style={{ fontSize: 11, fontWeight: 600, color: '#3B4CC0', letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 8px' }}>Majors</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="text" value={majorInput} onChange={e => setMajorInput(e.target.value)}
                  placeholder="e.g. Data Science"
                  onKeyDown={e => { if (e.key === 'Enter') addMajor(); }}
                  style={{ flex: 1, padding: '10px 14px', fontSize: 14, borderRadius: 4, border: '1px solid var(--border-main)', background: 'var(--surface-1)', color: 'var(--text-1)', outline: 'none' }}
                  autoFocus />
                <button onClick={addMajor} style={{ padding: '10px 20px', borderRadius: 4, border: 'none', background: '#3B4CC0', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
                {majors.map(m => (
                  <span key={m} onClick={() => setMajors(majors.filter(x => x !== m))}
                    style={{ fontSize: 13, fontWeight: 600, color: '#3B4CC0', background: 'rgba(59,76,192,0.08)', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(59,76,192,0.15)' }}>
                    {m} &times;
                  </span>
                ))}
              </div>

              <p style={{ fontSize: 11, fontWeight: 600, color: '#C9A84C', letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 8px' }}>Minors</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="text" value={minorInput} onChange={e => setMinorInput(e.target.value)}
                  placeholder="e.g. Computer Science"
                  onKeyDown={e => { if (e.key === 'Enter') addMinor(); }}
                  style={{ flex: 1, padding: '10px 14px', fontSize: 14, borderRadius: 4, border: '1px solid var(--border-main)', background: 'var(--surface-1)', color: 'var(--text-1)', outline: 'none' }} />
                <button onClick={addMinor} style={{ padding: '10px 20px', borderRadius: 4, border: 'none', background: '#C9A84C', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add</button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {minors.map(m => (
                  <span key={m} onClick={() => setMinors(minors.filter(x => x !== m))}
                    style={{ fontSize: 13, fontWeight: 600, color: '#C9A84C', background: 'rgba(201,168,76,0.08)', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(201,168,76,0.15)' }}>
                    {m} &times;
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Interests */}
          {step === 2 && (
            <div>
              <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 28, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>
                What interests you?
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-2)', margin: '0 0 32px', lineHeight: 1.6 }}>
                Select fields you're curious about, even if they're not your major. We'll score you in each one.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {COHORTS.map(c => {
                  const selected = interests.includes(c);
                  return (
                    <button key={c} onClick={() => toggleInterest(c)}
                      style={{
                        padding: '8px 16px', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        border: '1px solid', transition: 'all 150ms ease',
                        background: selected ? 'rgba(59,76,192,0.08)' : 'transparent',
                        borderColor: selected ? '#3B4CC0' : 'var(--border-main)',
                        color: selected ? '#3B4CC0' : 'var(--text-2)',
                      }}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Goals */}
          {step === 3 && (
            <div>
              <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 28, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>
                What are you looking for?
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-2)', margin: '0 0 32px', lineHeight: 1.6 }}>
                This helps us prioritize the right opportunities for you.
              </p>

              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 12px' }}>Job type</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
                {[
                  { key: 'internship', label: 'Internships' },
                  { key: 'fulltime', label: 'Full-time' },
                  { key: 'both', label: 'Both' },
                ].map(g => (
                  <button key={g.key} onClick={() => setGoalType(g.key as any)}
                    style={{
                      flex: 1, padding: '14px', borderRadius: 4, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                      border: '1px solid', transition: 'all 150ms ease',
                      background: goalType === g.key ? 'rgba(59,76,192,0.08)' : 'transparent',
                      borderColor: goalType === g.key ? '#3B4CC0' : 'var(--border-main)',
                      color: goalType === g.key ? '#3B4CC0' : 'var(--text-2)',
                    }}>
                    {g.label}
                  </button>
                ))}
              </div>

              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 12px' }}>Location preference</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Remote', 'New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Austin', 'Boston', 'Seattle', 'Miami', 'Anywhere'].map(loc => {
                  const selected = locations.includes(loc);
                  return (
                    <button key={loc} onClick={() => setLocations(prev => prev.includes(loc) ? prev.filter(x => x !== loc) : [...prev, loc])}
                      style={{
                        padding: '8px 16px', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        border: '1px solid', transition: 'all 150ms ease',
                        background: selected ? 'rgba(59,76,192,0.08)' : 'transparent',
                        borderColor: selected ? '#3B4CC0' : 'var(--border-main)',
                        color: selected ? '#3B4CC0' : 'var(--text-2)',
                      }}>
                      {loc}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Photo */}
          {step === 4 && (
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 28, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>
                Add a photo
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-2)', margin: '0 0 32px', lineHeight: 1.6 }}>
                Recruiters see this on your Dilly profile. Make a good first impression.
              </p>
              <input type="file" ref={fileRef} accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
              <div onClick={() => fileRef.current?.click()}
                style={{
                  width: 180, height: 180, borderRadius: 90, margin: '0 auto 24px',
                  background: 'var(--surface-1)', border: '2px dashed var(--border-main)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  overflow: 'hidden', transition: 'border-color 200ms ease',
                }}>
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Click to upload</p>
                  </div>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>You can skip this and add one later</p>
            </div>
          )}

          {/* Step 5: Resume */}
          {step === 5 && (
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 28, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>
                Upload your resume
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-2)', margin: '0 0 32px', lineHeight: 1.6 }}>
                This is how Dilly scores you. We'll analyze your experience, skills, and achievements to build your Career Genome.
              </p>
              <input type="file" ref={resumeRef} accept=".pdf,.doc,.docx" onChange={handleResume} style={{ display: 'none' }} />
              <div onClick={() => resumeRef.current?.click()}
                style={{
                  padding: '48px 32px', borderRadius: 4, margin: '0 auto 24px',
                  background: 'var(--surface-1)', border: '2px dashed var(--border-main)',
                  cursor: 'pointer', transition: 'border-color 200ms ease', maxWidth: 400,
                }}>
                {resumeFile ? (
                  <div>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{resumeFile.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{(resumeFile.size / 1024).toFixed(0)} KB · Click to replace</p>
                  </div>
                ) : (
                  <div>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px', display: 'block' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>Drag & drop or click to upload</p>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>PDF, DOC, or DOCX</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Footer with nav buttons */}
      <div style={{ padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderTop: '1px solid var(--border-main)' }}>
        <button onClick={prev} disabled={step === 0}
          style={{
            padding: '10px 24px', borderRadius: 4, fontSize: 14, fontWeight: 500,
            border: '1px solid var(--border-main)', background: 'transparent',
            color: step === 0 ? 'var(--text-3)' : 'var(--text-2)', cursor: step === 0 ? 'default' : 'pointer',
            opacity: step === 0 ? 0.4 : 1, transition: 'opacity 200ms ease',
          }}>
          Back
        </button>

        <div style={{ display: 'flex', gap: 6 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 4,
              background: i === step ? '#3B4CC0' : i < step ? 'rgba(59,76,192,0.3)' : 'var(--border-main)',
              transition: 'all 300ms ease',
            }} />
          ))}
        </div>

        {step < STEPS.length - 1 ? (
          <button onClick={next} disabled={!isValid[step]}
            style={{
              padding: '10px 32px', borderRadius: 4, fontSize: 14, fontWeight: 600,
              border: 'none', background: isValid[step] ? '#3B4CC0' : 'var(--surface-2)',
              color: isValid[step] ? 'white' : 'var(--text-3)', cursor: isValid[step] ? 'pointer' : 'default',
              transition: 'all 200ms ease',
            }}>
            Continue
          </button>
        ) : (
          <button onClick={finish} disabled={loading}
            style={{
              padding: '10px 32px', borderRadius: 4, fontSize: 14, fontWeight: 600,
              border: 'none', background: '#3B4CC0', color: 'white', cursor: 'pointer',
              transition: 'all 200ms ease', opacity: loading ? 0.7 : 1,
            }}>
            {loading ? 'Setting up...' : 'Launch Dilly'}
          </button>
        )}
      </div>

      <style>{`
        @keyframes slideFromRight {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideFromLeft {
          from { opacity: 0; transform: translateX(-40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}