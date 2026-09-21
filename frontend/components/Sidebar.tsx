import React from "react";
import { ChatSession, ProviderType } from "../lib/types";
import { IconPlus, IconTrash, IconGear, IconCube, IconMessage, IconClose } from "./icons";

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  onOpenSettings: () => void;
  selectedProvider: ProviderType;
  isOpen: boolean;
  onCloseMobile: () => void;
}

const PROVIDER_NAMES: Record<ProviderType, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Google Gemini",
  groq: "Groq",
  ollama: "Ollama",
};

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenSettings,
  selectedProvider,
  isOpen,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-68 bg-[#171717] border-r border-[#262626] transition-transform duration-200 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-7 h-7 rounded-lg bg-[#262626] border border-[#333333] flex items-center justify-center text-white shadow-xs">
              <IconCube className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-[#f4f4f4]">AICAD Studio</div>
              <div className="text-[11px] text-[#8e8e8e]">Parametric 3D Prompt Engine</div>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-[#8e8e8e] hover:text-white hover:bg-[#262626]"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3 pb-2">
          <button
            onClick={onNewSession}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#212121] hover:bg-[#2a2a2a] text-sm font-medium text-[#f4f4f4] border border-[#2f2f2f] hover:border-[#3d3d3d] transition-all shadow-xs group cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-md bg-[#2d2d2d] flex items-center justify-center text-white group-hover:bg-[#383838]">
                <IconPlus className="w-3.5 h-3.5" />
              </span>
              <span>New 3D Model</span>
            </span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[#737373] bg-[#1a1a1a] px-1.5 py-0.5 rounded border border-[#2a2a2a]">
              Ctrl+K
            </span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          <div className="px-3 py-1.5 text-[11px] font-medium text-[#737373] uppercase tracking-wider">
            Recent Models ({sessions.length})
          </div>

          {sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-[#737373]">
              No saved models yet.
              <br />
              Start generating below!
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`group relative flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                    isActive
                      ? "bg-[#212121] text-white font-medium border border-[#303030]"
                      : "text-[#a3a3a3] hover:text-[#f4f4f4] hover:bg-[#1f1f1f] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-6">
                    <IconMessage className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{session.title || "Untitled Model"}</span>
                  </div>

                  <button
                    onClick={(e) => onDeleteSession(session.id, e)}
                    title="Delete session"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[#737373] hover:text-red-400 hover:bg-[#2d2d2d] transition-opacity"
                  >
                    <IconTrash className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer / Provider Status & Settings */}
        <div className="p-3 border-t border-[#262626] bg-[#141414] space-y-2">
          {/* Provider status badge */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#1c1c1c] border border-[#262626] text-xs">
            <span className="text-[11px] text-[#8e8e8e]">Provider:</span>
            <span className="flex items-center gap-1.5 font-medium text-[#f4f4f4]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {PROVIDER_NAMES[selectedProvider] || selectedProvider}
            </span>
          </div>

          {/* Settings Trigger Button */}
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#212121] text-xs font-medium text-[#d1d1d1] hover:text-white transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <IconGear className="w-4 h-4 text-[#8e8e8e]" />
              <span>Settings & API Keys</span>
            </span>
            <span className="text-[11px] text-[#737373]">Configure</span>
          </button>
        </div>
      </aside>
    </>
  );
}
