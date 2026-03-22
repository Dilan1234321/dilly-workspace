"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { VoiceNotificationBanner } from "@/components/VoiceNotificationBanner";
import { DEFAULT_VOICE_AVATAR_INDEX } from "@/lib/voiceAvatars";
import { safeUuid } from "@/lib/dillyUtils";

type VoiceNotification = {
  id: string;
  message: string;
  ts: number;
};

type ContextValue = {
  showVoiceNotification: (message: string) => void;
  setNotificationVoiceAvatar: (index: number | null) => void;
  setNotificationTapHandler: (handler: (() => void) | null) => void;
};

const Context = createContext<ContextValue | null>(null);

export function DillyVoiceNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<VoiceNotification[]>([]);
  const [voiceAvatarIndex, setVoiceAvatarIndexState] = useState<number | null>(DEFAULT_VOICE_AVATAR_INDEX);
  const [tapHandler, setTapHandler] = useState<(() => void) | null>(null);

  const showVoiceNotification = useCallback((message: string) => {
    const id = safeUuid();
    setNotifications((prev) => [...prev, { id, message, ts: Date.now() }]);
    setTimeout(() => {
      setNotifications((n) => n.filter((x) => x.id !== id));
    }, 6000);
  }, []);

  const setNotificationTapHandler = useCallback((handler: (() => void) | null) => {
    setTapHandler(() => handler);
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((n) => n.filter((x) => x.id !== id));
  }, []);

  return (
    <Context.Provider value={{ showVoiceNotification, setNotificationVoiceAvatar: setVoiceAvatarIndexState, setNotificationTapHandler }}>
      {children}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-[min(375px,calc(100vw-2rem))] px-2 pointer-events-none"
        aria-live="polite"
      >
        <div className="pointer-events-auto flex flex-col gap-2">
          {notifications.map((n) => (
            <VoiceNotificationBanner
              key={n.id}
              message={n.message}
              voiceAvatarIndex={voiceAvatarIndex}
              onDismiss={() => dismiss(n.id)}
              onTap={tapHandler ?? undefined}
            />
          ))}
        </div>
      </div>
    </Context.Provider>
  );
}

export function useDillyVoiceNotification() {
  const ctx = useContext(Context);
  return ctx ?? { showVoiceNotification: () => {}, setNotificationVoiceAvatar: () => {}, setNotificationTapHandler: () => {} };
}
