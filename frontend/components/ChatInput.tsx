import React, { useState, useRef, useEffect } from "react";
import { ProviderType } from "../lib/types";
import { IconSend, IconSparkles } from "./icons";

interface ChatInputProps {
  onSendMessage: (prompt: string) => void;
  isLoading: boolean;
  selectedProvider: ProviderType;
  onOpenSettings: () => void;
}

const PROMPT_SUGGESTIONS = [
  { label: "Electronics Junction Box", prompt: "Create an electronics junction box with mounting holes, a clear glass inspection lid, and stainless steel fasteners" },
  { label: "Camera Optical Tube", prompt: "Generate an optical camera lens housing barrel with precision inner threading and glass optics" },
  { label: "Parametric Planetary Gearbox", prompt: "Design a parametric planetary gearbox carrier with sun, planet, and ring gear mounts in matte nylon" },
  { label: "Drone Motor Bracket", prompt: "Create a lightweight drone motor mount bracket with 4x M3 screw slots and cable routing channels" },
];

export function ChatInput({
  onSendMessage,
  isLoading,
  selectedProvider,
  onOpenSettings,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setInput(suggestion);
    textareaRef.current?.focus();
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      {/* Quick Prompt Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 no-scrollbar">
        {PROMPT_SUGGESTIONS.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSelectSuggestion(item.prompt)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1c1c1c] hover:bg-[#262626] border border-[#2b2b2b] hover:border-[#383838] text-xs text-[#a3a3a3] hover:text-[#f4f4f4] transition-all shrink-0 cursor-pointer"
          >
            <IconSparkles className="w-3 h-3 text-[#737373]" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Floating ChatGPT / Gemini Style Input Pill */}
      <div className="relative flex flex-col rounded-2xl bg-[#212121] border border-[#303030] focus-within:border-[#4d4d4d] focus-within:ring-1 focus-within:ring-[#4d4d4d] shadow-lg transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe any 3D model, parts, dimensions, and materials..."
          rows={1}
          disabled={isLoading}
          className="w-full pt-3.5 pb-2 px-4 bg-transparent text-sm text-[#f4f4f4] placeholder-[#737373] resize-none focus:outline-hidden max-h-[180px] leading-relaxed disabled:opacity-50"
        />

        {/* Input Actions Bar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          {/* Active provider tag that opens settings when clicked */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-[#8e8e8e] hover:text-[#e5e5e5] hover:bg-[#2b2b2b] transition-colors cursor-pointer"
            title="Click to configure provider & API keys"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="capitalize">{selectedProvider} mode</span>
            <span className="text-[#555]">(change)</span>
          </button>

          {/* Send Button */}
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isLoading}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              input.trim() && !isLoading
                ? "bg-white text-black hover:bg-neutral-200 shadow-xs"
                : "bg-[#2d2d2d] text-[#666] cursor-not-allowed"
            }`}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <IconSend className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className="text-center pt-2 text-[11px] text-[#737373]">
        AICAD translates prompts into watertight parametric Replicad TypeScript geometry.
      </div>
    </div>
  );
}
