"use client";

import { useRef } from "react";

type AuditUploadZoneProps = {
  onFileSelect: (file: File) => void;
  onPasteClick?: () => void;
};

const UploadArrowIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--green)" }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const ClipboardIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--blue)" }}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--t3)" }}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

export function AuditUploadZone({ onFileSelect, onPasteClick }: AuditUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-0">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        onChange={handleChange}
        className="hidden"
        aria-hidden
      />
      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => e.key === "Enter" && openPicker()}
        className="flex flex-col items-center gap-[10px] cursor-pointer transition-opacity hover:opacity-95 active:opacity-90 outline-none"
        style={{
          background: "var(--s2)",
          borderRadius: 20,
          padding: "24px 16px",
          border: "1.5px dashed rgba(255,255,255,0.10)",
        }}
      >
        <div
          className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0"
          style={{ background: "var(--gdim)" }}
        >
          <UploadArrowIcon />
        </div>
        <span className="text-[14px] font-semibold" style={{ color: "var(--t1)", letterSpacing: "-0.01em" }}>
          Upload resume
        </span>
        <span className="text-[11px] font-normal text-center leading-snug" style={{ color: "var(--t3)" }}>
          PDF or Word · your latest version
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openPicker();
          }}
          className="shrink-0 outline-none"
          style={{
            background: "var(--green)",
            color: "#05140A",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            padding: "10px 22px",
            border: "none",
          }}
        >
          Choose file
        </button>
      </div>

      {/* or paste text */}
      <div className="flex items-center gap-3 my-5 w-full">
        <div className="flex-1 h-px" style={{ background: "var(--b1)" }} />
        <span className="text-[11px] font-medium shrink-0" style={{ color: "var(--t3)" }}>
          or paste text
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--b1)" }} />
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onPasteClick?.();
        }}
        className="flex flex-row items-center gap-3 w-full text-left cursor-pointer transition-opacity hover:opacity-95 active:opacity-90 outline-none"
        style={{
          background: "var(--s2)",
          borderRadius: 14,
          padding: "12px 14px",
        }}
      >
        <div
          className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
          style={{ background: "var(--bdim)" }}
        >
          <ClipboardIcon />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium" style={{ color: "var(--t1)" }}>
            Paste resume text
          </p>
          <p className="text-[11px] font-normal mt-0.5" style={{ color: "var(--t3)" }}>
            Copy from Word, Notion, or Google Docs
          </p>
        </div>
        <ChevronRight />
      </button>
    </div>
  );
}
