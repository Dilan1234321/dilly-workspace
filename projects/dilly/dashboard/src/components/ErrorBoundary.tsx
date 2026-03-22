"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** When set, show a "Clear Dilly data" button to recover from corrupted localStorage. */
  clearVoiceDataEmail?: string | null;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

function clearVoiceStorage(email: string) {
  if (typeof localStorage === "undefined") return;
  const suffix = `_${email}`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("dilly_voice_") && key.endsWith(suffix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Dilly ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const err = this.state.error;
      const showDetails = typeof window !== "undefined" && process.env.NODE_ENV === "development" && err;
      const email = this.props.clearVoiceDataEmail;
      return (
        <div
          className="min-h-screen w-full flex flex-col items-center justify-center p-6 text-center"
          style={{ background: "#040a16" }}
        >
          <div className="max-w-[375px] w-full">
            <div
              className="rounded-2xl p-8 border mb-6 text-left"
              style={{
                background: "linear-gradient(150deg, rgba(6, 16, 37, 0.94), rgba(4, 10, 22, 0.88))",
                borderColor: "rgba(253, 185, 19, 0.25)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.4)",
              }}
            >
              <div className="flex justify-center mb-4">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{
                    background: "rgba(253, 185, 19, 0.15)",
                    border: "1px solid rgba(253, 185, 19, 0.4)",
                  }}
                  aria-hidden
                >
                  <svg className="h-6 w-6" style={{ color: "#fdb913" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </span>
              </div>
              <h1
                className="text-xl font-bold mb-2 text-center"
                style={{ fontFamily: "var(--font-cinzel), serif", color: "#fff" }}
              >
                Oops!
              </h1>
              <p className="text-sm mb-6 text-center" style={{ color: "rgba(255, 255, 255, 0.74)" }}>
                Something went wrong. We&apos;re working on that right now.
                Try refreshing the page. If it persists, sign out and back in.
                {email && " If you were on Dilly, try “Clear Dilly data & reload” below."}
              </p>
              {showDetails && (
                <pre
                  className="text-left text-xs p-3 rounded-xl mb-6 overflow-auto max-h-32"
                  style={{
                    color: "rgba(253, 185, 19, 0.9)",
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid rgba(253, 185, 19, 0.2)",
                  }}
                >
                  {err.message}
                </pre>
              )}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => this.setState({ hasError: false, error: null })}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-95 active:scale-[0.98]"
                  style={{
                    background: "#fdb913",
                    color: "#040a16",
                    border: "1px solid rgba(253, 185, 19, 0.6)",
                    boxShadow: "0 2px 12px rgba(253, 185, 19, 0.25)",
                  }}
                >
                  Try again
                </button>
                {email && (
                  <button
                    type="button"
                    onClick={() => {
                      clearVoiceStorage(email);
                      window.location.reload();
                    }}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:bg-white/10"
                    style={{
                      borderColor: "rgba(255, 255, 255, 0.2)",
                      color: "rgba(255, 255, 255, 0.84)",
                      background: "transparent",
                    }}
                  >
                    Clear Dilly data & reload
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
