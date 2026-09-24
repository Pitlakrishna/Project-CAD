"use client";

import React, { useState, useEffect, useRef } from "react";
import { IconBrain, IconChevronDown, IconSparkles, IconCopy, IconCheck } from "./icons";

interface ThoughtAccordionProps {
  thoughts: string;
  isThinking: boolean;
}

export function ThoughtAccordion({ thoughts, isThinking }: ThoughtAccordionProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track thinking elapsed time
  useEffect(() => {
    let intervalId: any = null;

    if (isThinking) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      setIsExpanded(true);

      intervalId = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedMs(Date.now() - startTimeRef.current);
        }
      }, 100);
    } else {
      if (startTimeRef.current) {
        setElapsedMs(Date.now() - startTimeRef.current);
      }
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isThinking]);

  // Auto-scroll to bottom of thought stream while thinking is active
  useEffect(() => {
    if (isThinking && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [thoughts, isThinking]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!thoughts) return;
    navigator.clipboard.writeText(thoughts);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);

  if (!thoughts && !isThinking) {
    return null;
  }

  return (
    <div
      className={`w-full my-2.5 rounded-xl border transition-all duration-200 overflow-hidden ${
        isThinking
          ? "bg-[#14171a]/80 border-sky-500/30 shadow-xs shadow-sky-500/5"
          : "bg-[#151515] border-[#262626] hover:border-[#333333]"
      }`}
    >
      {/* 1. Header Bar (Clickable) */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3.5 py-2 flex items-center justify-between text-left cursor-pointer transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${
              isThinking
                ? "bg-sky-500/20 text-sky-400 animate-pulse"
                : "bg-[#222222] text-[#8e8e8e]"
            }`}
          >
            {isThinking ? (
              <IconSparkles className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <IconBrain className="w-3.5 h-3.5" />
            )}
          </div>

          <div className="flex items-center gap-2 text-xs truncate">
            <span className={`font-medium ${isThinking ? "text-sky-300" : "text-[#b0b0b0]"}`}>
              {isThinking ? "Thinking Process" : "Thought Process"}
            </span>

            <span className="text-[10px] text-[#6b6b6b] font-mono">
              {isThinking ? `${elapsedSeconds}s` : elapsedMs > 0 ? `(${elapsedSeconds}s)` : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {/* Copy Thought Button */}
          {thoughts && !isThinking && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded text-[#737373] hover:text-[#e0e0e0] hover:bg-[#222] transition-colors"
              title="Copy thought process"
            >
              {copied ? (
                <IconCheck className="w-3 h-3 text-emerald-400" />
              ) : (
                <IconCopy className="w-3 h-3" />
              )}
            </button>
          )}

          <div
            className={`text-[#737373] transition-transform duration-200 ${
              isExpanded ? "rotate-180" : "rotate-0"
            }`}
          >
            <IconChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>
      </button>

      {/* 2. Expanded Collapsible Body */}
      {isExpanded && (
        <div
          ref={scrollContainerRef}
          className="px-3.5 py-2.5 border-t border-[#222222] max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed text-[#9e9e9e] whitespace-pre-wrap select-text selection:bg-sky-500/20"
        >
          {thoughts ? (
            thoughts
          ) : (
            <div className="flex items-center gap-2 text-sky-400/80 italic text-xs py-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
              <span>Analyzing geometric constraints and architectural requirements...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
