"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChatMessage } from "../lib/types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { CadModelCard } from "./CadModelCard";
import { ThoughtAccordion } from "./ThoughtAccordion";
import { DynamicArtifactCard } from "./DynamicArtifactCard";
import {
  IconCube,
  IconCopy,
  IconCheck,
  IconEdit,
  IconClose,
  IconSend,
  IconGear,
} from "./icons";


interface ChatMessageItemProps {
  message: ChatMessage;
  userPrompt?: string;
  onResubmitPrompt?: (messageId: string, newText: string) => void;
  onRefinePrompt?: (suggestion: string) => void;
  onOpenSettings?: () => void;
  isLoading?: boolean;
}

export function ChatMessageItem({
  message,
  userPrompt,
  onResubmitPrompt,
  onRefinePrompt,
  onOpenSettings,
  isLoading,
}: ChatMessageItemProps) {
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [userCopied, setUserCopied] = useState(false);
  const [assistantCopied, setAssistantCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto focus and adjust height when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        300
      )}px`;
    }
  }, [isEditing]);

  const handleCopyUserPrompt = () => {
    navigator.clipboard.writeText(message.content);
    setUserCopied(true);
    setTimeout(() => setUserCopied(false), 2000);
  };

  const handleCopyAssistant = () => {
    navigator.clipboard.writeText(message.content);
    setAssistantCopied(true);
    setTimeout(() => setAssistantCopied(false), 2000);
  };

  const handleStartEdit = () => {
    setEditText(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditText(message.content);
    setIsEditing(false);
  };

  const handleSaveAndSubmit = () => {
    if (!editText.trim() || isLoading) return;
    setIsEditing(false);
    onResubmitPrompt?.(message.id, editText.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveAndSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  return (
    <div
      className={`group flex gap-3.5 ${isUser ? "justify-end" : "justify-start"
        } w-full transition-all`}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-xl bg-[#212121] border border-[#303030] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
          <IconCube className="w-3.5 h-3.5" />
        </div>
      )}

      <div
        className={`flex flex-col ${isUser
          ? "max-w-[90%] sm:max-w-[80%] items-end"
          : "max-w-full flex-1 items-start min-w-0"
          }`}
      >
        {isUser ? (
          /* User Message Content */
          <div className="flex flex-col items-end gap-1.5 w-full">
            {isEditing ? (
              /* Inline Edit Mode */
              <div className="w-full min-w-[280px] sm:min-w-[420px] rounded-2xl bg-[#1c1c1c] border border-[#383838] p-3 shadow-lg flex flex-col gap-2.5">
                <textarea
                  ref={textareaRef}
                  value={editText}
                  onChange={(e) => {
                    setEditText(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(
                      e.target.scrollHeight,
                      300
                    )}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent text-sm text-[#f4f4f4] placeholder-[#737373] resize-none outline-none leading-relaxed font-sans"
                  placeholder="Edit your prompt..."
                  rows={2}
                />

                <div className="flex items-center justify-between border-t border-[#2a2a2a] pt-2 text-xs">
                  <span className="text-[11px] text-[#737373] hidden sm:inline">
                    Press <kbd className="px-1 py-0.5 rounded bg-[#262626] text-[#a3a3a3]">Enter</kbd> to submit, <kbd className="px-1 py-0.5 rounded bg-[#262626] text-[#a3a3a3]">Esc</kbd> to cancel
                  </span>

                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-[#8e8e8e] hover:text-white hover:bg-[#282828] transition-colors cursor-pointer"
                    >
                      <IconClose className="w-3 h-3" />
                      <span>Cancel</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveAndSubmit}
                      disabled={!editText.trim() || isLoading}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white text-black hover:bg-[#e6e6e6] disabled:opacity-40 disabled:cursor-not-allowed font-medium text-xs transition-all shadow-xs cursor-pointer"
                    >
                      <IconSend className="w-3 h-3" />
                      <span>Save & Submit</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Display Mode */
              <>
                <div className="px-4 py-2.5 rounded-2xl bg-[#212121] border border-[#2f2f2f] text-sm text-[#f4f4f4] leading-relaxed shadow-xs break-words max-w-full">
                  {message.content}
                </div>

                {/* User Prompt Action Buttons (Edit, Copy) */}
                <div className="flex items-center gap-1 opacity-75 group-hover:opacity-100 transition-opacity">
                  {/* Copy Button */}
                  <button
                    type="button"
                    onClick={handleCopyUserPrompt}
                    className="flex items-center gap-1 text-[11px] text-[#8e8e8e] hover:text-[#f4f4f4] px-2 py-0.5 rounded-md hover:bg-[#1f1f1f] border border-transparent hover:border-[#2a2a2a] transition-all cursor-pointer"
                    title="Copy prompt"
                  >
                    {userCopied ? (
                      <>
                        <IconCheck className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <IconCopy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  {/* Edit Button */}
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    disabled={isLoading}
                    className="flex items-center gap-1 text-[11px] text-[#8e8e8e] hover:text-[#f4f4f4] px-2 py-0.5 rounded-md hover:bg-[#1f1f1f] border border-transparent hover:border-[#2a2a2a] transition-all disabled:opacity-40 cursor-pointer"
                    title="Edit prompt"
                  >
                    <IconEdit className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Assistant Message Content */
          <div className="w-full text-sm text-[#dcdcdc] leading-relaxed space-y-2.5 min-w-0">
            {message.error ? (
              (() => {
                const isRateLimit =
                  (message.content && (
                    message.content.includes("Rate limit exceeded") ||
                    message.content.includes("API usage quota")
                  )) ||
                  (typeof message.error === "string" && (
                    message.error.toLowerCase().includes("429") ||
                    message.error.toLowerCase().includes("resource_exhausted") ||
                    message.error.toLowerCase().includes("quota") ||
                    message.error.toLowerCase().includes("rate limit") ||
                    message.error.toLowerCase().includes("rate_limit")
                  ));

                if (isRateLimit) {
                  return (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 mt-0.5 shrink-0">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-amber-300 text-sm">API Quota / Rate Limit Exceeded</span>
                          </div>
                          <p className="text-amber-200/90 leading-relaxed text-xs">
                            You have reached daily limit. Please switch to another provider in Settings or try again tomorrow.
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/40 text-xs text-red-300">
                    {message.content}
                  </div>
                );
              })()
            ) : (
              <>
                {/* Live Thinking / Thought Process Accordion */}
                {(Boolean(message.thoughts) || message.isThinking) && (
                  <ThoughtAccordion
                    thoughts={message.thoughts || ""}
                    isThinking={Boolean(message.isThinking)}
                  />
                )}

                {/* Markdown Response with live word-by-word streaming cursor */}
                <div className="w-full">
                  {message.content ? (
                    <div className="relative">
                      <MarkdownRenderer content={message.content} />
                      {message.isStreaming && (
                        <span className="inline-block w-1.5 h-4 ml-1 bg-white/80 animate-pulse align-middle" />
                      )}
                    </div>
                  ) : message.isStreaming && !message.isThinking ? (
                    <div className="flex items-center gap-2 text-xs text-[#8e8e8e] py-1">
                      <span className="inline-block w-1.5 h-4 bg-white/80 animate-pulse" />
                      <span>Generating response...</span>
                    </div>
                  ) : null}
                </div>

                {/* 3D CAD Model Export Card (Dimensions, Volume, Prompt-Driven Dynamic Exports) */}
                {message.geometry && !message.isStreaming && (
                  <CadModelCard
                    geometry={message.geometry}
                    cadResponse={message.cadResponse}
                    userPrompt={userPrompt || message.userPrompt}
                  />
                )}

                {/* Dynamic File Artifacts (Word .docx, Excel .xlsx, PowerPoint .pptx, PDF, CSV) */}
                {message.artifacts && message.artifacts.length > 0 && !message.isStreaming && (
                  <div className="w-full space-y-2">
                    {message.artifacts.map((art) => (
                      <DynamicArtifactCard key={art.id || art.filename} artifact={art} />
                    ))}
                  </div>
                )}


                {/* Assistant Action Bar: Copy */}
                {!message.isStreaming && Boolean(message.content) && (
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={handleCopyAssistant}
                      className="flex items-center gap-1.5 text-xs text-[#8e8e8e] hover:text-[#f4f4f4] px-2.5 py-1 rounded-lg bg-[#171717] hover:bg-[#222222] border border-[#262626] hover:border-[#333333] transition-colors cursor-pointer shadow-2xs"
                      title="Copy response to clipboard"
                    >
                      {assistantCopied ? (
                        <>
                          <IconCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-medium">Copied!</span>
                        </>
                      ) : (
                        <>
                          <IconCopy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

