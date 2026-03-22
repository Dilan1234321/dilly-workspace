"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE, RECRUITER_API_KEY_STORAGE } from "@/lib/dillyUtils";

export type BookmarksData = {
  bookmarks: string[];
  collections: Record<string, string[]>;
};

function getKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(RECRUITER_API_KEY_STORAGE);
}

export function useRecruiterBookmarks() {
  const [data, setData] = useState<BookmarksData>({ bookmarks: [], collections: {} });
  const [refresh, setRefresh] = useState(0);

  const fetchBookmarks = useCallback(async () => {
    const key = getKey();
    const headers: Record<string, string> = {};
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      const res = await fetch(`${API_BASE}/recruiter/bookmarks`, { headers });
      if (res.ok) {
        const d = await res.json();
        setData({
          bookmarks: Array.isArray(d.bookmarks) ? d.bookmarks : [],
          collections: d.collections && typeof d.collections === "object" ? d.collections : {},
        });
      }
    } catch {
      setData({ bookmarks: [], collections: {} });
    }
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks, refresh]);

  const addBookmark = useCallback(async (candidateId: string) => {
    const key = getKey();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      const res = await fetch(`${API_BASE}/recruiter/bookmarks`, {
        method: "POST",
        headers,
        body: JSON.stringify({ candidate_id: candidateId }),
      });
      if (res.ok) {
        setRefresh((r) => r + 1);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const removeBookmark = useCallback(async (candidateId: string) => {
    const key = getKey();
    const headers: Record<string, string> = {};
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      const res = await fetch(`${API_BASE}/recruiter/bookmarks/${encodeURIComponent(candidateId)}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        setRefresh((r) => r + 1);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const toggleBookmark = useCallback(
    async (candidateId: string) => {
      const isCurrentlyBookmarked = data.bookmarks.includes(candidateId);
      if (isCurrentlyBookmarked) {
        return removeBookmark(candidateId);
      }
      return addBookmark(candidateId);
    },
    [data.bookmarks, addBookmark, removeBookmark]
  );

  const removeFromCollection = useCallback(async (collectionName: string, candidateId: string) => {
    const key = getKey();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      const res = await fetch(`${API_BASE}/recruiter/collections/remove`, {
        method: "POST",
        headers,
        body: JSON.stringify({ collection_name: collectionName, candidate_id: candidateId }),
      });
      if (res.ok) {
        setRefresh((r) => r + 1);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const addToCollection = useCallback(async (collectionName: string, candidateId: string) => {
    const key = getKey();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      const res = await fetch(`${API_BASE}/recruiter/collections/add`, {
        method: "POST",
        headers,
        body: JSON.stringify({ collection_name: collectionName, candidate_id: candidateId }),
      });
      if (res.ok) {
        setRefresh((r) => r + 1);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const createCollection = useCallback(async (name: string) => {
    const key = getKey();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      const res = await fetch(`${API_BASE}/recruiter/collections`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setRefresh((r) => r + 1);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const renameCollection = useCallback(async (oldName: string, newName: string) => {
    const key = getKey();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      const res = await fetch(`${API_BASE}/recruiter/collections`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ old_name: oldName, new_name: newName.trim() }),
      });
      if (res.ok) {
        setRefresh((r) => r + 1);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const deleteCollection = useCallback(async (name: string) => {
    const key = getKey();
    const headers: Record<string, string> = {};
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }
    try {
      const res = await fetch(`${API_BASE}/recruiter/collections?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        setRefresh((r) => r + 1);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const isBookmarked = useCallback(
    (candidateId: string) => data.bookmarks.includes(candidateId),
    [data.bookmarks]
  );

  /** True if candidate is bookmarked OR in any collection (for gold bookmark styling). */
  const isSaved = useCallback(
    (candidateId: string) =>
      data.bookmarks.includes(candidateId) ||
      Object.values(data.collections).some((ids) => ids.includes(candidateId)),
    [data.bookmarks, data.collections]
  );

  return {
    bookmarks: data.bookmarks,
    collections: data.collections,
    addBookmark,
    removeBookmark,
    toggleBookmark,
    addToCollection,
    removeFromCollection,
    createCollection,
    renameCollection,
    deleteCollection,
    isBookmarked,
    isSaved,
    refresh: () => setRefresh((r) => r + 1),
  };
}
