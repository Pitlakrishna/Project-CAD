"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChatMessage } from "../lib/types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  IconCube,
  IconCopy,
  IconCheck,
  IconEdit,
  IconClose,
  IconSend,
} from "./icons";


interface ChatMessageItemProps {
  message: ChatMessage;
  onResubmitPrompt?: (messageId: string, newText: string) => void;
  onRefinePrompt?: (suggestion: string) => void;
  isLoading?: boolean;
}

export function ChatMessageItem({
  message,
  onResubmitPrompt,
  onRefinePrompt,
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
      className={`group flex gap-3.5 ${
        isUser ? "justify-end" : "justify-start"
      } w-full transition-all`}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-xl bg-[#212121] border border-[#303030] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
          <IconCube className="w-3.5 h-3.5" />
        </div>
      )}

      <div
        className={`flex flex-col ${
          isUser
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
              <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/40 text-xs text-red-300">
                {message.content}
              </div>
            ) : (
              <>

                {/* Markdown Response with live word-by-word streaming cursor */}
                <div className="w-full">
                  {message.content ? (
                    <div className="relative">
                      <MarkdownRenderer content={message.content} />
                      {message.isStreaming && (
                        <span className="inline-block w-1.5 h-4 ml-1 bg-white/80 animate-pulse align-middle" />
                      )}
                    </div>
                  ) : message.isStreaming ? (
                    <div className="flex items-center gap-2 text-xs text-[#8e8e8e] py-1">
                      <span className="inline-block w-1.5 h-4 bg-white/80 animate-pulse" />
                      <span>Generating response...</span>
                    </div>
                  ) : null}
                </div>

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

