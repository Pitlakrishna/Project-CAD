"use client";

import React, { useState } from "react";
import { CadGenerationResponse } from "../lib/types";
import {
  IconCode,
  IconCopy,
  IconCheck,
  IconDownload,
  IconLayers,
  IconSliders,
  IconSparkles,
  IconCube,
  IconChevronDown,
} from "./icons";

interface CadCodeViewerProps {
  data: CadGenerationResponse;
  onRefinePrompt?: (prompt: string) => void;
}

export function CadCodeViewer({ data, onRefinePrompt }: CadCodeViewerProps) {
  const [activeTab, setActiveTab] = useState<"code" | "parts" | "params">("code");
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.replicad_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([data.replicad_code], { type: "text/typescript;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `model-${data.prompt_id.slice(0, 8)}.ts`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-3 w-full rounded-2xl bg-[#171717] border border-[#2a2a2a] overflow-hidden shadow-md">
      {/* Header Summary Bar with Expand/Collapse Toggle */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#141414] border-b border-[#262626]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[#222222] border border-[#2e2e2e] flex items-center justify-center text-white">
            <IconCube className="w-3 h-3 text-sky-400" />
          </div>
          <span className="text-xs font-medium text-[#f0f0f0]">3D CAD Model Generated</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f1f] text-[#a3a3a3] border border-[#2c2c2c] font-mono">
            {data.parts?.length || 1} parts
          </span>
          {Object.keys(data.parameters || {}).length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f1f] text-[#a3a3a3] border border-[#2c2c2c] font-mono hidden sm:inline">
              {Object.keys(data.parameters || {}).length} params
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-[#8e8e8e] hover:text-white hover:bg-[#242424] transition-colors cursor-pointer"
            title="Copy Replicad code"
          >
            {copied ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconCopy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? "Copied!" : "Copy"}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-[#8e8e8e] hover:text-white hover:bg-[#242424] transition-colors cursor-pointer"
            title="Download .ts file"
          >
            <IconDownload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export .ts</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-white bg-[#222222] hover:bg-[#2c2c2c] border border-[#333333] transition-colors cursor-pointer"
          >
            <span>{isExpanded ? "Hide Details" : "View Code & Details"}</span>
            <IconChevronDown className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Expanded Content: Tabs, Code Viewer, Assembly Parts, Parameters, and Refinement */}
      {isExpanded && (
        <>
          {/* Tabs bar */}
          <div className="flex items-center px-3 py-1.5 border-b border-[#262626] bg-[#111111]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("code")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${activeTab === "code"
                  ? "bg-[#242424] text-white"
                  : "text-[#8e8e8e] hover:text-[#f4f4f4] hover:bg-[#1c1c1c]"
                  }`}
              >
                <IconCode className="w-3.5 h-3.5" />
                <span>Replicad Code</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("parts")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${activeTab === "parts"
                  ? "bg-[#242424] text-white"
                  : "text-[#8e8e8e] hover:text-[#f4f4f4] hover:bg-[#1c1c1c]"
                  }`}
              >
                <IconLayers className="w-3.5 h-3.5" />
                <span>Assembly Parts ({data.parts?.length || 0})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("params")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${activeTab === "params"
                  ? "bg-[#242424] text-white"
                  : "text-[#8e8e8e] hover:text-[#f4f4f4] hover:bg-[#1c1c1c]"
                  }`}
              >
                <IconSliders className="w-3.5 h-3.5" />
                <span>Parameters ({Object.keys(data.parameters || {}).length})</span>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="p-4">
            {/* Tab 1: Code */}
            {activeTab === "code" && (
              <div className="relative">
                <pre className="max-h-[360px] overflow-y-auto p-3.5 rounded-xl bg-[#0f0f0f] border border-[#242424] text-xs font-mono text-[#dcdcdc] leading-relaxed select-all">
                  <code>{data.replicad_code}</code>
                </pre>
              </div>
            )}

            {/* Tab 2: Assembly Parts & Materials */}
            {activeTab === "parts" && (
              <div className="space-y-3">
                {(!data.parts || data.parts.length === 0) ? (
                  <div className="text-xs text-[#737373] text-center py-6">
                    No assembly parts metadata available.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {data.parts.map((part, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-[#1c1c1c] border border-[#292929] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-4 h-4 rounded-full shrink-0 border border-white/20 shadow-xs"
                            style={{ backgroundColor: part.color }}
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-[#f4f4f4] truncate">{part.name}</div>
                            <div className="text-[10px] text-[#737373] capitalize">
                              {part.material} {part.transparent ? "• transparent" : ""}
                            </div>
                          </div>
                        </div>

                        <div className="text-right text-[10px] text-[#8e8e8e] font-mono shrink-0">
                          {part.opacity < 1 && <div>op: {part.opacity}</div>}
                          {part.metalness > 0 && <div>met: {part.metalness}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Parametric Sliders & Default Values */}
            {activeTab === "params" && (
              <div>
                {(!data.parameters || Object.keys(data.parameters).length === 0) ? (
                  <div className="text-xs text-[#737373] text-center py-6">
                    No configurable parameters defined in this model.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(data.parameters).map(([key, value]) => {
                      const def = data.parameter_definitions?.find((d) => d.name === key);
                      return (
                        <div
                          key={key}
                          className="p-2.5 rounded-xl bg-[#1c1c1c] border border-[#292929] flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-mono text-[#f4f4f4] font-medium">{key}</div>
                            {def?.description && (
                              <div className="text-[10px] text-[#737373] line-clamp-1">{def.description}</div>
                            )}
                          </div>
                          <span className="font-mono text-xs text-[#f4f4f4] bg-[#262626] px-2 py-0.5 rounded border border-[#333]">
                            {String(value)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Suggested Quick Refinements Bar */}
          {onRefinePrompt && (
            <div className="px-4 py-2.5 border-t border-[#262626] bg-[#141414] flex items-center gap-2 overflow-x-auto text-xs">
              <span className="text-[11px] text-[#737373] shrink-0 flex items-center gap-1">
                <IconSparkles className="w-3 h-3 text-[#8e8e8e]" />
                Refine:
              </span>
              {[
                "Add 4 mounting tabs on corners",
                "Increase wall thickness by 1.5mm",
                "Add transparent glass inspection lid",
                "Make parameters 20% larger",
              ].map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onRefinePrompt(suggestion)}
                  className="px-2.5 py-1 rounded-lg bg-[#1f1f1f] hover:bg-[#282828] text-[#a3a3a3] hover:text-[#f4f4f4] border border-[#292929] transition-colors shrink-0 cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
