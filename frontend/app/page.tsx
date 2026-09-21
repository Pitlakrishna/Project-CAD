"use client";

import React, { useState, useEffect, useRef } from "react";
import { AppSettings, ChatMessage, ChatSession, ProviderType, CadGenerationResponse } from "../lib/types";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  loadSessions,
  saveSessions,
  getActiveSessionId,
  setActiveSessionId,
} from "../lib/storage";
import { generateCad, refineCad, generateCadStream, refineCadStream, formatErrorMessage } from "../lib/api";
import { Sidebar } from "../components/Sidebar";
import { SettingsModal } from "../components/SettingsModal";
import { AdsPanel } from "../components/AdsPanel";
import { ChatInput } from "../components/ChatInput";
import { ChatMessageItem } from "../components/ChatMessageItem";
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
      const current = savedActiveId
        ? loadedSessions.find((s) => s.id === savedActiveId) || loadedSessions[0]
        : loadedSessions[0];
      setActiveSessionIdState(current.id);
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

  function isCadModificationIntent(prompt: string): boolean {
    const text = prompt.toLowerCase().trim();

    // Explicit non-modification conversational patterns
    const chatPatterns = [
      /^(hi|hello|hey|greetings|hola|good morning|good afternoon|good evening)\b/i,
      /^(thanks|thank you|thx|ok|okay|cool|great|awesome|good job|nice)\b/i,
      /^(what is|who are you|how do i|how does|why did|can you explain|explain to me|tell me about|what are the)\b/i,
    ];

    if (chatPatterns.some((pattern) => pattern.test(text))) {
      return false;
    }

    // Common CAD modification keywords
    const modifyKeywords = [
      "modify", "change", "update", "add", "remove", "delete", "make it",
      "increase", "decrease", "reduce", "enlarge", "shrink", "taller",
      "shorter", "wider", "narrower", "thicker", "thinner", "bigger", "smaller",
      "radius", "diameter", "height", "width", "length", "thickness", "fillet",
      "chamfer", "hole", "holes", "screw", "screws", "color", "material",
      "glass", "metal", "plastic", "tolerance", "slot", "slots", "cut", "fuse",
      "wall", "flange", "tab", "bracket", "mount", "dimension", "dimensions",
      "mm", "degree", "degrees", "angle", "offset", "scale", "resize"
    ];

    return modifyKeywords.some((kw) => text.includes(kw));
  }

  function cleanFinalContent(explanation?: string, streamedContent?: string, hasReplicadCode?: boolean): string {
    let content = (explanation || streamedContent || "").trim();
    // Only strip Replicad 3D CAD scripts if a 3D model was generated (so it doesn't duplicate the 3D viewer)
    if (hasReplicadCode) {
      const replicadPattern = /```(?:typescript|ts|javascript|js|replicad)?\s*\n[\s\S]*?(?:export\s+default\s+function|defaultParams|replicad)[\s\S]*?```/gi;
      const stripped = content.replace(replicadPattern, "").trim();
      return stripped || explanation || "Here is your 3D CAD model.";
    }
    // For general code (Python, JS, HTML, etc.) or chat Q&A, keep all code blocks and markdown intact
    return content;
  }

  const handleSendMessage = async (promptText: string) => {
    if (!promptText.trim() || isLoading || !activeSession) return;

    const targetSessionId = activeSession.id;

    const userMessage: ChatMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      content: promptText,
      timestamp: Date.now(),
    };

    // Only refine if a prior CAD model exists AND the user prompt is asking to modify it
    const previousAssistantMsg = [...activeSession.messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.cadResponse?.replicad_code);

    const isRefinement =
      Boolean(previousAssistantMsg?.cadResponse?.replicad_code) &&
      isCadModificationIntent(promptText);

    const assistantMsgId = "msg-" + (Date.now() + 1);
    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      isStreaming: true,
      timestamp: Date.now() + 1,
    };

    const updatedMessages = [
      ...activeSession.messages,
      userMessage,
      initialAssistantMessage,
    ];
    const newTitle =
      activeSession.messages.length === 0
        ? promptText.slice(0, 30) + (promptText.length > 30 ? "..." : "")
        : activeSession.title;

    const updatedSession: ChatSession = {
      ...activeSession,
      title: newTitle,
      updatedAt: Date.now(),
      messages: updatedMessages,
    };

    setSessions((prev) =>
      prev.map((s) => (s.id === targetSessionId ? updatedSession : s))
    );
    setIsLoading(true);

    let accumulatedContent = "";

    const onToken = (chunk: string) => {
      accumulatedContent += chunk;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                  ...m,
                  content: accumulatedContent,
                  isStreaming: true,
                }
                : m
            ),
          };
        })
      );
    };

    const onReset = () => {
      accumulatedContent = "";
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                  ...m,
                  content: "",
                  isStreaming: true,
                }
                : m
            ),
          };
        })
      );
    };

    try {
      let cadResult: CadGenerationResponse;

      if (isRefinement && previousAssistantMsg?.cadResponse) {
        cadResult = await refineCadStream(
          promptText,
          previousAssistantMsg.cadResponse.replicad_code,
          previousAssistantMsg.cadResponse.parameters || {},
          settings,
          () => { },
          onToken,
          onReset
        );
      } else {
        cadResult = await generateCadStream(
          promptText,
          settings,
          () => { },
          onToken,
          onReset
        );
      }

      if (cadResult?.replicad_code) {
        console.log("%c[REPLICAD TYPESCRIPT GENERATED]", "color: #38bdf8; font-weight: bold; font-size: 14px;");
        console.log(cadResult.replicad_code);
      }

      const finalAssistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: cleanFinalContent(cadResult.raw_explanation, accumulatedContent, Boolean(cadResult.replicad_code)),
        isStreaming: false,
        cadResponse: cadResult,
        timestamp: Date.now(),
      };

      setSessions((prev) => {
        const next = prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            updatedAt: Date.now(),
            messages: s.messages.map((m) =>
              m.id === assistantMsgId ? finalAssistantMessage : m
            ),
          };
        });
        saveSessions(next);
        return next;
      });
    } catch (err: any) {
      const rawErrorMsg = err.message || "Unknown error occurred";
      const userFriendlyMsg = formatErrorMessage(rawErrorMsg, settings.provider);
      setSessions((prev) => {
        const next = prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            updatedAt: Date.now(),
            messages: s.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                  ...m,
                  isThinking: false,
                  isStreaming: false,
                  error: rawErrorMsg,
                  content: userFriendlyMsg,
                }
                : m
            ),
          };
        });
        saveSessions(next);
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResubmitPrompt = async (messageId: string, newPromptText: string) => {
    if (!newPromptText.trim() || isLoading || !activeSession) return;

    const targetSessionId = activeSession.id;

    // Find the message index to edit
    const msgIndex = activeSession.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    // Keep messages before this edited message
    const messagesBefore = activeSession.messages.slice(0, msgIndex);

    const editedUserMessage: ChatMessage = {
      ...activeSession.messages[msgIndex],
      content: newPromptText,
      timestamp: Date.now(),
    };

    // Check if there was any prior assistant message with CAD code before this prompt
    const previousAssistantMsg = [...messagesBefore]
      .reverse()
      .find((m) => m.role === "assistant" && m.cadResponse?.replicad_code);

    const isRefinement =
      Boolean(previousAssistantMsg?.cadResponse?.replicad_code) &&
      isCadModificationIntent(newPromptText);

    const assistantMsgId = "msg-" + (Date.now() + 1);
    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      isStreaming: true,
      timestamp: Date.now() + 1,
    };

    const updatedMessages = [
      ...messagesBefore,
      editedUserMessage,
      initialAssistantMessage,
    ];
    const newTitle =
      msgIndex === 0
        ? newPromptText.slice(0, 30) + (newPromptText.length > 30 ? "..." : "")
        : activeSession.title;

    const updatedSession: ChatSession = {
      ...activeSession,
      title: newTitle,
      updatedAt: Date.now(),
      messages: updatedMessages,
    };

    setSessions((prev) =>
      prev.map((s) => (s.id === targetSessionId ? updatedSession : s))
    );
    setIsLoading(true);

    let accumulatedContent = "";

    const onToken = (chunk: string) => {
      accumulatedContent += chunk;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                  ...m,
                  content: accumulatedContent,
                  isStreaming: true,
                }
                : m
            ),
          };
        })
      );
    };

    try {
      let cadResult: CadGenerationResponse;

      if (isRefinement && previousAssistantMsg?.cadResponse) {
        cadResult = await refineCadStream(
          newPromptText,
          previousAssistantMsg.cadResponse.replicad_code,
          previousAssistantMsg.cadResponse.parameters || {},
          settings,
          () => { },
          onToken
        );
      } else {
        cadResult = await generateCadStream(
          newPromptText,
          settings,
          () => { },
          onToken
        );
      }

      if (cadResult?.replicad_code) {
        console.log("%c[REPLICAD TYPESCRIPT GENERATED]", "color: #38bdf8; font-weight: bold; font-size: 14px;");
        console.log(cadResult.replicad_code);
      }

      const finalAssistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: cleanFinalContent(cadResult.raw_explanation, accumulatedContent, Boolean(cadResult.replicad_code)),
        isStreaming: false,
        cadResponse: cadResult,
        timestamp: Date.now(),
      };

      setSessions((prev) => {
        const next = prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            updatedAt: Date.now(),
            messages: s.messages.map((m) =>
              m.id === assistantMsgId ? finalAssistantMessage : m
            ),
          };
        });
        saveSessions(next);
        return next;
      });
    } catch (err: any) {
      const rawErrorMsg = err.message || "Unknown error occurred";
      const userFriendlyMsg = formatErrorMessage(rawErrorMsg, settings.provider);
      setSessions((prev) => {
        const next = prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            updatedAt: Date.now(),
            messages: s.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                  ...m,
                  isThinking: false,
                  isStreaming: false,
                  error: rawErrorMsg,
                  content: userFriendlyMsg,
                }
                : m
            ),
          };
        });
        saveSessions(next);
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getProviderLabel = (p: ProviderType) => {
    switch (p) {
      case "anthropic":
        return "Claude";
      case "gemini":
        return "Gemini";
      case "groq":
        return "Groq";
      case "openai":
      default:
        return "OpenAI";
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d0d] text-[#f4f4f4]">
      {/* 1. Left History Sidebar */}
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

      {/* 2. Center Chat & Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Top Header */}
        <header className="h-14 border-b border-[#262626] bg-[#0d0d0d]/95 backdrop-blur-xs flex items-center justify-between px-4 z-10 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-xl text-[#8e8e8e] hover:text-white hover:bg-[#1c1c1c] transition-colors md:hidden cursor-pointer"
              title="Toggle history sidebar"
            >
              <IconSidebar className="w-5 h-5" />
            </button>

            {/* Provider Pill */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#171717] hover:bg-[#212121] border border-[#292929] hover:border-[#383838] transition-all text-xs font-medium cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[#f4f4f4]">{getProviderLabel(settings.selectedProvider)}</span>
            </button>
          </div>

          {/* Right Header Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c1c1c] hover:bg-[#262626] border border-[#2b2b2b] text-xs text-[#d1d1d1] hover:text-white transition-colors cursor-pointer"
              title="New 3D model"
            >
              <IconPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Model</span>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl text-[#8e8e8e] hover:text-white hover:bg-[#1c1c1c] border border-transparent hover:border-[#2b2b2b] transition-colors cursor-pointer"
              title="Settings"
            >
              <IconGear className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Chat Messages Stream */}
        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="w-full max-w-3xl mx-auto space-y-6">
            {/* Empty State */}
            {(!activeSession || activeSession.messages.length === 0) && (
              <div className="pt-12 pb-6 flex flex-col items-center text-center space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-[#1c1c1c] border border-[#2e2e2e] flex items-center justify-center text-white shadow-lg">
                  <IconCube className="w-6 h-6" />
                </div>

                <div className="space-y-2 max-w-md">
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#f4f4f4]">
                    What 3D model would you like to design?
                  </h1>
                  <p className="text-xs sm:text-sm text-[#8e8e8e]">
                    Enter any text prompt. AICAD generates watertight, parametric Replicad TypeScript code with assemblies, materials, and optics.
                  </p>
                </div>

                {/* Prompt Cards */}
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
            {activeSession?.messages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                onResubmitPrompt={handleResubmitPrompt}
                onRefinePrompt={(suggestion) => handleSendMessage(suggestion)}
                onOpenSettings={() => setIsSettingsOpen(true)}
                isLoading={isLoading}
              />
            ))}

            {/* Loading Indicator (only shown if not actively streaming an in-place message) */}
            {isLoading && !activeSession?.messages.some((m) => m.isStreaming) && (
              <div className="flex gap-3.5 items-start">
                <div className="w-7 h-7 rounded-xl bg-[#212121] border border-[#303030] flex items-center justify-center text-white shrink-0 mt-0.5 animate-pulse">
                  <IconCube className="w-3.5 h-3.5" />
                </div>
                <div className="p-4 rounded-2xl bg-[#171717] border border-[#262626] text-xs text-[#a3a3a3] flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>Connecting to model...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Floating Chat Input */}
        <footer className="shrink-0 bg-gradient-to-t from-[#0d0d0d] via-[#0d0d0d] to-transparent pt-2">
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            selectedProvider={settings.selectedProvider}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </footer>
      </div>

      {/* 3. Right-Side Vertical Advertising Ads Screen (Permanent, No Close Button) */}
      <AdsPanel />

      {/* 4. Single-Screen Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
