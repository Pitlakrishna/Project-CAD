"use client";

import React, { useState, useEffect, useRef } from "react";
import { AppSettings, ChatMessage, ChatSession, ProviderType, CadGenerationResponse, FileArtifact, ChatHistoryMessage } from "../lib/types";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  loadSessions,
  saveSessions,
  getActiveSessionId,
  setActiveSessionId,
} from "../lib/storage";
import { refineCad, generateCadStream, refineCadStream, generateModelGeometry, formatErrorMessage } from "../lib/api";
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
    title: "Mountain Valley with River",
    desc: "Procedural 3D WebGL rolling landscape with pine trees",
    prompt: "Create a photorealistic mountain valley landscape with a winding river and pine trees",
  },
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
  const [engineMode, setEngineMode] = useState<"auto" | "cad" | "threejs">("auto");
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
    if (!text) return false;

    // 1. Pure conversational greetings, thank-yous, and praise (DO NOT trigger CAD modification)
    const pureChitChat =
      /^(?:hi|hello|hey|greetings|hola|good\s+(?:morning|afternoon|evening)|thanks|thank\s+you|thx|cool|awesome|great|good\s+job|nice|ok|okay|bye|goodbye)[!.?]*$/i;
    if (pureChitChat.test(text)) {
      return false;
    }

    // 2. Pure slicing or 3D printing software advice questions (e.g. "what infill should I use?")
    if (
      /\b(?:how\s+to\s+slice|slicing\s+settings|infill\s+percentage|bed\s+temperature|nozzle\s+temp(?:erature)?|warping\s+issue|first\s+layer\s+height|supports?\s+setting)\b/i.test(
        text
      )
    ) {
      return false;
    }

    // 3. Strict CAD & 3D modification imperatives and directives (handles "can you", "please", "how about", and direct commands)
    const modifyDirectives = [
      /\b(?:modify|edit|update|adjust|alter|tweak|revise|re-?engineer)\b/i,
      /\b(?:resize|scale|enlarge|shrink|stretch|compress|expand)\b/i,
      /\b(?:make|render|turn)\s+(?:it|this|the\s+[\w\s]{1,30})\s+(?:wider|thicker|taller|bigger|smaller|longer|narrower|shorter|deeper|flatter|higher|lower|larger|slimmer|round(?:er)?|square|hollow|solid)\b/i,
      /\b(?:increase|decrease|reduce|double|halve|cut|boost|raise|lower)\s+(?:the\s+)?(?:[\w\s]{1,30}\s+)?(?:radius|diameter|height|width|length|thickness|size|depth|clearance|tolerance|spacing|count|number|angle|dimension|scale|elevation)\b/i,
      /\badd\s+(?:\d+\s+)?(?:[\w\s]{1,25}\s+)?(?:mm|cm|holes?|screws?|fillets?|chamfers?|slots?|ribs?|cutouts?|pockets?|threads?|handles?|tabs?|flanges?|bevels?|trees?|lakes?|rivers?|mountains?|buildings?|rooms?|walls?|windows?|doors?)\b/i,
      /\b(?:remove|delete|eliminate|take\s+away|cut\s+out)\s+(?:the\s+)?(?:[\w\s]{1,30})\b/i,
      /\b(?:fillet|chamfer|round|bevel|hollow|pocket|extrude|revolve|cut|draft)\b/i,
      /\b(?:change|set|switch|replace|swap)\s+(?:the\s+)?(?:[\w\s]{1,30}\s+)?(?:radius|diameter|height|width|length|thickness|color|material|finish|texture|appearance|dimension|shape|size)\b/i,
      /\b(?:color|paint|make)\s+(?:it|the\s+[\w\s]{1,20})\s+(?:red|blue|green|yellow|black|white|grey|gray|orange|purple|gold|silver|bronze|copper|chrome|metallic|transparent|opaque|glass)\b/i,
      /\b(?:material|make\s+it\s+out\s+of)\s+(?:metal|aluminum|steel|brass|wood|plastic|resin|glass|concrete|stone|pla|abs|petg|nylon)\b/i,
      /\b(?:set|make)\s+(?:the\s+)?\w+\s+(?:to|=)\s+\d+/i,
      /\b(?:more|fewer|less)\s+(?:trees?|hills?|valleys?|foliage|mountains?|detail|segments?|facets?)\b/i,
      /\b(?:taller|shorter|wider|thicker|narrower|longer|bigger|smaller|flatter|higher|lower)\b/i,
    ];

    if (modifyDirectives.some((pat) => pat.test(text))) {
      return true;
    }

    // 4. Pure informational questions without modification intent ("what is...", "why did...")
    if (/^(?:what|which|who|where|when|why)\s+(?:is|are|was|were|do|does|did)\b/i.test(text)) {
      return false;
    }

    // 5. In an active design session with prior CAD models, any prompt containing action verbs is a refinement
    return /\b(?:add|remove|change|give|put|create|place|move|rotate|shift|extend|shorten|raise|lower|color|hollow|split|join)\b/i.test(
      text
    );
  }

  const CAD_DESIGN_TARGETS_REGEX =
    /\b(?:3d|2d|cad|solid|mesh|replicad|stl|step|stp|dxf|dwg|printable|model|assembly|blueprint|layout|schematic|floor\s*plans?|floorplans?|architectur(?:e|al)|houses?|homes?|buildings?|residen(?:ce|tial)|villas?|apartments?|rooms?|walls?|courtyards?|garages?|patios?|decks?|sheds?|cabins?|foundations?|footings?|staircases?|brackets?|gears?|nuts?|bolts?|screws?|washers?|enclosures?|boxes?|cases?|housings?|flanges?|nozzles?|holders?|mounts?|stands?|standoffs?|chassis|cylinders?|spheres?|cones?|clamps?|clips?|pipes?|ducts?|bushings?|propellers?|hooks?|hangers?|handles?|knobs?|adapters?|trays?|caps?|covers?|lids?|vases?|planters?|plates?|wheels?|pulleys?|funnels?|racks?|bearings?|spacers?|couplings?|fittings?|taps?|faucets?|valves?|fixtures?|motors?|spouts?|drones?|hardware|devices?|parts?|products?)\b/i;

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

    // Check for direct modeling / design command (allows up to 6 intervening descriptive words/adjectives)
    const hasDirectModelingCommand =
      /\b(?:design|create|build|generate|make|draw|draft|construct|fabricate)\b(?:\s*[,;]?\s*[\w-]+){0,6}\s+(?:3d|2d|cad|solid|mesh|replicad|stl|step|stp|dxf|dwg|printable|model|assembly|blueprint|layout|schematic|floor\s*plans?|floorplans?|architectur(?:e|al)|houses?|homes?|buildings?|residen(?:ce|tial)|villas?|apartments?|rooms?|walls?|courtyards?|garages?|patios?|decks?|sheds?|cabins?|foundations?|footings?|staircases?|brackets?|gears?|nuts?|bolts?|screws?|washers?|enclosures?|boxes?|cases?|housings?|flanges?|nozzles?|holders?|mounts?|stands?|standoffs?|chassis|cylinders?|spheres?|cones?|clamps?|clips?|pipes?|ducts?|bushings?|propellers?|hooks?|hangers?|handles?|knobs?|adapters?|trays?|caps?|covers?|lids?|vases?|planters?|plates?|wheels?|pulleys?|funnels?|racks?|bearings?|spacers?|couplings?|fittings?|taps?|faucets?|valves?|fixtures?|motors?|spouts?|drones?|hardware|devices?|parts?|products?)\b/i.test(
        text
      );

    // 2. Pure questions without design intent (what, which, who, where, when, why, how)
    if (/^(?:what|which|who|where|when|why|how)\b/i.test(text)) return false;

    const isInformational =
      /^(?:can\s+you\s+explain|tell\s+me\s+about|explain|describe|give\s+me\s+advice|suggest|recommend|review|summarize)\b/i.test(text) ||
      /\b(?:how\s+to\s+slice|slicing\s+settings|infill|print\s+settings|bed\s+temperature|nozzle\s+temp|warping|layer\s+height|stringing|difference\s+between|compare)\b/i.test(text);

    if (isInformational && !hasDirectModelingCommand) return false;

    // 3. Pure documentation, manuals, spec sheets, code reviews
    if (
      /\b(?:write|provide|give|generate|create|make)\s+(?:me\s+)?(?:a\s+)?(?:documentation|docs|user\s+manual|manual|guide|spec\s*sheet|readme)\b/i.test(text) ||
      /^(?:documentation|docs|manual|guide|spec\s*sheet|overview|readme|summary|review\s+code|code\s+review)\b/i.test(text) ||
      /\b(?:code\s+review|review\s+code)\b/i.test(text)
    ) {
      if (!hasDirectModelingCommand) return false;
    }

    // 4. Direct 3D print command
    if (
      /\b(?:3d\s*print|print\s+(?:in\s+)?3d|print\s+(?:me\s+)?(?:a|an)?)\s+[\w\s]{2,40}\b/i.test(text) &&
      !/\b(?:how|why|settings?|temperature|bed|slicer|layer|infill|warping|issue)\b/i.test(text)
    ) {
      return true;
    }

    if (hasDirectModelingCommand) return true;

    // 5. Explicit CAD creation verbs coupled with CAD/architectural/mechanical targets
    const hasCreationVerb = /\b(?:design|create|build|generate|model|make|construct|extrude|revolve|fabricate|draw|draft)\b/i.test(text);
    const hasCadTarget = CAD_DESIGN_TARGETS_REGEX.test(text);

    // 6. Clarification option selection or auto-search directives
    if (
      /\b(?:proceed\s+with|select\s+option|option\s+[1-9]|none\s+of\s+the\s+above|auto-search|search\s+(?:google|web|specs?))\b/i.test(text)
    ) {
      return true;
    }

    return hasCreationVerb && hasCadTarget;
  }

  function extractFileArtifacts(text: string): { cleanText: string; artifacts: FileArtifact[] } {
    let cleanText = text;

    const artifacts: FileArtifact[] = [];
    const regex = /<file_artifact\s+filename="([^"]+)"(?:\s+type="([^"]+)")?(?:\s+title="([^"]+)")?>([\s\S]*?)<\/file_artifact>/gi;

    let match;

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

    // Support new specialized tool calling format: ```tool:<tool_name>\n{...}\n```
    const toolRegex = /```tool:([a-z_]+)\s*\n([\s\S]*?)```/gi;
    let toolMatch;
    const toolExtMap: Record<string, string> = {
      generate_word_document: "docx",
      generate_excel_sheet: "xlsx",
      generate_presentation: "pptx",
      generate_pdf_report: "pdf",
      generate_csv_export: "csv",
    };

    while ((toolMatch = toolRegex.exec(text)) !== null) {
      const toolName = toolMatch[1].trim();
      const rawData = toolMatch[2].trim();
      let data: any = rawData;
      try {
        data = JSON.parse(rawData);
      } catch {
        data = rawData;
      }
      const type = toolExtMap[toolName] || "txt";
      const title = data?.title || toolName.replace("generate_", "").replace(/_/g, " ").toUpperCase();
      const safeTitle = (title || "document").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
      artifacts.push({
        id: "tool-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        filename: `${safeTitle}.${type}`,
        type,
        title,
        data,
      });
    }

    // Support unclosed tool block if generation ended before closing backticks
    if (artifacts.length === 0) {
      const unclosedToolRegex = /```tool:([a-z_]+)\s*\n([\s\S]*?)$/gi;
      const unclosedMatch = unclosedToolRegex.exec(text);
      if (unclosedMatch) {
        const toolName = unclosedMatch[1].trim();
        const rawData = unclosedMatch[2].trim();
        try {
          const data = JSON.parse(rawData);
          const type = toolExtMap[toolName] || "txt";
          const title = data?.title || toolName.replace("generate_", "").replace(/_/g, " ").toUpperCase();
          const safeTitle = (title || "document").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
          artifacts.push({
            id: "tool-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
            filename: `${safeTitle}.${type}`,
            type,
            title,
            data,
          });
        } catch {
          // JSON incomplete or trailing
        }
      }
    }

    cleanText = cleanText.replace(/<file_artifact[\s\S]*?<\/file_artifact>/gi, "").trim();
    cleanText = cleanText.replace(/<file_artifact[\s\S]*$/gi, "").trim();
    cleanText = cleanText.replace(/```tool:[a-z_]+\s*\n[\s\S]*?```/gi, "").trim();
    cleanText = cleanText.replace(/```tool:[a-z_]+[\s\S]*$/gi, "").trim();

    return { cleanText, artifacts };
  }

  function cleanDisplayContent(text: string): string {
    let content = text.trim();
    // Strip any thinking tags if present in token stream
    content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").replace(/<thought>[\s\S]*?(?:<\/thought>|$)/gi, "");
    // Strip any file_artifact blocks from live streaming display
    content = content.replace(/<file_artifact[\s\S]*?(?:<\/file_artifact>|$)/gi, "");
    // Strip any tool call blocks from live streaming display
    content = content.replace(/```tool:[a-z_]+[\s\S]*?(?:```|$)/gi, "");
    // Strip any Replicad 3D CAD scripts / code blocks from being shown in chat
    const replicadPattern = /```(?:typescript|ts|javascript|js|replicad)?[\s\S]*?(?:export\s+default\s+function|defaultParams|replicad)[\s\S]*?(?:```|$)/gi;
    return content.replace(replicadPattern, "").trim();
  }

  function cleanFinalContent(explanation?: string, streamedContent?: string, hasReplicadCode?: boolean): string {
    let content = (explanation || streamedContent || "").trim();
    // Clean file_artifact blocks from final display (including unclosed tags)
    content = content.replace(/<file_artifact[\s\S]*?(?:<\/file_artifact>|$)/gi, "").trim();
    content = content.replace(/```tool:[a-z_]+[\s\S]*?(?:```|$)/gi, "").trim();
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

    // Only refine if a prior 3D model exists AND the user prompt is asking to modify it
    const previousAssistantMsg = [...activeSession.messages]
      .reverse()
      .find((m) => m.role === "assistant" && (m.cadResponse?.replicad_code || m.cadResponse?.threejs_code));

    const isRefinement =
      Boolean(previousAssistantMsg?.cadResponse?.replicad_code || previousAssistantMsg?.cadResponse?.threejs_code) &&
      isCadModificationIntent(promptText);

    const isCadTask = isRefinement || isCadTaskIntent(promptText) || engineMode !== "auto";

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

      // Commercial Multi-Turn Context: Window of recent dialogue turns (ensuring full chat & 3D context is preserved)
      const conversationHistory: ChatHistoryMessage[] = activeSession.messages
        .filter((m) => !m.error && (m.content || (m.artifacts && m.artifacts.length > 0) || m.cadResponse?.replicad_code || m.cadResponse?.threejs_code))
        .slice(-10)
        .map((m) => {
          let text = m.content || "";
          if (!text && m.role === "assistant") {
            if (m.cadResponse?.raw_explanation) {
              text = m.cadResponse.raw_explanation;
            } else if (m.cadResponse?.threejs_code) {
              text = "Generated procedural Three.js WebGL 3D scene.";
            } else if (m.cadResponse?.replicad_code) {
              const paramsSummary =
                m.cadResponse.parameters && Object.keys(m.cadResponse.parameters).length > 0
                  ? ` with parameters: ${JSON.stringify(m.cadResponse.parameters)}`
                  : "";
              const partsSummary =
                m.cadResponse.parts && m.cadResponse.parts.length > 0
                  ? ` containing parts: ${m.cadResponse.parts.map((p) => p.name).join(", ")}`
                  : "";
              text = `Generated 3D CAD model${paramsSummary}${partsSummary}.`;
            } else if (m.artifacts && m.artifacts.length > 0) {
              text = `Generated document artifact(s): ${m.artifacts.map((a) => a.title || a.filename).join(", ")}.`;
            }
          }
          return {
            role: m.role,
            content: text,
          };
        })
        .filter((m) => Boolean(m.content));

      const shouldSearch =
        /\b(?:search\s+google|search\s+web|auto-search|none\s+of\s+the\s+above|google\s+search)\b/i.test(promptText);

      const previousCode = previousAssistantMsg?.cadResponse?.threejs_code || previousAssistantMsg?.cadResponse?.replicad_code || "";
      if (isRefinement && previousAssistantMsg?.cadResponse) {
        cadResult = await refineCadStream(
          promptText,
          previousCode,
          previousAssistantMsg.cadResponse.parameters || {},
          settings,
          onThought,
          onToken,
          onReset,
          conversationHistory,
          shouldSearch,
          engineMode
        );
      } else {
        cadResult = await generateCadStream(
          promptText,
          settings,
          onThought,
          onToken,
          onReset,
          undefined,
          conversationHistory,
          shouldSearch,
          engineMode
        );
      }

      let cadGeometry = undefined;
      let cadErrorMessage: string | undefined = undefined;
      const hasThreejsCode = Boolean(cadResult?.threejs_code && cadResult.threejs_code.trim().length > 0);
      const hasCadCode = Boolean(cadResult?.replicad_code && cadResult.replicad_code.trim().length > 0);

      if (hasThreejsCode) {
        const sceneId = "threejs-" + (cadResult.prompt_id?.slice(0, 10) || Date.now().toString(36));
        cadGeometry = {
          status: "success" as const,
          modelId: sceneId,
          engine_mode: "threejs",
          threejs_code: cadResult.threejs_code,
          metrics: {
            boundingBox: {
              min: [-50, 0, -50] as [number, number, number],
              max: [50, 25, 50] as [number, number, number],
              dimensions: { width: 100, depth: 100, height: 25 },
            },
            volume: 0,
            vertexCount: 15000,
            triangleCount: 30000,
          },
          cached: false,
          executionTimeMs: cadResult.latency_ms || 100,
          availableExports: ["stl"],
        };
      } else if (hasCadCode) {
        try {
          const geo = await generateModelGeometry(cadResult.replicad_code, cadResult.parameters || {});
          if (geo?.status === "success" && geo?.modelId) {
            cadGeometry = geo;
          } else {
            cadErrorMessage = "Kernel failed to compute solid geometry.";
          }
        } catch (cadErr: any) {
          const errMsg = cadErr?.message || String(cadErr);
          cadErrorMessage = errMsg;
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
                cadErrorMessage = undefined;
                console.log("[CAD AUTO-REPAIR] Successfully self-healed and generated 3D geometry!");
              } else {
                cadErrorMessage = `Auto-repair kernel notice: ${errMsg}`;
              }
            }
          } catch (repairErr: any) {
            cadErrorMessage = repairErr?.message || errMsg;
            console.error("[CAD AUTO-REPAIR] Self-healing repair failed:", repairErr);
          }
        }
      }

      const rawExplanation = cadResult.raw_explanation || accumulatedContent;
      const { cleanText, artifacts } = extractFileArtifacts(rawExplanation);

      // Merge structured tool_calls returned natively by the backend
      if (cadResult?.tool_calls && cadResult.tool_calls.length > 0) {
        for (const tc of cadResult.tool_calls) {
          if (!artifacts.some((a) => a.filename === tc.filename)) {
            artifacts.push({
              id: "tool-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
              filename: tc.filename,
              type: tc.artifact_type,
              title: tc.title,
              data: tc.data,
            });
          }
        }
      }

      if (cadResult?.parameters && artifacts.length > 0) {
        artifacts.forEach((art) => {
          if (typeof art.data === "object" && art.data !== null) {
            const d = art.data as Record<string, unknown>;
            d.parameters = { ...((d.parameters as Record<string, unknown>) || {}), ...cadResult.parameters };
          }
        });
      }

      const displayContent = cleanFinalContent(cleanText, accumulatedContent, Boolean(hasCadCode));
      const finalContent = displayContent || (artifacts.length > 0 ? `Generated ${artifacts.map((a) => a.title || a.filename).join(", ")}.` : "");

      const finalAssistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: finalContent,
        isStreaming: false,
        isThinking: false,
        thoughts: accumulatedThoughts.trim() || cadResult.raw_thoughts || undefined,
        cadResponse: hasCadCode ? cadResult : undefined,
        geometry: cadGeometry || undefined,
        cadError: hasCadCode && !cadGeometry ? cadErrorMessage : undefined,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        toolCalls: cadResult?.tool_calls && cadResult.tool_calls.length > 0 ? cadResult.tool_calls : undefined,
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

    // Check if there was any prior assistant message with 3D code before this prompt
    const previousAssistantMsg = [...messagesBefore]
      .reverse()
      .find((m) => m.role === "assistant" && (m.cadResponse?.replicad_code || m.cadResponse?.threejs_code));

    const isRefinement =
      Boolean(previousAssistantMsg?.cadResponse?.replicad_code || previousAssistantMsg?.cadResponse?.threejs_code) &&
      isCadModificationIntent(newPromptText);

    const isCadTask = isRefinement || isCadTaskIntent(newPromptText) || engineMode !== "auto";

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

      // Commercial Multi-Turn Context: Window of prior dialogue turns (ensuring full chat & 3D context is preserved)
      const conversationHistory: ChatHistoryMessage[] = messagesBefore
        .filter((m) => !m.error && (m.content || (m.artifacts && m.artifacts.length > 0) || m.cadResponse?.replicad_code || m.cadResponse?.threejs_code))
        .slice(-10)
        .map((m) => {
          let text = m.content || "";
          if (!text && m.role === "assistant") {
            if (m.cadResponse?.raw_explanation) {
              text = m.cadResponse.raw_explanation;
            } else if (m.cadResponse?.threejs_code) {
              text = "Generated procedural Three.js WebGL 3D scene.";
            } else if (m.cadResponse?.replicad_code) {
              const paramsSummary =
                m.cadResponse.parameters && Object.keys(m.cadResponse.parameters).length > 0
                  ? ` with parameters: ${JSON.stringify(m.cadResponse.parameters)}`
                  : "";
              const partsSummary =
                m.cadResponse.parts && m.cadResponse.parts.length > 0
                  ? ` containing parts: ${m.cadResponse.parts.map((p) => p.name).join(", ")}`
                  : "";
              text = `Generated 3D CAD model${paramsSummary}${partsSummary}.`;
            } else if (m.artifacts && m.artifacts.length > 0) {
              text = `Generated document artifact(s): ${m.artifacts.map((a) => a.title || a.filename).join(", ")}.`;
            }
          }
          return {
            role: m.role,
            content: text,
          };
        })
        .filter((m) => Boolean(m.content));

      const shouldSearch =
        /\b(?:search\s+google|search\s+web|auto-search|none\s+of\s+the\s+above|google\s+search)\b/i.test(newPromptText);

      const previousCode = previousAssistantMsg?.cadResponse?.threejs_code || previousAssistantMsg?.cadResponse?.replicad_code || "";
      if (isRefinement && previousAssistantMsg?.cadResponse) {
        cadResult = await refineCadStream(
          newPromptText,
          previousCode,
          previousAssistantMsg.cadResponse.parameters || {},
          settings,
          onThought,
          onToken,
          onReset,
          conversationHistory,
          shouldSearch,
          engineMode
        );
      } else {
        cadResult = await generateCadStream(
          newPromptText,
          settings,
          onThought,
          onToken,
          onReset,
          undefined,
          conversationHistory,
          shouldSearch,
          engineMode
        );
      }

      let cadGeometry = undefined;
      let cadErrorMessage: string | undefined = undefined;
      const hasThreejsCode = Boolean(cadResult?.threejs_code && cadResult.threejs_code.trim().length > 0);
      const hasCadCode = Boolean(cadResult?.replicad_code && cadResult.replicad_code.trim().length > 0);

      if (hasThreejsCode) {
        const sceneId = "threejs-" + (cadResult.prompt_id?.slice(0, 10) || Date.now().toString(36));
        cadGeometry = {
          status: "success" as const,
          modelId: sceneId,
          engine_mode: "threejs",
          threejs_code: cadResult.threejs_code,
          metrics: {
            boundingBox: {
              min: [-50, 0, -50] as [number, number, number],
              max: [50, 25, 50] as [number, number, number],
              dimensions: { width: 100, depth: 100, height: 25 },
            },
            volume: 0,
            vertexCount: 15000,
            triangleCount: 30000,
          },
          cached: false,
          executionTimeMs: cadResult.latency_ms || 100,
          availableExports: ["stl"],
        };
      } else if (hasCadCode) {
        try {
          const geo = await generateModelGeometry(cadResult.replicad_code, cadResult.parameters || {});
          if (geo?.status === "success" && geo?.modelId) {
            cadGeometry = geo;
          } else {
            cadErrorMessage = "Kernel failed to compute solid geometry.";
          }
        } catch (cadErr: any) {
          const errMsg = cadErr?.message || String(cadErr);
          cadErrorMessage = errMsg;
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
                cadErrorMessage = undefined;
                console.log("[CAD AUTO-REPAIR] Successfully self-healed and generated 3D geometry!");
              } else {
                cadErrorMessage = `Auto-repair kernel notice: ${errMsg}`;
              }
            }
          } catch (repairErr: any) {
            cadErrorMessage = repairErr?.message || errMsg;
            console.error("[CAD AUTO-REPAIR] Self-healing repair failed:", repairErr);
          }
        }
      }

      const rawExplanation = cadResult.raw_explanation || accumulatedContent;
      const { cleanText, artifacts } = extractFileArtifacts(rawExplanation);

      // Merge structured tool_calls returned natively by the backend
      if (cadResult?.tool_calls && cadResult.tool_calls.length > 0) {
        for (const tc of cadResult.tool_calls) {
          if (!artifacts.some((a) => a.filename === tc.filename)) {
            artifacts.push({
              id: "tool-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
              filename: tc.filename,
              type: tc.artifact_type,
              title: tc.title,
              data: tc.data,
            });
          }
        }
      }

      if (cadResult?.parameters && artifacts.length > 0) {
        artifacts.forEach((art) => {
          if (typeof art.data === "object" && art.data !== null) {
            const d = art.data as Record<string, unknown>;
            d.parameters = { ...((d.parameters as Record<string, unknown>) || {}), ...cadResult.parameters };
          }
        });
      }

      const displayContent = cleanFinalContent(cleanText, accumulatedContent, Boolean(hasCadCode));
      const finalContent = displayContent || (artifacts.length > 0 ? `Generated ${artifacts.map((a) => a.title || a.filename).join(", ")}.` : "");

      const finalAssistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: finalContent,
        isStreaming: false,
        isThinking: false,
        thoughts: accumulatedThoughts.trim() || cadResult.raw_thoughts || undefined,
        cadResponse: hasCadCode ? cadResult : undefined,
        geometry: cadGeometry || undefined,
        cadError: hasCadCode && !cadGeometry ? cadErrorMessage : undefined,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        toolCalls: cadResult?.tool_calls && cadResult.tool_calls.length > 0 ? cadResult.tool_calls : undefined,
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
                  onNewChat={handleNewSession}
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
            engineMode={engineMode}
            onEngineModeChange={setEngineMode}
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
