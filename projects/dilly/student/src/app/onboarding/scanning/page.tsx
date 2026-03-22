"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/auth";
import { getPendingFile } from "@/lib/upload-store";
import DillyAvatar from "@/components/shared/DillyAvatar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type StepState = "pending" | "active" | "done";

export default function ScanningPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [track,     setTrack]     = useState("");
  const [steps,     setSteps]     = useState<StepState[]>(Array(5).fill("pending") as StepState[]);
  const [progress,  setProgress]  = useState(0);

  // Refs so setTimeout closures always see the latest values without re-registering
  const apiReadyRef  = useRef(false);
  const holdingRef   = useRef(false);
  const hasCalledApi = useRef(false); // StrictMode double-invoke guard

  // ── Pull session data ────────────────────────────────────────────────────

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    const name = sessionStorage.getItem("dilly_onboarding_name") || "";
    const t    = sessionStorage.getItem("dilly_onboarding_track") || "";
    setFirstName(name.trim().split(/\s+/)[0] || "");
    setTrack(t);
  }, [router]);

  // ── Effect 1: step animation — always runs, independent of API ───────────

  useEffect(() => {
    const T: ReturnType<typeof setTimeout>[] = [];

    T.push(setTimeout(() => {
      setSteps(s => s.map((v, i) => i === 0 ? "active" : v));
      setProgress(8);
    }, 400));

    T.push(setTimeout(() => {
      setSteps(s => s.map((v, i) => i === 0 ? "done" : i === 1 ? "active" : v));
      setProgress(28);
    }, 1600));

    T.push(setTimeout(() => {
      setSteps(s => s.map((v, i) => i === 1 ? "done" : i === 2 ? "active" : v));
      setProgress(52);
    }, 3200));

    T.push(setTimeout(() => {
      setSteps(s => s.map((v, i) => i === 2 ? "done" : i === 3 ? "active" : v));
      setProgress(76);
    }, 5800));

    T.push(setTimeout(() => {
      setSteps(s => s.map((v, i) => i === 3 ? "done" : i === 4 ? "active" : v));
      setProgress(88);
    }, 8400));

    T.push(setTimeout(() => {
      if (apiReadyRef.current) {
        setSteps(["done", "done", "done", "done", "done"]);
        setProgress(100);
      } else {
        holdingRef.current = true;
      }
    }, 11000));

    T.push(setTimeout(() => {
      if (apiReadyRef.current) {
        router.push("/onboarding/results");
      }
    }, 11600));

    return () => T.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 2: API call — fires exactly once via ref guard ─────────────────

  useEffect(() => {
    if (hasCalledApi.current) return;
    hasCalledApi.current = true;

    const runApi = async () => {
      try {
        const file      = getPendingFile();
        const token     = getToken();
        const formData  = new FormData();

        if (file) formData.append("file", file);

        const major     = sessionStorage.getItem("dilly_onboarding_major");
        const t         = sessionStorage.getItem("dilly_onboarding_track");
        const appTarget = sessionStorage.getItem("dilly_onboarding_target");

        if (major)     formData.append("major",              major);
        if (t)         formData.append("track",              t);
        if (appTarget) formData.append("application_target", appTarget);

        const res    = await fetch(`${API_URL}/audit/first-run`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}` },
          body:    formData,
        });
        const result = await res.json();
        if (!res.ok) {
          // Non-200 (403, 422, 500…) — store as error so results page handles it
          sessionStorage.setItem("dilly_audit_result", JSON.stringify({ error: true, status: res.status, detail: result.detail }));
        } else {
          sessionStorage.setItem("dilly_audit_result", JSON.stringify(result));
        }
      } catch {
        sessionStorage.setItem("dilly_audit_result", JSON.stringify({ error: true }));
      }

      apiReadyRef.current = true;

      if (holdingRef.current) {
        setSteps(["done", "done", "done", "done", "done"]);
        setProgress(100);
        setTimeout(() => router.push("/onboarding/results"), 600);
      }
    };

    runApi();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Step labels ──────────────────────────────────────────────────────────

  const stepLabels = [
    "Extracting your experience",
    `${track || "Your"} track confirmed`,
    "Measuring your Grit score",
    "Comparing to your peers",
    "Building your recommendations",
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 22px",
      }}
    >
      {/* ── Dilly orb ────────────────────────────────────────────────────── */}
      <div style={{ width: "130px", height: "130px", position: "relative", marginBottom: "22px" }}>

        {/* Three ripple rings */}
        {[0, 0.8, 1.6].map((delay) => (
          <div
            key={delay}
            style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              border: "1px solid rgba(201,168,76,0)",
              animation: `rpl 2.4s ease-out ${delay}s infinite`,
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Inner orb */}
        <div
          style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "108px", height: "108px", borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #2a1e00, #0d0900)",
            border: "1px solid rgba(201,168,76,0.35)",
            boxShadow: "0 0 20px rgba(201,168,76,0.12), inset 0 1px 0 rgba(201,168,76,0.2)",
            overflow: "hidden", zIndex: 2,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <DillyAvatar size={96} />
        </div>
      </div>

      {/* ── Title ────────────────────────────────────────────────────────── */}
      <h1
        className="font-playfair"
        style={{
          fontSize: "18px", fontWeight: 700, color: "var(--t1)",
          textAlign: "center", marginBottom: "5px",
        }}
      >
        {firstName ? `Dilly is on it, ${firstName}.` : "Dilly is on it."}
      </h1>

      <p style={{
        fontSize: "11px", color: "var(--t2)", textAlign: "center",
        lineHeight: 1.55, marginBottom: "18px",
      }}>
        Reading your resume against real hiring criteria.
      </p>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div style={{
        width: "100%", height: "2.5px",
        background: "var(--b1)", borderRadius: "999px",
        overflow: "hidden", marginBottom: "10px",
      }}>
        <div style={{
          height: "100%",
          background: "var(--gold)",
          borderRadius: "999px",
          width: `${progress}%`,
          transition: "width 0.6s ease-out",
        }} />
      </div>

      {/* ── Step rows ────────────────────────────────────────────────────── */}
      <div style={{
        width: "100%",
        display: "flex", flexDirection: "column", gap: "5px",
        marginBottom: "12px",
      }}>
        {stepLabels.map((label, i) => {
          const state    = steps[i];
          const isActive = state === "active";
          const isDone   = state === "done";
          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: isActive ? "rgba(201,168,76,0.08)" : "var(--s2)",
                border:     isActive ? "1px solid rgba(201,168,76,0.15)" : "1px solid transparent",
                borderRadius: "9px",
                padding: "7px 10px",
                transition: "background 0.3s, border-color 0.3s",
              }}
            >
              {/* Status dot */}
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
                background: isDone   ? "var(--green)"
                          : isActive ? "var(--gold)"
                          : "rgba(255,255,255,0.08)",
                transition: "background 0.3s",
              }} />

              {/* Label */}
              <p style={{
                fontSize: "11px", fontWeight: 500,
                color: isDone   ? "var(--t2)"
                     : isActive ? "var(--t1)"
                     : "var(--t3)",
                transition: "color 0.3s",
              }}>
                {label}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Commitment line ───────────────────────────────────────────────── */}
      <p style={{ fontSize: "10px", color: "var(--t3)", textAlign: "center", lineHeight: 1.55 }}>
        Every audit, every improvement —{" "}
        <span style={{ color: "var(--t2)", fontWeight: 600 }}>
          saved to your profile forever.
        </span>
      </p>
    </div>
  );
}
