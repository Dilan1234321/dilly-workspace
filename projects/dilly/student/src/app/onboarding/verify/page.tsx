"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { verifyCode, sendVerificationCode } from "@/lib/auth";

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";
const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3000";
const RESEND_COOLDOWN = 30;

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "3px",
        padding: "0 22px",
        marginTop: "34px",
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: "2.5px",
            borderRadius: "999px",
            background:
              i < step - 1
                ? "var(--gold)"
                : i === step - 1
                ? "rgba(201,168,76,0.4)"
                : "rgba(255,255,255,0.08)",
          }}
        />
      ))}
    </div>
  );
}

// ── Email icon ────────────────────────────────────────────────────────────────

function EmailIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--gold)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="m22 7-10 7L2 7" />
    </svg>
  );
}

// ── Loading spinner ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ animation: "spin 0.7s linear infinite", display: "inline-block" }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function VerifyPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [digits, setDigits] = useState("");        // raw 0–6 digit string
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isReturning, setIsReturning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxesRef = useRef<HTMLDivElement>(null);

  // Load email + devCode from sessionStorage on mount; detect returning=true param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returning = params.get("returning") === "true";
    setIsReturning(returning);

    const stored = sessionStorage.getItem("dilly_pending_email") || "";
    if (!stored && !returning) {
      router.replace("/");
      return;
    }
    if (stored) setEmail(stored);
    const dc = sessionStorage.getItem("dilly_dev_code");
    if (dc) setDevCode(dc);
    // Focus hidden input
    inputRef.current?.focus();
  }, [router]);

  // Submit when 6 digits entered
  const submitCode = useCallback(
    async (code: string) => {
      if (code.length !== 6 || loading) return;
      setLoading(true);
      setError(null);
      try {
        await verifyCode(email, code);
        sessionStorage.removeItem("dilly_dev_code");
        if (isReturning) {
          // Returning user — skip all onboarding, go straight to dashboard
          const token = typeof localStorage !== "undefined" ? localStorage.getItem("dilly_auth_token") : null;
          window.location.href = token
            ? `${DASHBOARD_URL}/?token=${encodeURIComponent(token)}`
            : DASHBOARD_URL;
          return;
        }
        router.push("/onboarding/profile");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        // Map known API error messages to friendly copy
        let friendly = "That code isn't right. Try again.";
        let type = "invalid_code";
        if (msg.toLowerCase().includes("expired")) {
          friendly = "That code expired. We sent you a new one.";
          type = "expired_code";
          // auto-resend
          try {
            const { devCode: dc } = await sendVerificationCode(email);
            if (dc) {
              setDevCode(dc);
              sessionStorage.setItem("dilly_dev_code", dc);
            }
            startResendCooldown();
          } catch {
            // ignore auto-resend failure
          }
        } else if (msg.toLowerCase().includes("too many") || msg.toLowerCase().includes("attempts")) {
          friendly = "Too many attempts. Try again in an hour.";
          type = "too_many";
        }
        setError(friendly);
        setErrorType(type);
        setDigits("");
        triggerShake();
        inputRef.current?.focus();
      } finally {
        setLoading(false);
      }
    },
    [email, loading, router, isReturning] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function triggerShake() {
    setShaking(true);
    setTimeout(() => setShaking(false), 350);
  }

  function startResendCooldown() {
    setResendCooldown(RESEND_COOLDOWN);
    const iv = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          clearInterval(iv);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 6);
    setDigits(raw);
    setError(null);
    setErrorType(null);
    if (raw.length === 6) {
      submitCode(raw);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && digits.length === 0) {
      // nothing to clear
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || errorType === "too_many") return;
    setError(null);
    setErrorType(null);
    setDigits("");
    try {
      const { devCode: dc } = await sendVerificationCode(email);
      if (dc) {
        setDevCode(dc);
        sessionStorage.setItem("dilly_dev_code", dc);
      }
      startResendCooldown();
      inputRef.current?.focus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't resend. Try again.");
    }
  }

  const isError = !!error;
  const allFilled = digits.length === 6;

  // Box styles
  function boxStyle(i: number): React.CSSProperties {
    const isFilled = i < digits.length;
    const isActive = i === digits.length && !allFilled;

    if (isError) {
      return {
        width: "100%",
        height: "42px",
        background: "var(--cdim)",
        border: "1px solid var(--coral)",
        borderRadius: "9px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "17px",
        fontWeight: 600,
        color: "var(--t1)",
        transition: "border-color 0.12s, background 0.12s",
      };
    }
    if (isActive) {
      return {
        width: "100%",
        height: "42px",
        background: "var(--golddim)",
        border: "1px solid var(--goldbdr)",
        borderRadius: "9px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "17px",
        fontWeight: 600,
        color: "var(--t1)",
        transition: "border-color 0.12s, background 0.12s",
      };
    }
    return {
      width: "100%",
      height: "42px",
      background: isFilled ? "var(--s3)" : "var(--s3)",
      border: "1px solid var(--b2)",
      borderRadius: "9px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "17px",
      fontWeight: 600,
      color: "var(--t1)",
      transition: "border-color 0.12s, background 0.12s",
    };
  }

  return (
    <div className="screen">
      <ProgressBar step={1} total={6} />

      {/* Vertically centered content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 22px",
          gap: "0",
        }}
      >
        {/* Email icon tile */}
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "14px",
            background: "var(--golddim)",
            border: "1px solid var(--goldbdr)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "16px",
          }}
        >
          <EmailIcon />
        </div>

        {/* Heading */}
        <p
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--t1)",
            textAlign: "center",
            marginBottom: "6px",
          }}
        >
          {isReturning ? "Welcome back" : "Check your inbox"}
        </p>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "11px",
            color: "var(--t2)",
            textAlign: "center",
            marginBottom: "4px",
          }}
        >
          {isReturning ? "Enter your .edu email to get back in" : "6-digit code sent to"}
        </p>
        <p
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--gold)",
            textAlign: "center",
            marginBottom: "22px",
          }}
        >
          {email}
        </p>

        {/* 6 boxes + hidden input */}
        <div style={{ position: "relative", width: "100%", marginBottom: "18px" }}>
          {/* Boxes row */}
          <div
            ref={boxesRef}
            className={shaking ? "shake" : ""}
            style={{ display: "flex", gap: "6px", width: "100%" }}
            onClick={() => inputRef.current?.focus()}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={boxStyle(i)}>
                {digits[i] || ""}
              </div>
            ))}
          </div>

          {/* Hidden input overlay */}
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            maxLength={6}
            value={digits}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={loading}
            autoComplete="one-time-code"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "text",
              fontSize: "16px", // prevents iOS zoom
            }}
          />
        </div>

        {/* Error text */}
        {error && (
          <p
            style={{
              fontSize: "11px",
              color: "var(--coral)",
              textAlign: "center",
              marginBottom: "12px",
            }}
          >
            {error}
          </p>
        )}

        {/* Dev code */}
        {DEV_MODE && devCode && (
          <p
            style={{
              fontSize: "10px",
              color: "var(--t3)",
              textAlign: "center",
              marginBottom: "12px",
              fontFamily: "monospace",
            }}
          >
            Dev: {devCode}
          </p>
        )}

        {/* Verify button */}
        <button
          onClick={() => submitCode(digits)}
          disabled={!allFilled || loading}
          style={{
            width: "100%",
            background: allFilled && !loading ? "var(--gold)" : "var(--s3)",
            color: allFilled && !loading ? "#080809" : "var(--t3)",
            border: "none",
            borderRadius: "12px",
            padding: "17px",
            fontSize: "1rem",
            fontWeight: 700,
            cursor: allFilled && !loading ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "background 0.15s, color 0.15s",
            marginBottom: "24px",
            pointerEvents: !allFilled || loading ? "none" : "auto",
          }}
        >
          {loading ? (
            <>
              <Spinner />
              Verifying…
            </>
          ) : (
            "Verify and continue →"
          )}
        </button>

        {/* Bottom links */}
        <div style={{ display: "flex", justifyContent: "center", gap: "20px" }}>
          {errorType !== "too_many" && (
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0}
              style={{
                background: "none",
                border: "none",
                fontSize: "11px",
                fontWeight: 600,
                color: resendCooldown > 0 ? "var(--t3)" : "var(--gold)",
                cursor: resendCooldown > 0 ? "default" : "pointer",
                padding: 0,
              }}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
            </button>
          )}
          <button
            onClick={() => {
              sessionStorage.removeItem("dilly_pending_email");
              sessionStorage.removeItem("dilly_dev_code");
              router.push("/");
            }}
            style={{
              background: "none",
              border: "none",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--gold)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Different email
          </button>
        </div>
      </div>
    </div>
  );
}
