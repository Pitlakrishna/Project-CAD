"use client";

import React, { useState, useEffect, useRef } from "react";
import { AppSettings, ChatMessage, ChatSession, ProviderType } from "../lib/types";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  loadSessions,
  saveSessions,
  getActiveSessionId,
  setActiveSessionId,
} from "../lib/storage";
import { generateCad, refineCad } from "../lib/api";
import { Sidebar } from "../components/Sidebar";
import { SettingsModal } from "../components/SettingsModal";
import { CadCodeViewer } from "../components/CadCodeViewer";
import { ChatInput } from "../components/ChatInput";
import {
  IconSidebar,
  IconGear,
  IconCube,
  IconSparkles,
  IconPlus,
} from "../components/icons";

const EMPTY_SUGGESTIONS = [
  {
    title: "Electronics Junction Box",
    desc: "Watertight box with screw bosses and clear glass lid",
    prompt: "Create an electronics junction box with a clear glass inspection lid and stainless steel fasteners",
  },
  {
    title: "Optical Lens Housing",
    desc: "Precision barrel with lens mounts and optical glass",
    prompt: "Generate an optical camera lens housing barrel with precision inner threading and glass optics",
  },
  {
    title: "Parametric Planetary Gearbox",
    desc: "Carrier with sun, planet gears, and ring gear assembly",
    prompt: "Design a parametric planetary gearbox carrier with sun, planet, and ring gear mounts in matte nylon",
  },
  {
    title: "Drone Motor Bracket",
    desc: "Lightweight mount with M3 slots and cable channels",
    prompt: "Create a lightweight drone motor mount bracket with 4x M3 screw slots and cable routing channels",
  },
];

export default function Home() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize from storage on client mount
  useEffect(() => {
    const loadedSettings = loadSettings();
    setSettings(loadedSettings);

    const loadedSessions = loadSessions();
    if (loadedSessions.length > 0) {
      setSessions(loadedSessions);
      const savedActiveId = getActiveSessionId();
      if (savedActiveId && loadedSessions.some((s) => s.id === savedActiveId)) {
        setActiveSessionIdState(savedActiveId);
      } else {
        setActiveSessionIdState(loadedSessions[0].id);
      }
    } else {
      // Create initial empty session
      const initialSession: ChatSession = {
        id: "session-" + Date.now(),
        title: "New 3D Model",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };
      setSessions([initialSession]);
      setActiveSessionIdState(initialSession.id);
      saveSessions([initialSession]);
      setActiveSessionId(initialSession.id);
    }
  }, []);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, isLoading]);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const handleSelectSession = (id: string) => {
    setActiveSessionIdState(id);
    setActiveSessionId(id);
    setIsSidebarOpen(false);
  };

  const handleNewSession = () => {
    const newSession: ChatSession = {
      id: "session-" + Date.now(),
      title: "New 3D Model",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setActiveSessionIdState(newSession.id);
    saveSessions(updated);
    setActiveSessionId(newSession.id);
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== id);
    if (updated.length === 0) {
      handleNewSession();
    } else {
      setSessions(updated);
      saveSessions(updated);
      if (activeSessionId === id) {
        setActiveSessionIdState(updated[0].id);
        setActiveSessionId(updated[0].id);
      }
    }
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleSendMessage = async (promptText: string) => {
    if (!promptText.trim() || isLoading || !activeSession) return;

    const userMessage: ChatMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      content: promptText,
      timestamp: Date.now(),
    };

    // Find the latest previous CAD response in this session to check for refinement
    const previousAssistantMsg = [...activeSession.messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.cadResponse?.replicad_code);

    const isRefinement = Boolean(previousAssistantMsg?.cadResponse?.replicad_code);

    const updatedMessages = [...activeSession.messages, userMessage];
    const newTitle =
      activeSession.messages.length === 0
        ? promptText.slice(0, 32) + (promptText.length > 32 ? "..." : "")
        : activeSession.title;

    const updatedSession: ChatSession = {
      ...activeSession,
      title: newTitle,
      updatedAt: Date.now(),
      messages: updatedMessages,
    };

    const updatedSessions = sessions.map((s) =>
      s.id === activeSession.id ? updatedSession : s
    );

    setSessions(updatedSessions);
    saveSessions(updatedSessions);
    setIsLoading(true);

    try {
      let cadResult;

      if (isRefinement && previousAssistantMsg?.cadResponse) {
        cadResult = await refineCad(
          promptText,
          previousAssistantMsg.cadResponse.replicad_code,
          previousAssistantMsg.cadResponse.parameters || {},
          settings
        );
      } else {
        cadResult = await generateCad(promptText, settings);
      }

      const assistantMessage: ChatMessage = {
        id: "msg-" + (Date.now() + 1),
        role: "assistant",
        content: cadResult.raw_explanation || "CAD generation complete.",
        cadResponse: cadResult,
        timestamp: Date.now(),
      };

      const finalSession: ChatSession = {
        ...updatedSession,
        updatedAt: Date.now(),
        messages: [...updatedSession.messages, assistantMessage],
      };

      const finalSessions = sessions.map((s) =>
        s.id === activeSession.id ? finalSession : s
      );

      setSessions(finalSessions);
      saveSessions(finalSessions);
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: "msg-" + (Date.now() + 1),
        role: "assistant",
        content: "Generation failed: " + (err.message || "Unknown error"),
        error: err.message || "Unknown error occurred",
        timestamp: Date.now(),
      };

      const finalSession: ChatSession = {
        ...updatedSession,
        updatedAt: Date.now(),
        messages: [...updatedSession.messages, errorMessage],
      };

      const finalSessions = sessions.map((s) =>
        s.id === activeSession.id ? finalSession : s
      );

      setSessions(finalSessions);
      saveSessions(finalSessions);
    } finally {
      setIsLoading(false);
    }
  };

  const getProviderLabel = (p: ProviderType) => {
    switch (p) {
      case "anthropic":
        return "Claude 3.5 Sonnet";
      case "openai":
        return "GPT-4o";
      case "ollama":
        return "Ollama Local";
      case "mock":
      default:
        return "Mock Mode";
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d0d] text-[#f4f4f4]">
      {/* Sidebar */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setIsSettingsOpen(true)}
        selectedProvider={settings.selectedProvider}
        isOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
      />

      {/* Main Chat Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Top Bar Header */}
        <header className="h-14 border-b border-[#262626] bg-[#0d0d0d]/90 backdrop-blur-xs flex items-center justify-between px-4 z-10 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-xl text-[#8e8e8e] hover:text-white hover:bg-[#1c1c1c] transition-colors md:hidden cursor-pointer"
              title="Toggle sidebar"
            >
              <IconSidebar className="w-5 h-5" />
            </button>

            {/* Model Indicator Pill (click to open settings) */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#171717] hover:bg-[#212121] border border-[#292929] hover:border-[#383838] transition-all text-xs font-medium cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[#f4f4f4]">{getProviderLabel(settings.selectedProvider)}</span>
              <span className="text-[10px] text-[#737373] uppercase tracking-wider font-mono">
                {settings.selectedProvider === "anthropic"
                  ? settings.anthropicModel.slice(0, 16)
                  : settings.selectedProvider === "openai"
                  ? settings.openaiModel
                  : settings.selectedProvider}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c1c1c] hover:bg-[#262626] border border-[#2b2b2b] text-xs text-[#d1d1d1] hover:text-white transition-colors cursor-pointer"
              title="Start a new 3D model"
            >
              <IconPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Model</span>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl text-[#8e8e8e] hover:text-white hover:bg-[#1c1c1c] border border-transparent hover:border-[#2b2b2b] transition-colors cursor-pointer"
              title="Settings & API keys"
            >
              <IconGear className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat Message Stream */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="w-full max-w-3xl mx-auto space-y-6">
            {/* Empty State / Welcome Screen */}
            {(!activeSession || activeSession.messages.length === 0) && (
              <div className="pt-12 pb-6 flex flex-col items-center text-center space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-[#1c1c1c] border border-[#2e2e2e] flex items-center justify-center text-white shadow-lg">
                  <IconCube className="w-6 h-6" />
                </div>

                <div className="space-y-2 max-w-md">
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#f4f4f4]">
                    What 3D model would you like to build?
                  </h1>
                  <p className="text-xs sm:text-sm text-[#8e8e8e]">
                    Enter any prompt. AICAD generates watertight, parametric Replicad TypeScript code with assemblies, materials, and optics.
                  </p>
                </div>

                {/* Suggestions Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-4 text-left">
                  {EMPTY_SUGGESTIONS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(item.prompt)}
                      className="p-3.5 rounded-2xl bg-[#171717] hover:bg-[#202020] border border-[#262626] hover:border-[#383838] transition-all flex flex-col justify-between group text-left cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-[#e5e5e5] group-hover:text-white flex items-center justify-between">
                        <span>{item.title}</span>
                        <IconSparkles className="w-3.5 h-3.5 text-[#555] group-hover:text-white transition-colors" />
                      </div>
                      <div className="text-[11px] text-[#737373] mt-1 line-clamp-2">
                        {item.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {activeSession?.messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex gap-3.5 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {/* Assistant Avatar */}
                  {!isUser && (
                    <div className="w-7 h-7 rounded-xl bg-[#212121] border border-[#303030] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                      <IconCube className="w-3.5 h-3.5" />
                    </div>
                  )}

                  {/* Message Bubble & Content */}
                  <div
                    className={`flex flex-col ${
                      isUser
                        ? "max-w-[85%] sm:max-w-[75%] items-end"
                        : "max-w-full flex-1 items-start"
                    }`}
                  >
                    {/* User Text Bubble */}
                    {isUser ? (
                      <div className="px-4 py-2.5 rounded-2xl bg-[#212121] border border-[#2f2f2f] text-sm text-[#f4f4f4] leading-relaxed shadow-xs">
                        {message.content}
                      </div>
                    ) : (
                      <div className="w-full text-sm text-[#dcdcdc] leading-relaxed space-y-2">
                        {/* Error state */}
                        {message.error ? (
                          <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/40 text-xs text-red-300">
                            {message.content}
                          </div>
                        ) : (
                          <>
                            {/* Generation Metadata Badges */}
                            {message.cadResponse && (
                              <div className="flex items-center gap-2 pb-1 text-[11px] text-[#737373]">
                                <span className="px-2 py-0.5 rounded-md bg-[#1a1a1a] border border-[#262626] text-[#a3a3a3] font-medium uppercase tracking-wider font-mono">
                                  {message.cadResponse.provider} : {message.cadResponse.model}
                                </span>
                                {message.cadResponse.latency_ms && (
                                  <span>{message.cadResponse.latency_ms} ms</span>
                                )}
                                {message.cadResponse.cached && (
                                  <span className="text-emerald-400 font-medium">⚡ cached</span>
                                )}
                              </div>
                            )}

                            {/* Assistant Explanation */}
                            <div className="whitespace-pre-wrap text-sm text-[#e0e0e0] leading-relaxed">
                              {message.content}
                            </div>

                            {/* Replicad Code & Assembly Viewer */}
                            {message.cadResponse && (
                              <CadCodeViewer
                                data={message.cadResponse}
                                onRefinePrompt={(suggestion) => handleSendMessage(suggestion)}
                              />
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-3.5 items-start">
                <div className="w-7 h-7 rounded-xl bg-[#212121] border border-[#303030] flex items-center justify-center text-white shrink-0 mt-0.5 animate-pulse">
                  <IconCube className="w-3.5 h-3.5" />
                </div>
                <div className="p-4 rounded-2xl bg-[#171717] border border-[#262626] text-xs text-[#a3a3a3] flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>Synthesizing parametric Replicad TypeScript CAD geometry...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Floating Chat Input */}
        <footer className="shrink-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d] to-transparent pt-3">
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            selectedProvider={settings.selectedProvider}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </footer>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
