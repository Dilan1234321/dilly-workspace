"use client";

import Link from "next/link";
import { AnimatedStateIconsDemo } from "@/components/ui/animated-state-icons";

export default function DemoPage() {
  return (
    <div className="m-app min-h-screen">
      <header className="m-header">
        <div className="m-header-inner">
          <Link href="/" className="flex items-center gap-2 text-[var(--m-text-2)] hover:text-[var(--m-text)] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            <span className="text-sm font-medium">Back</span>
          </Link>
          <h1 className="text-base font-semibold" style={{ color: "var(--m-text)" }}>Component demo</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="m-page">
        <AnimatedStateIconsDemo />
      </main>
    </div>
  );
}
