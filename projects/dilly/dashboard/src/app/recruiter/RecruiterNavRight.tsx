"use client";

import { useState, useEffect } from "react";
import { API_BASE, RECRUITER_API_KEY_STORAGE } from "@/lib/dillyUtils";

function getRecruiterKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(RECRUITER_API_KEY_STORAGE);
}

function setRecruiterKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(RECRUITER_API_KEY_STORAGE, key);
}

export function RecruiterNavRight() {
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [serverHint, setServerHint] = useState<string | null>(null);

  useEffect(() => {
    setHasKey(!!getRecruiterKey());
    const onKeyChange = () => setHasKey(!!getRecruiterKey());
    window.addEventListener("recruiter-key-changed", onKeyChange);
    return () => window.removeEventListener("recruiter-key-changed", onKeyChange);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/recruiter/check`)
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        setServerConfigured(!!data?.recruiter_configured);
        setServerHint(typeof data?.hint === "string" ? data.hint : null);
      })
      .catch(() => setServerConfigured(null));
  }, []);

  const handleSaveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    setRecruiterKey(k);
    setKeyInput("");
    setHasKey(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    window.dispatchEvent(new CustomEvent("recruiter-key-changed"));
  };

  const handleSignOut = () => {
    localStorage.removeItem(RECRUITER_API_KEY_STORAGE);
    setKeyInput("");
    window.location.href = "/recruiter";
  };

  return (
    <div className="dr-nav-right">
      {serverConfigured === false && (
        <span
          className="dr-nav-server-hint"
          title={
            serverHint ||
            "Add RECRUITER_API_KEY to .env at workspace root and restart the API"
          }
        >
          Server: key not set
        </span>
      )}
      {serverConfigured === true && (
        <span
          className="dr-nav-server-ok"
          title="If you get 401, the key you paste must match RECRUITER_API_KEY exactly"
        >
          Server: key set
        </span>
      )}
      <div className="dr-nav-apikey">
        <input
          type="password"
          className="dr-nav-apikey-input"
          placeholder="API key (click Save)"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
          aria-label="Recruiter API key"
        />
        <button
          type="button"
          className="dr-nav-apikey-btn"
          onClick={handleSaveKey}
          disabled={!keyInput.trim()}
        >
          {saved ? "Saved" : "Save"}
        </button>
      </div>
      {hasKey && (
        <button type="button" className="dr-nav-signout" onClick={handleSignOut}>
          Sign out
        </button>
      )}
    </div>
  );
}
