"use client";

import React, { useState, useEffect, useRef } from "react";
import { AppSettings, ChatMessage, ChatSession, ProviderType, CadGenerationResponse, FileArtifact } from "../lib/types";
import { parseMarkdownTable, parseMarkdownToSlides } from "../lib/universalDocumentGenerator";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  loadSessions,
  saveSessions,
  getActiveSessionId,
  setActiveSessionId,
} from "../lib/storage";
import { generateCad, refineCad, generateCadStream, refineCadStream, generateModelGeometry, formatErrorMessage } from "../lib/api";
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
        title: "New Chat",
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
      title: "New Chat",
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
      const freshSession: ChatSession = {
        id: "session-" + Date.now(),
        title: "New Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };
      setSessions([freshSession]);
      saveSessions([freshSession]);
      setActiveSessionIdState(freshSession.id);
      setActiveSessionId(freshSession.id);
      setIsSidebarOpen(false);
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

    // 1. Explicit non-modification conversational, question & advice patterns (DO NOT burn CAD tokens)
    const nonModPatterns = [
      /^(?:hi|hello|hey|greetings|hola|good morning|good afternoon|good evening)\b/i,
      /^(?:thanks|thank you|thx|ok|okay|cool|great|awesome|good job|nice|bye|goodbye)\b/i,
      /^(?:what|which|who|where|when|why|how|can you|could you|explain|tell me|is it|does it|should i)\b/i,
      /\b(?:how to slice|print settings|bed temperature|nozzle temp|infill|warping|slice|troubleshoot|advice|tips)\b/i,
    ];

    if (nonModPatterns.some((pattern) => pattern.test(text))) {
      return false;
    }

    // 2. Strict CAD modification directives (Imperatives to edit the 3D model)
    const modifyDirectives = [
      /\b(?:modify|resize|scale|enlarge|shrink)\b/i,
      /\bmake\s+(?:it|the\s+[\w\s]{1,25})\s+(?:wider|thicker|taller|bigger|smaller|longer|narrower|shorter)\b/i,
      /\b(?:increase|decrease|reduce)\s+(?:the\s+)?(?:[\w\s]{1,30}\s+)?(?:radius|diameter|height|width|length|thickness|size|depth)\b/i,
      /\badd\s+(?:\d+\s+)?(?:[\w\s]{1,20}\s+)?(?:mm|cm|holes?|screws?|fillets?|chamfers?|slots?|ribs?|cutouts?|pockets?)\b/i,
      /\b(?:fillet|chamfer|round|bevel)\s+(?:the\s+)?(?:[\w\s]{1,20}\s+)?(?:edges?|corners?)\b/i,
      /\bchange\s+(?:the\s+)?(?:[\w\s]{1,30}\s+)?(?:radius|diameter|height|width|length|thickness|color|material|dimension)\b/i,
      /\bset\s+(?:the\s+)?\w+\s+to\s+\d+\b/i,
    ];

    return modifyDirectives.some((pat) => pat.test(text));
  }

  function isCadTaskIntent(prompt: string): boolean {
    const text = prompt.toLowerCase().trim();
    if (!text) return false;

    // 1. Casual conversational greetings and chit-chat (STRICTLY NORMAL CHAT)
    const greetings = [
      /^(?:hi|hello|hey|hola|howdy|sup|yo|greetings|good morning|good afternoon|good evening|good day)\b/i,
      /^(?:who are you|what are you|what can you do|help|tell me about yourself|how are you)\b/i,
      /^(?:thanks|thank you|thx|cool|nice|awesome|great|ok|okay|bye|goodbye)\b/i,
    ];
    if (greetings.some((pat) => pat.test(text))) return false;

    // 2. Informational questions, advice, troubleshooting, comparisons (strictly non-CAD unless explicit design directive)
    const isInformational =
      /^(?:what|which|who|where|when|why|how|can\s+you\s+explain|tell\s+me\s+about|explain|describe|give\s+me\s+advice|suggest|recommend|review|summarize)\b/i.test(text) ||
      /\b(?:how\s+to\s+slice|slicing\s+settings|infill|print\s+settings|bed\s+temperature|nozzle\s+temp|warping|layer\s+height|stringing|difference\s+between|compare)\b/i.test(text);

    const hasDirectModelingCommand =
      /\b(?:design|create|build|generate|make|model)\s+(?:me\s+)?(?:a|an|the|\d+|new)?\s*(?:3d|cad|solid|mesh|stl|step|printable|bracket|gear|nut|bolt|screw|washer|enclosure|box|case|housing|flange|mount|stand|cylinder|sphere|cone|clamp|clip|pipe|vase|planter|plate|wheel|pulley|chassis|staircase|foundation)\b/i.test(text);

    if (isInformational && !hasDirectModelingCommand) return false;

    // 3. Documentation, spec sheets, code reviews
    if (/\b(?:documentation|document|docs|writeup|manual|guide|spec\s*sheet|overview|readme|summary|review\s+code|code\s+review)\b/i.test(text) && !hasDirectModelingCommand) {
      return false;
    }

    // 4. Direct 3D print command
    if (
      /\b(?:3d\s*print|print\s+(?:in\s+)?3d|print\s+(?:me\s+)?(?:a|an)?)\s+[\w\s]{2,40}\b/i.test(text) &&
      !/\b(?:how|why|settings?|temperature|bed|slicer|layer|infill|warping|issue)\b/i.test(text)
    ) {
      return true;
    }

    // 5. Explicit CAD creation verbs coupled with 3D/mechanical geometry objects
    const hasCreationVerb = /\b(?:design|create|build|generate|model|make|construct|extrude|revolve|fabricate)\b/i.test(text);
    const has3dTarget = /\b(?:3d|cad|solid|mesh|replicad|stl|step|printable|bracket|gear|nut|bolt|screw|washer|enclosure|box|case|housing|flange|mount|stand|cylinder|sphere|cone|clamp|clip|pipe|duct|hinge|tray|cover|lid|vase|wheel|pulley|chassis|staircase|foundation)\b/i.test(text);

    return hasCreationVerb && has3dTarget;
  }

  function extractFileArtifacts(text: string, userPrompt?: string): { cleanText: string; artifacts: FileArtifact[] } {
    const artifacts: FileArtifact[] = [];
    const regex = /<file_artifact\s+filename="([^"]+)"(?:\s+type="([^"]+)")?(?:\s+title="([^"]+)")?>([\s\S]*?)<\/file_artifact>/gi;

    let match;
    let cleanText = text;

    while ((match = regex.exec(text)) !== null) {
      const filename = match[1];
      const type = match[2] || filename.split(".").pop() || "txt";
      const title = match[3] || filename;
      const rawData = match[4].trim();

      let data: any = rawData;
      try {
        data = JSON.parse(rawData);
      } catch {
        data = rawData;
      }

      artifacts.push({
        id: "artifact-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        filename,
        type,
        title,
        data,
      });
    }

    cleanText = cleanText.replace(/<file_artifact[\s\S]*?<\/file_artifact>/gi, "").trim();
    cleanText = cleanText.replace(/<file_artifact[\s\S]*$/gi, "").trim();

    // Intelligent Fallback: If user explicitly requested a document format and model generated content without <file_artifact> tag
    if (artifacts.length === 0 && userPrompt && cleanText) {
      const p = userPrompt.toLowerCase();
      if (/\b(?:excel|\.xlsx|spreadsheet)\b/i.test(p)) {
        const table = parseMarkdownTable(cleanText);
        if (table) {
          artifacts.push({
            id: "artifact-" + Date.now() + "-xlsx",
            filename: "Document.xlsx",
            type: "xlsx",
            title: "Generated Spreadsheet",
            data: {
              sheets: [
                {
                  name: "Sheet1",
                  columns: table.headers,
                  rows: table.rows,
                },
              ],
            },
          });
        }
      } else if (/\b(?:word\s*(?:doc|document)?|\.docx)\b/i.test(p)) {
        artifacts.push({
          id: "artifact-" + Date.now() + "-docx",
          filename: "Document.docx",
          type: "docx",
          title: "Generated Word Document",
          data: cleanText,
        });
      } else if (/\b(?:powerpoint|ppt|\.pptx|slide\s*deck|slides?)\b/i.test(p)) {
        const slides = parseMarkdownToSlides(cleanText);
        if (slides.length > 0) {
          artifacts.push({
            id: "artifact-" + Date.now() + "-pptx",
            filename: "Presentation.pptx",
            type: "pptx",
            title: "Generated Presentation",
            data: {
              title: "Presentation",
              slides,
            },
          });
        }
      } else if (/\b(?:pdf|\.pdf)\b/i.test(p)) {
        artifacts.push({
          id: "artifact-" + Date.now() + "-pdf",
          filename: "Document.pdf",
          type: "pdf",
          title: "Generated PDF Document",
          data: cleanText,
        });
      } else if (/\b(?:csv|\.csv)\b/i.test(p)) {
        const table = parseMarkdownTable(cleanText);
        if (table) {
          const csvContent = [table.headers.join(","), ...table.rows.map((r) => r.join(","))].join("\n");
          artifacts.push({
            id: "artifact-" + Date.now() + "-csv",
            filename: "Data.csv",
            type: "csv",
            title: "CSV Export",
            data: csvContent,
          });
        }
      } else if (/\b(?:markdown|\.md)\b/i.test(p)) {
        artifacts.push({
          id: "artifact-" + Date.now() + "-md",
          filename: "Document.md",
          type: "md",
          title: "Markdown Document",
          data: cleanText,
        });
      } else if (/\b(?:json|\.json)\b/i.test(p)) {
        artifacts.push({
          id: "artifact-" + Date.now() + "-json",
          filename: "Data.json",
          type: "json",
          title: "JSON Data",
          data: cleanText,
        });
      }
    }

    return { cleanText, artifacts };
  }

  function cleanDisplayContent(text: string): string {
    let content = text.trim();
    // Strip any thinking tags if present in token stream
    content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").replace(/<thought>[\s\S]*?(?:<\/thought>|$)/gi, "");
    // Strip any file_artifact blocks from live streaming display
    content = content.replace(/<file_artifact[\s\S]*?(?:<\/file_artifact>|$)/gi, "");
    // Strip any Replicad 3D CAD scripts / code blocks from being shown in chat
    const replicadPattern = /```(?:typescript|ts|javascript|js|replicad)?[\s\S]*?(?:export\s+default\s+function|defaultParams|replicad)[\s\S]*?(?:```|$)/gi;
    return content.replace(replicadPattern, "").trim();
  }

  function cleanFinalContent(explanation?: string, streamedContent?: string, hasReplicadCode?: boolean): string {
    let content = (explanation || streamedContent || "").trim();
    // Clean file_artifact blocks from final display (including unclosed tags)
    content = content.replace(/<file_artifact[\s\S]*?(?:<\/file_artifact>|$)/gi, "").trim();
    if (hasReplicadCode) {
      const stripped = cleanDisplayContent(content);
      return stripped || explanation || "Here is your 3D CAD model.";
    }
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

    const isCadTask = isRefinement || isCadTaskIntent(promptText);

    const assistantMsgId = "msg-" + (Date.now() + 1);
    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      isThinking: isCadTask,
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
    let accumulatedThoughts = "";

    const onThought = (chunk: string) => {
      if (!isCadTask) return;
      accumulatedThoughts += chunk;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                  ...m,
                  thoughts: accumulatedThoughts,
                  isThinking: true,
                }
                : m
            ),
          };
        })
      );
    };

    const onToken = (chunk: string) => {
      accumulatedContent += chunk;
      const displayContent = cleanDisplayContent(accumulatedContent);
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                  ...m,
                  content: displayContent,
                  isStreaming: true,
                  isThinking: false,
                }
                : m
            ),
          };
        })
      );
    };

    const onReset = () => {
      accumulatedContent = "";
      accumulatedThoughts = "";
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
                  thoughts: "",
                  isStreaming: true,
                  isThinking: false,
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
          onThought,
          onToken,
          onReset
        );
      } else {
        cadResult = await generateCadStream(
          promptText,
          settings,
          onThought,
          onToken,
          onReset
        );
      }

      let cadGeometry = undefined;
      if (isCadTask && cadResult?.replicad_code) {
        try {
          const geo = await generateModelGeometry(cadResult.replicad_code, cadResult.parameters || {});
          if (geo?.status === "success" && geo?.modelId) {
            cadGeometry = geo;
          }
        } catch (cadErr: any) {
          const errMsg = cadErr?.message || String(cadErr);
          console.warn("[CAD SERVICE] Initial script execution failed:", errMsg);

          // Commercial Production Self-Correction Loop:
          // Immediately ask LLM to fix the runtime error and re-compile
          try {
            const repairPrompt = `The Replicad script generated produced this runtime execution error in the OpenCASCADE engine:\n"${errMsg}"\n\nPlease fix the code. Ensure all variables and parameters are explicitly defined and declared, and return the complete corrected Replicad TypeScript code.`;
            const fixedResult = await refineCad(
              repairPrompt,
              cadResult.replicad_code,
              cadResult.parameters || {},
              settings
            );
            if (fixedResult?.replicad_code) {
              const fixedGeo = await generateModelGeometry(fixedResult.replicad_code, fixedResult.parameters || {});
              if (fixedGeo?.status === "success" && fixedGeo?.modelId) {
                cadGeometry = fixedGeo;
                cadResult = fixedResult;
                console.log("[CAD AUTO-REPAIR] Successfully self-healed and generated 3D geometry!");
              }
            }
          } catch (repairErr) {
            console.error("[CAD AUTO-REPAIR] Self-healing repair failed:", repairErr);
          }
        }
      }

      const rawExplanation = cadResult.raw_explanation || accumulatedContent;
      const { cleanText, artifacts } = extractFileArtifacts(rawExplanation, promptText);

      if (cadResult?.parameters && artifacts.length > 0) {
        artifacts.forEach((art) => {
          if (typeof art.data === "object" && art.data !== null) {
            art.data.parameters = { ...(art.data.parameters || {}), ...cadResult.parameters };
          }
        });
      }

      const finalAssistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: cleanFinalContent(cleanText, accumulatedContent, Boolean(isCadTask && cadResult.replicad_code)),
        isStreaming: false,
        isThinking: false,
        thoughts: isCadTask ? (accumulatedThoughts.trim() || cadResult.raw_thoughts || undefined) : undefined,
        cadResponse: isCadTask && cadResult?.replicad_code ? cadResult : undefined,
        geometry: isCadTask ? cadGeometry : undefined,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        userPrompt: promptText,
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
      const userFriendlyMsg = formatErrorMessage(rawErrorMsg, settings.selectedProvider);
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

    const isCadTask = isRefinement || isCadTaskIntent(newPromptText);

    const assistantMsgId = "msg-" + (Date.now() + 1);
    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      isThinking: isCadTask,
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
    let accumulatedThoughts = "";

    const onThought = (chunk: string) => {
      if (!isCadTask) return;
      accumulatedThoughts += chunk;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                  ...m,
                  thoughts: accumulatedThoughts,
                  isThinking: true,
                }
                : m
            ),
          };
        })
      );
    };

    const onToken = (chunk: string) => {
      accumulatedContent += chunk;
      const displayContent = cleanDisplayContent(accumulatedContent);
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== targetSessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMsgId
                ? {
                  ...m,
                  content: displayContent,
                  isStreaming: true,
                  isThinking: false,
                }
                : m
            ),
          };
        })
      );
    };

    const onReset = () => {
      accumulatedContent = "";
      accumulatedThoughts = "";
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
                  thoughts: "",
                  isStreaming: true,
                  isThinking: false,
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
          onThought,
          onToken,
          onReset
        );
      } else {
        cadResult = await generateCadStream(
          newPromptText,
          settings,
          onThought,
          onToken,
          onReset
        );
      }

      let cadGeometry = undefined;
      if (isCadTask && cadResult?.replicad_code) {
        try {
          const geo = await generateModelGeometry(cadResult.replicad_code, cadResult.parameters || {});
          if (geo?.status === "success" && geo?.modelId) {
            cadGeometry = geo;
          }
        } catch (cadErr: any) {
          const errMsg = cadErr?.message || String(cadErr);
          console.warn("[CAD SERVICE] Initial script execution failed:", errMsg);

          // Commercial Production Self-Correction Loop
          try {
            const repairPrompt = `The Replicad script generated produced this runtime execution error in the OpenCASCADE engine:\n"${errMsg}"\n\nPlease fix the code. Ensure all variables and parameters are explicitly defined and declared, and return the complete corrected Replicad TypeScript code.`;
            const fixedResult = await refineCad(
              repairPrompt,
              cadResult.replicad_code,
              cadResult.parameters || {},
              settings
            );
            if (fixedResult?.replicad_code) {
              const fixedGeo = await generateModelGeometry(fixedResult.replicad_code, fixedResult.parameters || {});
              if (fixedGeo?.status === "success" && fixedGeo?.modelId) {
                cadGeometry = fixedGeo;
                cadResult = fixedResult;
                console.log("[CAD AUTO-REPAIR] Successfully self-healed and generated 3D geometry!");
              }
            }
          } catch (repairErr) {
            console.error("[CAD AUTO-REPAIR] Self-healing repair failed:", repairErr);
          }
        }
      }

      const rawExplanation = cadResult.raw_explanation || accumulatedContent;
      const { cleanText, artifacts } = extractFileArtifacts(rawExplanation, newPromptText);

      if (cadResult?.parameters && artifacts.length > 0) {
        artifacts.forEach((art) => {
          if (typeof art.data === "object" && art.data !== null) {
            art.data.parameters = { ...(art.data.parameters || {}), ...cadResult.parameters };
          }
        });
      }

      const finalAssistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: cleanFinalContent(cleanText, accumulatedContent, Boolean(isCadTask && cadResult.replicad_code)),
        isStreaming: false,
        isThinking: false,
        thoughts: isCadTask ? (accumulatedThoughts.trim() || cadResult.raw_thoughts || undefined) : undefined,
        cadResponse: isCadTask && cadResult?.replicad_code ? cadResult : undefined,
        geometry: isCadTask ? cadGeometry : undefined,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        userPrompt: newPromptText,
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
      const userFriendlyMsg = formatErrorMessage(rawErrorMsg, settings.selectedProvider);
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
      case "deepseek":
        return "DeepSeek";
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
            {activeSession?.messages.map((message, idx) => {
              const previousUserPrompt =
                idx > 0 && activeSession.messages[idx - 1].role === "user"
                  ? activeSession.messages[idx - 1].content
                  : undefined;

              return (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  userPrompt={message.userPrompt || previousUserPrompt}
                  onResubmitPrompt={handleResubmitPrompt}
                  onRefinePrompt={(suggestion) => handleSendMessage(suggestion)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  isLoading={isLoading}
                />
              );
            })}

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
