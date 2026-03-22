"use client";

import { useEffect, useState } from "react";
import { API_BASE, AUTH_TOKEN_KEY } from "@/lib/dillyUtils";
import type { JobMatch } from "@/types/jobsPage";

type Props = {
  job: JobMatch | null;
  onClose: () => void;
  onSent: () => void;
};

export function ApplyModal({ job, onClose, onSent }: Props) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [slide, setSlide] = useState(false);

  useEffect(() => {
    if (!job) return;
    setNote("");
    setSent(false);
    setSending(false);
    setSlide(false);
    const t = requestAnimationFrame(() => setSlide(true));
    return () => cancelAnimationFrame(t);
  }, [job]);

  if (!job) return null;

  const send = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/apply-through-dilly`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ job_id: job.id, note: note.trim() || undefined }),
      });
      if (res.ok) {
        setSent(true);
        onSent();
        setTimeout(() => onClose(), 1800);
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex flex-col justify-end z-[120]"
      style={{ background: "rgba(8,8,9,0.92)" }}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] mx-auto"
        style={{
          background: "var(--s2)",
          borderRadius: "20px 20px 0 0",
          padding: "20px 20px 36px",
          transform: slide ? "translateY(0)" : "translateY(100%)",
          transition: "transform 280ms ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-dilly-title"
      >
        <div className="flex flex-row justify-between items-start mb-3">
          <h2 id="apply-dilly-title" className="font-bold" style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>
            Apply via Dilly
          </h2>
          <button type="button" onClick={onClose} className="border-0 bg-transparent" style={{ fontSize: 11, color: "var(--t3)" }}>
            ✕
          </button>
        </div>
        <p className="mb-3.5" style={{ fontSize: 12, color: "var(--t2)", marginBottom: 14 }}>
          {job.title} at {job.company}
        </p>
        {!sent ? (
          <>
            <label className="block uppercase font-bold mb-1" style={{ fontSize: 9, color: "var(--t3)", marginBottom: 4 }}>
              Add a note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full border resize-none outline-none"
              style={{
                background: "var(--s3)",
                border: "1px solid var(--b2)",
                borderRadius: 12,
                padding: "11px 13px",
                fontSize: 13,
                color: "var(--t1)",
                minHeight: 60,
              }}
            />
            <button
              type="button"
              disabled={sending}
              onClick={() => void send()}
              className="w-full border-0 font-bold mt-3"
              style={{
                background: "var(--green)",
                borderRadius: 11,
                padding: 13,
                fontSize: 13,
                fontWeight: 700,
                color: "#051A0B",
                marginTop: 12,
              }}
            >
              {sending ? "Sending…" : "Send application →"}
            </button>
          </>
        ) : (
          <div className="text-center py-2">
            <p className="font-bold" style={{ fontSize: 14, color: "var(--green)" }}>
              ✓ Application sent.
            </p>
            <p className="mt-1" style={{ fontSize: 12, color: "var(--t2)" }}>
              Dilly added it to your tracker.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
