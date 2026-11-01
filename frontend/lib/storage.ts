import { AppSettings, ChatSession } from "./types";

const SETTINGS_STORAGE_KEY = "aicad_app_settings_v1";
const SESSIONS_STORAGE_KEY = "aicad_chat_sessions_v1";
const ACTIVE_SESSION_STORAGE_KEY = "aicad_active_session_id_v1";

export const DEFAULT_SETTINGS: AppSettings = {
  selectedProvider: "gemini",
  backendUrl: (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BACKEND_URL) || "http://127.0.0.1:8000",
  openaiApiKey: "",
  openaiChatModel: "gpt-4o-mini",
  openaiCadModel: "gpt-4o",
  openaiBaseUrl: "",
  anthropicApiKey: "",
  anthropicChatModel: "claude-3-5-haiku-20241022",
  anthropicCadModel: "claude-3-5-sonnet-20241022",
  geminiApiKey: "",
  geminiChatModel: "gemini-2.0-flash",
  geminiCadModel: "gemini-2.5-flash",
  groqApiKey: "",
  groqChatModel: "llama-3.1-8b-instant",
  groqCadModel: "llama-3.3-70b-versatile",
  deepseekApiKey: "",
  deepseekChatModel: "deepseek-chat",
  deepseekCadModel: "deepseek-chat",
  deepseekBaseUrl: "https://api.deepseek.com",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "deepseek-coder:6.7b",
  temperature: 0.2,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (parsed.selectedProvider === "mock" || parsed.selectedProvider === "ollama") {
      parsed.selectedProvider = "gemini";
    }
    if (parsed.backendUrl === "http://localhost:8000") {
      parsed.backendUrl = "http://127.0.0.1:8000";
    }
    // Ensure separate chat and CAD models are explicitly initialized
    if (!parsed.geminiChatModel || parsed.geminiChatModel.includes("3.5") || parsed.geminiChatModel.includes("3.8")) {
      parsed.geminiChatModel = "gemini-2.0-flash";
    }
    if (!parsed.geminiCadModel || parsed.geminiCadModel.includes("3.8") || parsed.geminiCadModel.includes("3.5")) {
      parsed.geminiCadModel = "gemini-2.5-flash";
    }
    if (!parsed.openaiChatModel) {
      parsed.openaiChatModel = "gpt-4o-mini";
    }
    if (!parsed.openaiCadModel) {
      parsed.openaiCadModel = "gpt-4o";
    }
    if (!parsed.anthropicChatModel) {
      parsed.anthropicChatModel = "claude-3-5-haiku-20241022";
    }
    if (!parsed.anthropicCadModel) {
      parsed.anthropicCadModel = "claude-3-5-sonnet-20241022";
    }
    if (!parsed.groqChatModel || parsed.groqChatModel === "openai/gpt-oss-20b") {
      parsed.groqChatModel = "llama-3.1-8b-instant";
    }
    if (!parsed.groqCadModel) {
      parsed.groqCadModel = "llama-3.3-70b-versatile";
    }
    if (!parsed.deepseekChatModel) {
      parsed.deepseekChatModel = "deepseek-chat";
    }
    if (!parsed.deepseekCadModel) {
      parsed.deepseekCadModel = "deepseek-chat";
    }
    if (!parsed.deepseekBaseUrl) {
      parsed.deepseekBaseUrl = "https://api.deepseek.com";
    }
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    console.error("Failed to load settings from localStorage:", e);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save settings to localStorage:", e);
  }
}

export function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load sessions from localStorage:", e);
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error("Failed to save sessions to localStorage:", e);
  }
}

export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
}

export function setActiveSessionId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, id);
}
