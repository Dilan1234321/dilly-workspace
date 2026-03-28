export default function AcademyPage() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-[400px]">
        <div className="w-16 h-16 rounded-2xl bg-dilly-blue/10 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3B4CC0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
        </div>
        <h1 className="font-display text-[24px] text-txt-1 mb-2">Academy</h1>
        <p className="text-[14px] text-txt-2 leading-relaxed mb-6">
          AI-powered test prep, skill building, and career coaching. SAT, ACT, GRE, GMAT, LSAT, MCAT and more.
        </p>
        <p className="text-[12px] text-txt-3">Coming soon</p>
      </div>
    </div>
  );
}