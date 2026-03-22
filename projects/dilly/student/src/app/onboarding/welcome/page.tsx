"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendVerificationCode } from "@/lib/auth";

export default function WelcomePage() {
  const router = useRouter();
  const [email,   setEmail]   = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith(".edu")) {
      setError("Use your .edu email — Dilly is for students.");
      return;
    }
    setLoading(true);
    try {
      const { devCode } = await sendVerificationCode(trimmed);
      sessionStorage.setItem("dilly_pending_email", trimmed);
      if (devCode) sessionStorage.setItem("dilly_dev_code", devCode);
      router.push("/onboarding/verify");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen justify-between py-16">
      <div className="flex flex-col gap-2 pt-8">
        <p style={{
          color: "var(--gold)", fontSize: "0.72rem", fontWeight: 600,
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          74% of Tech resumes are missing a GitHub link
        </p>
        <h1 style={{
          fontSize: "clamp(2rem, 9vw, 2.75rem)", fontWeight: 800,
          lineHeight: 1.1, color: "var(--text-primary)", marginTop: "0.5rem",
        }}>
          The bar that<br />gets you hired.
        </h1>
        <p style={{
          color: "var(--text-secondary)", fontSize: "1rem",
          lineHeight: 1.6, marginTop: "0.75rem",
        }}>
          Dilly scores your resume the way Goldman reads it — and tells you
          exactly where you rank against your peers.
        </p>
      </div>

      <div className="flex flex-col gap-4 pb-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <input
              type="email" inputMode="email" autoComplete="email"
              autoCapitalize="none" placeholder="your@school.edu"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              disabled={loading}
              style={{
                background: "var(--surface-2)",
                border: email ? "1.5px solid var(--gold)" : "1.5px solid var(--surface-4)",
                borderRadius: "12px", padding: "16px 18px",
                fontSize: "1rem", color: "var(--text-primary)", width: "100%",
                transition: "border-color 0.15s",
              }}
            />
            {error && (
              <p style={{ color: "var(--coral)", fontSize: "0.8rem", paddingLeft: "4px" }}>
                {error}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !email.trim()}
            style={{
              background: loading || !email.trim() ? "var(--surface-3)" : "var(--gold)",
              color: loading || !email.trim() ? "var(--text-tertiary)" : "#080809",
              border: "none", borderRadius: "12px", padding: "17px",
              fontSize: "1rem", fontWeight: 700,
              cursor: loading || !email.trim() ? "default" : "pointer",
              transition: "background 0.15s, color 0.15s", letterSpacing: "0.01em",
            }}
          >
            {loading ? "Sending code…" : "Get my scores →"}
          </button>
        </form>
        <p style={{
          color: "var(--text-tertiary)", fontSize: "0.75rem",
          textAlign: "center", lineHeight: 1.5,
        }}>
          Free to try · No credit card · .edu email required
        </p>
      </div>
    </div>
  );
}
