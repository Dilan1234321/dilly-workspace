"use client";

import Link from "next/link";
import { AppStoreButton } from "@/components/ui/app-store-button";
import { PlayStoreButton } from "@/components/ui/play-store-button";
import { cn } from "@/lib/utils";

/** Demo page for App Store and Play Store button components. Use href to link to your store listings. */
export default function AppStoreButtonDemoPage() {
  return (
    <div className="m-app min-h-screen">
      <header className="m-header">
        <div className="m-header-inner">
          <Link
            href="/"
            className="flex items-center gap-2 text-[var(--m-text-2)] transition-colors hover:text-[var(--m-text)]"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span className="text-sm font-medium">Back</span>
          </Link>
          <h1 className="text-base font-semibold text-[var(--m-text)]">
            App & Play Store Buttons
          </h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="relative flex min-h-[80vh] w-full flex-col items-center justify-center gap-12 px-4">
        <div className="flex flex-col items-center gap-8">
          <p className="text-center text-sm text-[var(--m-text-3)]">
            Download on the App Store
          </p>
          <AppStoreButton href="https://apps.apple.com" />
          <p className="text-xs text-[var(--m-text-4)]">
            Replace with your App Store URL when ready.
          </p>
        </div>

        <div className="flex flex-col items-center gap-8">
          <p className="text-center text-sm text-[var(--m-text-3)]">
            GET IT ON Google Play
          </p>
          <PlayStoreButton href="https://play.google.com/store" />
          <p className="text-xs text-[var(--m-text-4)]">
            Replace with your Play Store URL when ready.
          </p>
        </div>

        {/* Subtle radial glow behind the buttons */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 size-full max-w-[375px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl",
            "bg-[radial-gradient(ellipse_at_center,rgba(201,168,130,0.08),transparent_50%)]"
          )}
        />
      </main>
    </div>
  );
}
