"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hapticLight } from "@/lib/haptics";
import type { VoiceConvo } from "@/types/dilly";

export interface VoiceTabBarProps {
  openConvos: VoiceConvo[];
  effectiveActiveId: string;
  renamingVoiceConvId: string | null;
  renameValue: string;
  voiceChatListOpen: boolean;
  voiceRenameInputRef: React.RefObject<HTMLInputElement | null>;
  setVoiceChatListOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRenamingVoiceConvId: (id: string | null) => void;
  setRenameValue: (v: string) => void;
  openChat: (id: string) => void;
  closeTab: (id: string) => void;
  startNewChat: () => void;
  startRename: (id: string) => void;
  commitRename: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setMainAppTab: (tab: any) => void;
}

export function VoiceTabBar({
  openConvos,
  effectiveActiveId,
  renamingVoiceConvId,
  renameValue,
  voiceChatListOpen,
  voiceRenameInputRef,
  setVoiceChatListOpen,
  setRenamingVoiceConvId,
  setRenameValue,
  openChat,
  closeTab,
  startNewChat,
  startRename,
  commitRename,
  setMainAppTab,
}: VoiceTabBarProps) {
  return (
    <div className="flex items-center gap-2 mb-2 shrink-0">
      <button
        type="button"
        onClick={() => setVoiceChatListOpen((v) => !v)}
        className={`shrink-0 p-2 rounded-lg transition-colors ${voiceChatListOpen ? "text-white bg-slate-700/50" : "text-slate-500 hover:text-slate-200 hover:bg-slate-700/50"}`}
        aria-label="All chats"
        title="All chats"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
          />
        </svg>
      </button>
      <TabsList className="flex-1 justify-start h-auto p-1 m-rounded-card bg-slate-800/60 text-slate-400 overflow-x-auto flex-nowrap">
        {openConvos.map((c) => (
          <TabsTrigger
            key={c.id}
            value={c.id}
            className="group/tab rounded-lg pl-3 pr-1.5 py-1.5 text-xs font-medium data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 shrink-0 max-w-[140px] flex items-center gap-1"
          >
            {renamingVoiceConvId === c.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitRename();
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={voiceRenameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setRenamingVoiceConvId(null);
                      setRenameValue("");
                    }
                  }}
                  className="voice-input-field w-24 px-2 py-0.5 text-xs text-slate-100 bg-transparent border-b border-slate-500"
                />
              </form>
            ) : (
              <>
                <span
                  className="truncate flex-1 min-w-0"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(c.id);
                  }}
                  title="Double-click to rename"
                >
                  {c.title}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Close tab"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closeTab(c.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      closeTab(c.id);
                    }
                  }}
                  className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-slate-600/50 transition-colors touch-manipulation cursor-pointer"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </span>
              </>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      <button
        type="button"
        onClick={startNewChat}
        className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
        aria-label="New chat"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => {
          hapticLight();
          setMainAppTab("settings");
        }}
        className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
        aria-label="Dilly settings"
        title="Dilly settings"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>
    </div>
  );
}
