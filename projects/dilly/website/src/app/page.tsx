import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/index.html");
}

function _UnusedDillyWebsite() {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.dilly-careers.com";

  function CtaLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--dilly-bg)] text-[var(--dilly-taupe-bright)] selection:bg-[var(--dilly-accent)]/30">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--dilly-border)] bg-[var(--dilly-bg)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <img src="/dilly-logo.png" alt="Dilly" className="h-8 w-auto" />
            <span className="text-xl font-semibold tracking-tight">Dilly</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="hidden text-sm text-[var(--dilly-taupe-muted)] transition-colors hover:text-[var(--dilly-taupe-bright)] md:block">
              Features
            </a>
            <a href="#how-it-works" className="hidden text-sm text-[var(--dilly-taupe-muted)] transition-colors hover:text-[var(--dilly-taupe-bright)] md:block">
              How It Works
            </a>
            <a href="#pricing" className="text-sm text-[var(--dilly-taupe-muted)] transition-colors hover:text-[var(--dilly-taupe-bright)]">
              Pricing
            </a>
            <CtaLink
              href={APP_URL}
              className="rounded-xl bg-[var(--dilly-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--dilly-bg-deep)] transition-all hover:bg-[var(--dilly-accent-hover)] hover:shadow-lg hover:shadow-[var(--dilly-accent)]/20"
            >
              Get Started
            </CtaLink>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-24 md:pt-40 md:pb-32">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--dilly-surface)]/50 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="mb-4 inline-block rounded-full border border-[var(--dilly-accent)]/30 bg-[var(--dilly-accent)]/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[var(--dilly-accent)]">
            The Credit Score for Talent
          </p>
          <h1 className="mb-6 text-5xl font-bold leading-[1.1] tracking-tight md:text-6xl lg:text-7xl">
            Land the offer, <br />
            <span className="text-gradient">leave nothing to chance</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-[var(--dilly-taupe-muted)] md:text-xl">
            Recruiters spend <strong className="text-[var(--dilly-taupe-bright)]">6 seconds</strong> on a resume. Dilly is the only platform that scores yours against the <strong className="text-[var(--dilly-taupe-bright)]">Dilly Truth Standard</strong>—telling you exactly how to win before you apply.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <CtaLink
              href={APP_URL}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--dilly-accent)] px-8 py-4 text-base font-semibold text-[var(--dilly-bg-deep)] shadow-lg shadow-[var(--dilly-accent)]/25 transition-all hover:bg-[var(--dilly-accent-hover)] hover:shadow-xl hover:shadow-[var(--dilly-accent)]/30"
            >
              Start Your Free Audit
            </CtaLink>
            <a
              href="#visual-tour"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--dilly-border)] px-8 py-4 text-base font-semibold transition-all hover:border-[var(--dilly-accent)]/50 hover:bg-[var(--dilly-surface)]"
            >
              See the App
            </a>
          </div>
          <p className="mt-6 text-sm text-[var(--dilly-taupe-muted)]">
            Verified .edu required · Student-first data privacy
          </p>
        </div>
      </section>

      {/* Visual Tour / App Screenshots */}
      <section id="visual-tour" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Built for high-velocity students</h2>
            <p className="mx-auto max-w-2xl text-[var(--dilly-taupe-muted)]">
              Stop guessing what recruiters want. Dilly gives you the tools to measure, improve, and share your talent signals.
            </p>
          </div>

          <div className="space-y-32">
            {/* Screenshot 1: Audit */}
            <div className="grid items-center gap-12 md:grid-cols-2">
              <div>
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--dilly-accent)]/20 text-sm font-bold text-[var(--dilly-accent)]">1</div>
                <h3 className="mb-4 text-2xl font-bold md:text-3xl">The Talent Audit</h3>
                <p className="mb-6 leading-relaxed text-[var(--dilly-taupe-muted)]">
                  Upload your resume and get scored on three critical dimensions: <strong className="text-[var(--dilly-taupe-bright)]">Smart</strong>, <strong className="text-[var(--dilly-taupe-bright)]">Grit</strong>, and <strong className="text-[var(--dilly-taupe-bright)]">Build</strong>.
                </p>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Dilly Truth Standard:</span> We only score what&apos;s on the page.
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Dual-Track Evaluation:</span> Campus rigor vs. Professional readiness.
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Immediate Feedback:</span> No more waiting for &quot;rejection&quot; emails.
                  </li>
                </ul>
              </div>
              <div className="relative group">
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-[var(--dilly-accent)]/20 to-transparent blur-2xl transition-all group-hover:from-[var(--dilly-accent)]/30" />
                <div className="relative rounded-2xl border border-[var(--dilly-border)] bg-[var(--dilly-surface)] p-2 shadow-2xl overflow-hidden">
                  <div className="rounded-xl bg-[var(--dilly-bg-deep)] p-6">
                    {/* Mock Score UI */}
                    <div className="mb-6 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--dilly-accent)]">Audit v2.0</p>
                        <h4 className="text-lg font-bold">Jordan Miller</h4>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-[var(--dilly-accent)]">84</div>
                        <p className="text-[10px] text-[var(--dilly-taupe-muted)]">OVERALL SCORE</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-lg border border-[var(--dilly-border)] bg-[var(--dilly-surface)] p-3 text-center">
                        <p className="text-[9px] font-bold uppercase text-[var(--dilly-taupe-muted)]">Smart</p>
                        <p className="text-xl font-bold text-green-400">89</p>
                      </div>
                      <div className="rounded-lg border border-[var(--dilly-border)] bg-[var(--dilly-surface)] p-3 text-center">
                        <p className="text-[9px] font-bold uppercase text-[var(--dilly-taupe-muted)]">Grit</p>
                        <p className="text-xl font-bold text-yellow-400">72</p>
                      </div>
                      <div className="rounded-lg border border-[var(--dilly-border)] bg-[var(--dilly-surface)] p-3 text-center">
                        <p className="text-[9px] font-bold uppercase text-[var(--dilly-taupe-muted)]">Build</p>
                        <p className="text-xl font-bold text-green-400">82</p>
                      </div>
                    </div>
                    {/* Mock Recommendations */}
                    <div className="mt-6 space-y-3">
                      <div className="rounded-lg bg-white/5 p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase text-[var(--dilly-accent)]">Grit</span>
                          <span className="text-xs font-semibold">Strengthen Impact Bullet</span>
                        </div>
                        <p className="text-[11px] text-[var(--dilly-taupe-muted)] line-through">Helped manage social media accounts.</p>
                        <p className="text-[11px] font-medium text-[var(--dilly-accent)]">→ Scaled Instagram reach by 45% in 3 months via automated content pipeline.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Screenshot 2: Voice */}
            <div className="grid items-center gap-12 md:grid-cols-2 md:grid-flow-col-dense">
              <div className="md:col-start-2">
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--dilly-accent)]/20 text-sm font-bold text-[var(--dilly-accent)]">2</div>
                <h3 className="mb-4 text-2xl font-bold md:text-3xl">Dilly Voice</h3>
                <p className="mb-6 leading-relaxed text-[var(--dilly-taupe-muted)]">
                  Your personalized career advisor. It knows your resume, your track, and your goals. Ask anything, 24/7.
                </p>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Interview Prep:</span> &quot;Ask me hard questions about my AWS project.&quot;
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Gap Analysis:</span> &quot;What am I missing for a Google SWE internship?&quot;
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Context-Aware:</span> Grounded in your actual data, not generic templates.
                  </li>
                </ul>
              </div>
              <div className="relative group md:col-start-1">
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tl from-[var(--dilly-accent)]/20 to-transparent blur-2xl transition-all group-hover:from-[var(--dilly-accent)]/30" />
                <div className="relative rounded-2xl border border-[var(--dilly-border)] bg-[var(--dilly-surface)] p-2 shadow-2xl overflow-hidden">
                  <div className="rounded-xl bg-[var(--dilly-bg-deep)] p-4 h-80 flex flex-col">
                    <div className="mb-4 flex items-center gap-2 border-b border-[var(--dilly-border)] pb-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--dilly-accent)] text-[10px] font-bold text-[var(--dilly-bg-deep)]">M</div>
                      <span className="text-xs font-bold tracking-tight">Dilly Voice</span>
                    </div>
                    <div className="flex-1 space-y-4 overflow-y-auto">
                      <div className="flex justify-end">
                        <div className="rounded-2xl bg-[var(--dilly-accent)]/10 px-4 py-2 text-[11px] text-[var(--dilly-taupe-bright)] max-w-[80%] border border-[var(--dilly-accent)]/20">
                          How do I improve my Grit score?
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="rounded-2xl bg-white/5 px-4 py-2 text-[11px] text-[var(--dilly-taupe-muted)] max-w-[85%] leading-relaxed">
                          Your current score is 72. To break into the <span className="text-white font-bold">Top 10%</span>, you need to quantify your leadership role at AKPsi. Instead of &quot;Led meetings,&quot; use &quot;Managed 15-person committee to secure $5k in sponsorship.&quot;
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <div className="h-8 flex-1 rounded-lg bg-white/5 border border-[var(--dilly-border)] px-3 py-1 text-[10px] flex items-center text-[var(--dilly-taupe-muted)]">Message Dilly...</div>
                      <div className="h-8 w-8 rounded-lg bg-[var(--dilly-accent)] flex items-center justify-center">
                        <svg className="h-3 w-3 text-[var(--dilly-bg-deep)]" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

             {/* Screenshot 3: Leaderboard */}
             <div className="grid items-center gap-12 md:grid-cols-2">
              <div>
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--dilly-accent)]/20 text-sm font-bold text-[var(--dilly-accent)]">3</div>
                <h3 className="mb-4 text-2xl font-bold md:text-3xl">Peer Benchmarking</h3>
                <p className="mb-6 leading-relaxed text-[var(--dilly-taupe-muted)]">
                  Know exactly where you stand against other students in your track. We compare you against thousands of audited resumes.
                </p>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Track-Specific Percentiles:</span> &quot;Top 15% Grit for Tech.&quot;
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Tier-1 Targets:</span> See the bar for firms like Goldman, Google, and McKinsey.
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Progress Tracking:</span> Watch your percentile climb as you build.
                  </li>
                </ul>
              </div>
              <div className="relative group">
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-[var(--dilly-accent)]/20 to-transparent blur-2xl transition-all group-hover:from-[var(--dilly-accent)]/30" />
                <div className="relative rounded-2xl border border-[var(--dilly-border)] bg-[var(--dilly-surface)] p-2 shadow-2xl overflow-hidden">
                  <div className="rounded-xl bg-[var(--dilly-bg-deep)] p-6">
                    <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--dilly-taupe-muted)]">Benchmark: Tech Track</h4>
                    <div className="space-y-5">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-semibold">Smart</span>
                          <span className="font-bold text-[var(--dilly-accent)]">Top 5%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full w-[95%] bg-[var(--dilly-accent)]" />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-[var(--dilly-taupe-muted)]">
                          <span className="font-semibold">Grit</span>
                          <span className="font-bold">Top 28%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full w-[72%] bg-[var(--dilly-taupe-muted)]" />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-[var(--dilly-taupe-muted)]">
                          <span className="font-semibold">Build</span>
                          <span className="font-bold">Top 18%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full w-[82%] bg-[var(--dilly-taupe-muted)]" />
                        </div>
                      </div>
                    </div>
                    <div className="mt-8 rounded-lg border border-dashed border-[var(--dilly-border)] p-4 text-center">
                      <p className="text-xs font-medium text-[var(--dilly-taupe-muted)]">You are <span className="text-white">8 points</span> away from the <br />Goldman Sachs Grit Bar.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Screenshot 4: ATS Shield */}
            <div className="grid items-center gap-12 md:grid-cols-2 md:grid-flow-col-dense">
              <div className="md:col-start-2">
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--dilly-accent)]/20 text-sm font-bold text-[var(--dilly-accent)]">4</div>
                <h3 className="mb-4 text-2xl font-bold md:text-3xl">The ATS Shield</h3>
                <p className="mb-6 leading-relaxed text-[var(--dilly-taupe-muted)]">
                  75% of resumes are rejected by an Applicant Tracking System before a human ever sees them. Dilly shows you exactly what the ATS sees.
                </p>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Vendor Simulation:</span> See how Workday, Greenhouse, and Lever parse you.
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Keyword Injection:</span> Smart suggestions for missing technical terms.
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> <span className="font-medium">Fix It For Me:</span> Auto-rewrite bullets to clear the filters.
                  </li>
                </ul>
              </div>
              <div className="relative group md:col-start-1">
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-[var(--dilly-accent)]/20 to-transparent blur-2xl transition-all group-hover:from-[var(--dilly-accent)]/30" />
                <div className="relative rounded-2xl border border-[var(--dilly-border)] bg-[var(--dilly-surface)] p-2 shadow-2xl overflow-hidden">
                  <div className="rounded-xl bg-[var(--dilly-bg-deep)] p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--dilly-accent)]">ATS Readiness</span>
                      <span className="rounded bg-green-500/20 px-2 py-0.5 text-[10px] font-bold text-green-400">READY</span>
                    </div>
                    <div className="mb-6 flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-green-500/30 bg-green-500/10 text-xl font-black text-green-400">92</div>
                      <div>
                        <p className="text-sm font-bold text-slate-100">Excellent Parseability</p>
                        <p className="text-[10px] text-[var(--dilly-taupe-muted)]">Your resume clears 9/10 common ATS filters.</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[10px]">
                        <span className="text-green-400 font-bold">✓</span>
                        <span className="text-slate-300">Standard section headers detected</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[10px]">
                        <span className="text-green-400 font-bold">✓</span>
                        <span className="text-slate-300">Contact information is machine-readable</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-[10px] border border-red-500/20">
                        <span className="text-red-400 font-bold">✗</span>
                        <span className="text-slate-200">Missing Keyword: <span className="font-bold underline italic">Agile Methodology</span></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Dilly Truth Standard */}
      <section className="border-t border-[var(--dilly-border)] bg-[var(--dilly-bg-deep)] py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="mb-6 text-3xl font-bold md:text-4xl">The Dilly Truth Standard</h2>
          <p className="mb-12 text-lg leading-relaxed text-[var(--dilly-taupe-muted)]">
            We don&apos;t use AI to &quot;write&quot; your resume. We use it to <strong className="text-white">audit</strong> your resume. Our engine is built to identify grit, technical veracity, and impact—just like the best hiring managers in the world.
          </p>
          <div className="grid gap-6 md:grid-cols-2 text-left">
            <div className="rounded-xl border border-[var(--dilly-border)] bg-[var(--dilly-surface)] p-6">
              <h4 className="mb-2 font-bold text-[var(--dilly-accent)]">Zero Hallucination</h4>
              <p className="text-sm text-[var(--dilly-taupe-muted)]">We only score what you&apos;ve actually done. No fluff, no fake metrics, no &quot;GPT-isms.&quot;</p>
            </div>
            <div className="rounded-xl border border-[var(--dilly-border)] bg-[var(--dilly-surface)] p-6">
              <h4 className="mb-2 font-bold text-[var(--dilly-accent)]">Prestige-Neutral</h4>
              <p className="text-sm text-[var(--dilly-taupe-muted)]">We weight behavioral grit and technical depth higher than where you go to school.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-[var(--dilly-border)] py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">The best $9.99 you&apos;ll spend</h2>
            <p className="mx-auto max-w-2xl text-[var(--dilly-taupe-muted)]">
              One month of Dilly costs less than a single DoorDash order. An internship at a top firm pays <strong className="text-white">$30+/hour</strong>. If Dilly gives you just a <strong className="text-white">5% edge</strong>, the subscription pays for itself in your first 20 minutes on the job.
            </p>
          </div>
          
          <div className="mx-auto max-w-md">
            <div className="relative rounded-2xl border-2 border-[var(--dilly-accent)] bg-[var(--dilly-surface)] p-10 shadow-2xl">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--dilly-accent)] px-4 py-1 text-[10px] font-black uppercase tracking-widest text-[var(--dilly-bg-deep)]">
                Student Access
              </div>
              <div className="mb-4 text-5xl font-black text-[var(--dilly-accent)] text-center">$9.99<span className="text-sm font-normal text-[var(--dilly-taupe-muted)]">/mo</span></div>
              <p className="mb-8 text-center text-sm font-medium text-[var(--dilly-taupe-muted)]">Cancel anytime. Unlimited growth.</p>
              
              <ul className="mb-10 space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5" />
                  <div>
                    <p className="font-bold text-[var(--dilly-taupe-bright)]">Unlimited Talent Audits</p>
                    <p className="text-xs text-[var(--dilly-taupe-muted)]">Audit your resume after every project and edit.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5" />
                  <div>
                    <p className="font-bold text-[var(--dilly-taupe-bright)]">Full Dilly Voice Access</p>
                    <p className="text-xs text-[var(--dilly-taupe-muted)]">Your private 24/7 career strategist.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5" />
                  <div>
                    <p className="font-bold text-[var(--dilly-taupe-bright)]">Peer Benchmarking</p>
                    <p className="text-xs text-[var(--dilly-taupe-muted)]">Know your percentile in your field.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckIcon className="mt-0.5" />
                  <div>
                    <p className="font-bold text-[var(--dilly-taupe-bright)]">Shareable Talent Snapshots</p>
                    <p className="text-xs text-[var(--dilly-taupe-muted)]">Verified proof of your Smart, Grit, and Build scores.</p>
                  </div>
                </li>
              </ul>
              
              <CtaLink
                href={APP_URL}
                className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--dilly-accent)] px-8 py-5 text-lg font-bold text-[var(--dilly-bg-deep)] shadow-lg shadow-[var(--dilly-accent)]/20 transition-all hover:scale-[1.02] hover:bg-[var(--dilly-accent-hover)] active:scale-[0.98]"
              >
                Secure Your Spot
              </CtaLink>
              <p className="mt-6 text-center text-xs text-[var(--dilly-taupe-muted)]">
                Join 500+ students already auditing their future.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-[var(--dilly-border)] py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
            Don&apos;t blow your one shot.
          </h2>
          <p className="mb-10 text-lg text-[var(--dilly-taupe-muted)]">
            The world&apos;s best firms use data to filter you. Use Dilly to filter yourself first.
          </p>
          <CtaLink
            href={APP_URL}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--dilly-accent)] px-12 py-5 text-lg font-bold text-[var(--dilly-bg-deep)] shadow-xl shadow-[var(--dilly-accent)]/25 transition-all hover:bg-[var(--dilly-accent-hover)] hover:shadow-2xl"
          >
            Run Your First Audit
          </CtaLink>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--dilly-border)] bg-[var(--dilly-bg-deep)] py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <img src="/dilly-logo.png" alt="Dilly" className="h-6 w-auto opacity-50" />
              <span className="font-semibold text-[var(--dilly-taupe-muted)]">Dilly AI</span>
            </div>
            <div className="flex gap-8 text-sm text-[var(--dilly-taupe-muted)]">
              <a href="#features" className="hover:text-[var(--dilly-taupe-bright)]">Features</a>
              <a href="#pricing" className="hover:text-[var(--dilly-taupe-bright)]">Pricing</a>
              <a href={APP_URL} className="hover:text-[var(--dilly-taupe-bright)]">Login</a>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-[var(--dilly-taupe-muted)]">
            © {new Date().getFullYear()} Dilly. The Credit Score for Talent. Built for Spartans.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--dilly-border)] bg-[var(--dilly-surface)] p-6 transition-colors hover:border-[var(--dilly-accent)]/30">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-[var(--dilly-taupe-muted)]">{description}</p>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 text-[var(--dilly-accent)] ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
