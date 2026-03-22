"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/auth";
import { setPendingFile } from "@/lib/upload-store";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

function truncateFilename(name: string, max = 28): string {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf(".");
  const extPart = ext !== -1 ? name.slice(ext) : "";
  return name.slice(0, max - extPart.length - 1) + "…" + extPart;
}

function isValidFile(file: File): "ok" | "format" | "size" {
  const name = file.name.toLowerCase();
  const validExt = name.endsWith(".pdf") || name.endsWith(".docx");
  if (!validExt) return "format";
  if (file.size > 10 * 1024 * 1024) return "size";
  return "ok";
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type ZoneState = "idle" | "dragover" | "selected" | "error_format" | "error_size";

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [zoneState, setZoneState] = useState<ZoneState>("idle");
  const [file, setFile]           = useState<File | null>(null);
  const [dragDepth, setDragDepth] = useState(0); // track nested drag enter/leave

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    const t = sessionStorage.getItem("dilly_onboarding_track") || "";
    if (!t) { router.replace("/onboarding/profile"); return; }
  }, [router]);

  // ── File processing ──────────────────────────────────────────────────────

  const processFile = useCallback((f: File) => {
    const result = isValidFile(f);
    if (result === "ok") {
      setFile(f);
      setZoneState("selected");
      setPendingFile(f);
      sessionStorage.setItem("dilly_onboarding_file", f.name);
    } else if (result === "format") {
      setFile(null);
      setZoneState("error_format");
      setPendingFile(null);
      sessionStorage.removeItem("dilly_onboarding_file");
    } else {
      setFile(null);
      setZoneState("error_size");
      setPendingFile(null);
      sessionStorage.removeItem("dilly_onboarding_file");
    }
  }, []);

  // ── Input change ─────────────────────────────────────────────────────────

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  // ── Drag events ──────────────────────────────────────────────────────────

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setDragDepth((d) => {
      if (d === 0) setZoneState((s) => s === "selected" ? "selected" : "dragover");
      return d + 1;
    });
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragDepth((d) => {
      const next = d - 1;
      if (next === 0) setZoneState((s) => s === "dragover" ? "idle" : s);
      return next;
    });
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragDepth(0);
    const f = e.dataTransfer.files?.[0];
    if (f) processFile(f);
  }

  // ── Zone appearance ───────────────────────────────────────────────────────

  const zoneBorder = (() => {
    switch (zoneState) {
      case "selected":  return "1.5px solid var(--gbdr)";
      case "dragover":  return "1.5px dashed rgba(201,168,76,0.8)";
      case "error_format":
      case "error_size": return "1.5px solid rgba(255,69,58,0.55)";
      default:          return "1.5px dashed rgba(201,168,76,0.28)";
    }
  })();

  const zoneBg = (() => {
    switch (zoneState) {
      case "selected": return "var(--gdim)";
      case "error_format":
      case "error_size": return "var(--cdim)";
      default: return "var(--s3)";
    }
  })();

  const isError = zoneState === "error_format" || zoneState === "error_size";
  const isSelected = zoneState === "selected";

  // ── CTA ───────────────────────────────────────────────────────────────────

  function handleContinue() {
    // Always proceed — file is optional
    if (!file) setPendingFile(null);
    router.push("/onboarding/scanning");
  }

  return (
    <div className="screen">
      {/* Back button */}
      <button
        onClick={() => router.push("/onboarding/anticipation")}
        style={{
          background: "none", border: "none", padding: "16px 22px 0",
          fontSize: "13px", fontWeight: 500, color: "var(--blue)",
          cursor: "pointer", alignSelf: "flex-start",
        }}
      >
        ← Back
      </button>

      {/* Progress bar */}
      <div style={{ display: "flex", gap: "3px", padding: "10px 22px 0" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1, height: "2.5px", borderRadius: "999px",
              background:
                i < 3 ? "var(--gold)"
                : i === 3 ? "rgba(201,168,76,0.4)"
                : "rgba(255,255,255,0.08)",
            }}
          />
        ))}
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1, overflowY: "auto", padding: "0 22px 24px",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ paddingTop: "40px", marginBottom: "12px" }}>
          <p style={{
            fontSize: "8px", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.14em", color: "var(--gold)", marginBottom: "7px",
          }}>
            Step 2 of 2 · Your resume
          </p>
          <h1
            className="font-playfair"
            style={{
              fontSize: "22px", fontWeight: 700, color: "var(--t1)",
              lineHeight: 1.2, marginBottom: "5px", whiteSpace: "pre-line",
            }}
          >
            {"Your resume goes in.\nYour future comes out."}
          </h1>
          <p style={{ fontSize: "11px", color: "var(--t2)", lineHeight: 1.55 }}>
            Dilly reads it the way a recruiter does and tells you exactly where you stand.
          </p>
        </div>

        {/* Upload zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            flex: 1,
            border: zoneBorder,
            borderRadius: "18px",
            background: zoneBg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "16px",
            cursor: "pointer",
            marginBottom: "16px",
            transition: "border-color 150ms, background 150ms",
            minHeight: "180px",
          }}
        >
          {/* Icon tile */}
          <div style={{
            width: "46px", height: "46px", borderRadius: "14px",
            background: isError ? "var(--cdim)" : isSelected ? "var(--gdim)" : "var(--golddim)",
            border: `1px solid ${isError ? "rgba(255,69,58,0.4)" : isSelected ? "var(--gbdr)" : "var(--goldbdr)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isError ? <XIcon /> : isSelected ? <CheckIcon /> : <UploadIcon />}
          </div>

          {/* Text */}
          {isSelected && file ? (
            <>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", textAlign: "center" }}>
                {truncateFilename(file.name)}
              </p>
              <p style={{ fontSize: "10px", color: "var(--t3)", textAlign: "center" }}>
                {formatBytes(file.size)}
              </p>
              <p style={{ fontSize: "10px", color: "var(--t3)", textAlign: "center" }}>
                Tap to change
              </p>
            </>
          ) : isError ? (
            <>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--coral)", textAlign: "center" }}>
                {zoneState === "error_size"
                  ? "That file is too large (max 10MB)"
                  : "That file type isn't supported"}
              </p>
              <p style={{ fontSize: "10px", color: "var(--t3)", textAlign: "center" }}>
                Upload a PDF or DOCX file
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", textAlign: "center" }}>
                Upload your resume
              </p>
              <p style={{ fontSize: "10px", color: "var(--t3)", textAlign: "center" }}>
                Tap to choose or drag and drop
              </p>
              {/* Format pills */}
              <div style={{ display: "flex", gap: "5px", justifyContent: "center" }}>
                {["PDF", "DOCX"].map((fmt) => (
                  <span
                    key={fmt}
                    style={{
                      background: "var(--s4)", border: "1px solid var(--b1)",
                      borderRadius: "999px", padding: "2px 7px",
                      fontSize: "9px", fontWeight: 600, color: "var(--t3)",
                    }}
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleInputChange}
          style={{ display: "none" }}
        />

        {/* CTA — always active */}
        <button
          onClick={handleContinue}
          style={{
            width: "100%", background: "var(--gold)", color: "#1A1400",
            border: "none", borderRadius: "13px", padding: "13px",
            fontSize: "13px", fontWeight: 700, cursor: "pointer",
            letterSpacing: "-0.01em",
          }}
        >
          See my Dilly score →
        </button>
      </div>
    </div>
  );
}
