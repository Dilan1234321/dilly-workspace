"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE, RECRUITER_API_KEY_STORAGE } from "@/lib/dillyUtils";

function getKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(RECRUITER_API_KEY_STORAGE);
}

export type NoteEntry = { text: string; at: number };

export function useRecruiterNotes(candidateId: string | null) {
  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchNotes = useCallback(async () => {
    if (!candidateId) {
      setEntries([]);
      return;
    }
    const key = getKey();
    const headers: Record<string, string> = {};
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/recruiter/candidates/${candidateId}/notes`, { headers });
      if (res.ok) {
        const d = await res.json();
        const list = Array.isArray(d.entries) ? d.entries : [];
        setEntries(list.map((e: { text?: string; note?: string; at?: number }) => ({
          text: (e.text || e.note || "").trim(),
          at: typeof e.at === "number" ? e.at : 0,
        })).filter((e: NoteEntry) => e.text));
      } else {
        setEntries([]);
      }
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const addEntry = useCallback(
    async (text: string) => {
      if (!candidateId) return false;
      const trimmed = (text || "").trim();
      if (!trimmed) return false;
      const key = getKey();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) {
        headers["X-Recruiter-API-Key"] = key;
        headers["Authorization"] = `Bearer ${key}`;
      }
      setSaving(true);
      try {
        const res = await fetch(`${API_BASE}/recruiter/candidates/${candidateId}/notes`, {
          method: "POST",
          headers,
          body: JSON.stringify({ note: trimmed }),
        });
        if (res.ok) {
          const d = await res.json();
          const entry = d.entry;
          if (entry && entry.text) {
            setEntries((prev) => [...prev, { text: entry.text, at: entry.at ?? Date.now() / 1000 }]);
          }
          return true;
        }
      } catch {
        // ignore
      } finally {
        setSaving(false);
      }
      return false;
    },
    [candidateId]
  );

  return { entries, loading, saving, addEntry, refresh: fetchNotes };
}
