"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { LoaderOne } from "@/components/ui/loader-one";

const GPA_LIST_THRESHOLD = 3.5;

/** User-facing messages for parser warnings. Mercor-quality: clear, accurate, no jargon. */
const WARNING_MESSAGES: Record<string, string> = {
  no_gpa_found:
    "We couldn't find a cumulative GPA on this transcript. Your transcript is saved; add your GPA on your resume and we'll use it for scoring.",
  gpa_not_labeled_cumulative:
    "We found a GPA but it wasn't labeled as \"cumulative\" or \"overall.\" If this is your term GPA, consider uploading a transcript that shows cumulative GPA for the most accurate advice.",
  multiple_gpa_values_used_highest:
    "We found multiple GPA values and used the highest. If your transcript lists both term and cumulative, we may have picked the right one—double-check the number below.",
  pdf_no_text_extracted:
    "We couldn't read text from this PDF (e.g. scanned image). Upload an official digital transcript PDF, or add your GPA on your resume.",
  pdf_extract_failed:
    "We couldn't process this PDF. Try uploading again or use an official transcript from your school portal.",
  pdf_too_long_max_25_pages_parsed:
    "Transcript is long; we parsed the first 25 pages. If your GPA is on a later page, it may be missing.",
  empty_text:
    "No text was found. Upload a valid transcript PDF.",
  pypdf_not_available:
    "Transcript parsing is temporarily unavailable. Try again later.",
};

type TranscriptCourse = {
  code?: string | null;
  name?: string | null;
  term?: string | null;
  credits?: number | null;
  grade?: string | null;
};

type ProfileWithTranscript = {
  transcript_uploaded_at?: string | null;
  transcript_gpa?: number | null;
  transcript_bcpm_gpa?: number | null;
  transcript_courses?: TranscriptCourse[];
  transcript_honors?: string[];
  transcript_major?: string | null;
  transcript_minor?: string | null;
  transcript_warnings?: string[];
};

type Props = {
  appProfile: ProfileWithTranscript | null;
  onProfileUpdated: () => void;
  apiBase: string;
  authTokenKey: string;
};

export function TranscriptSection({ appProfile, onProfileUpdated, apiBase, authTokenKey }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasTranscript = !!(
    appProfile?.transcript_uploaded_at ||
    (appProfile?.transcript_gpa != null) ||
    (Array.isArray(appProfile?.transcript_courses) && appProfile.transcript_courses.length > 0)
  );
  const courses = Array.isArray(appProfile?.transcript_courses) ? appProfile.transcript_courses : [];
  const gpa = appProfile?.transcript_gpa;
  const bcpmGpa = appProfile?.transcript_bcpm_gpa;
  const honors = Array.isArray(appProfile?.transcript_honors) ? appProfile.transcript_honors : [];
  const warnings = Array.isArray(appProfile?.transcript_warnings) ? appProfile.transcript_warnings : [];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Please upload a PDF transcript.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File must be under 10MB.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(authTokenKey) : null;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${apiBase}/profile/transcript`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError((data.detail as string) || "Upload failed. Try again.");
        return;
      }
      onProfileUpdated();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove your transcript? Dilly will stop using it for GPA and course data.")) return;
    setDeleting(true);
    setUploadError(null);
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(authTokenKey) : null;
    try {
      const res = await fetch(`${apiBase}/profile/transcript`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) onProfileUpdated();
    } finally {
      setDeleting(false);
    }
  };

  const gpaAdvice =
    gpa != null
      ? gpa < GPA_LIST_THRESHOLD
        ? `Your GPA is ${gpa.toFixed(2)}. We recommend not putting GPA on your resume when it's below ${GPA_LIST_THRESHOLD}—many recruiters filter by that. Focus on highlighting your experience and coursework instead.`
        : `Your GPA is ${gpa.toFixed(2)}—definitely list it on your resume. It's a strong signal for recruiters.`
      : null;

  const warningMessages = warnings
    .map((w) => WARNING_MESSAGES[w] || (w.replace(/_/g, " ")))
    .filter(Boolean);

  return (
    <div className="border-t border-[var(--ut-border)] pt-4 mt-4">
      <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-2 block">Transcript (optional)</label>
      <p className="text-xs text-slate-400 mb-3">
        Upload your official transcript PDF. We use your real GPA for scoring and tell you whether to list it on your resume. Courses and grades are stored read-only—you can&apos;t edit them here.
      </p>

      {!hasTranscript ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleUpload}
            className="hidden"
            aria-hidden
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-lg border-[var(--ut-border)] text-slate-200"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <>
                <LoaderOne className="w-4 h-4 mr-2 animate-spin" />
                Uploading…
              </>
            ) : (
              "Upload transcript (PDF)"
            )}
          </Button>
          {uploadError && <p className="text-red-400 text-xs mt-2" role="alert">{uploadError}</p>}
        </>
      ) : (
        <>
          {warningMessages.length > 0 && (
            <div className="mb-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/90 mb-1">Note</p>
              <ul className="text-slate-300 text-xs space-y-1">
                {warningMessages.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          {gpa != null && (
            <div className="mb-3 p-3 rounded-lg border border-[var(--ut-border)] bg-slate-800/30">
              <p className="text-slate-200 font-medium text-sm">GPA from transcript: {gpa.toFixed(2)}</p>
              {bcpmGpa != null && <p className="text-slate-400 text-xs mt-0.5">Science / BCPM: {bcpmGpa.toFixed(2)}</p>}
              {gpaAdvice && <p className="text-slate-300 text-xs mt-2">{gpaAdvice}</p>}
            </div>
          )}
          {hasTranscript && gpa == null && warningMessages.length === 0 && (
            <p className="text-slate-400 text-xs mb-3">Transcript uploaded. We couldn&apos;t extract a GPA from it—add your GPA on your resume and we&apos;ll use it for scoring.</p>
          )}
          {honors.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Honors (from transcript)</p>
              <ul className="text-slate-300 text-xs space-y-0.5">
                {honors.slice(0, 5).map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          {courses.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Courses &amp; grades (read-only)</p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--ut-border)] bg-slate-800/30 divide-y divide-slate-700/50">
                {courses.slice(0, 100).map((c, i) => (
                  <div key={i} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-200 truncate">{c.code || c.name || "—"}</span>
                    <span className="text-slate-400 shrink-0">{c.grade ?? "—"}</span>
                  </div>
                ))}
              </div>
              {courses.length > 100 && <p className="text-slate-500 text-[10px] mt-1">Showing first 100 of {courses.length} courses.</p>}
            </div>
          )}
          <Button type="button" variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200" disabled={deleting} onClick={handleDelete}>
            {deleting ? "Removing…" : "Remove transcript"}
          </Button>
        </>
      )}
    </div>
  );
}
