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
} from "./icons";

interface CadCodeViewerProps {
  data: CadGenerationResponse;
  onRefinePrompt?: (prompt: string) => void;
}

export function CadCodeViewer({ data, onRefinePrompt }: CadCodeViewerProps) {
  const [activeTab, setActiveTab] = useState<"code" | "parts" | "params">("code");
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
      {/* Viewer Header with Tabs and Actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#262626] bg-[#141414]">
        {/* Tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "code"
                ? "bg-[#242424] text-white"
                : "text-[#8e8e8e] hover:text-[#f4f4f4] hover:bg-[#1c1c1c]"
            }`}
          >
            <IconCode className="w-3.5 h-3.5" />
            <span>Replicad Code</span>
          </button>

          <button
            onClick={() => setActiveTab("parts")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "parts"
                ? "bg-[#242424] text-white"
                : "text-[#8e8e8e] hover:text-[#f4f4f4] hover:bg-[#1c1c1c]"
            }`}
          >
            <IconLayers className="w-3.5 h-3.5" />
            <span>Assembly Parts ({data.parts?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("params")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "params"
                ? "bg-[#242424] text-white"
                : "text-[#8e8e8e] hover:text-[#f4f4f4] hover:bg-[#1c1c1c]"
            }`}
          >
            <IconSliders className="w-3.5 h-3.5" />
            <span>Parameters ({Object.keys(data.parameters || {}).length})</span>
          </button>
        </div>

        {/* Action Buttons: Copy and Download */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8e8e8e] hover:text-white hover:bg-[#242424] transition-colors cursor-pointer"
            title="Copy Replicad code"
          >
            {copied ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconCopy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied!" : "Copy"}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8e8e8e] hover:text-white hover:bg-[#242424] transition-colors cursor-pointer"
            title="Download .ts file"
          >
            <IconDownload className="w-3.5 h-3.5" />
            <span>Export .ts</span>
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
                Single unified mesh (no discrete sub-parts defined).
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {data.parts.map((part, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#1c1c1c] border border-[#292929] flex flex-col justify-between space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
                          style={{ backgroundColor: part.color || "#3b82f6" }}
                        />
                        <span className="text-xs font-semibold text-[#f4f4f4]">{part.name}</span>
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#262626] text-[#b4b4b4] border border-[#333]">
                        {part.material}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#262626] text-[11px] text-[#8e8e8e]">
                      <div>
                        Opacity: <span className="text-[#e5e5e5] font-mono">{part.opacity}</span>
                      </div>
                      <div>
                        Roughness: <span className="text-[#e5e5e5] font-mono">{part.roughness}</span>
                      </div>
                      <div>
                        {part.material === "glass" ? (
                          <>IOR: <span className="text-[#e5e5e5] font-mono">{part.ior}</span></>
                        ) : (
                          <>Metalness: <span className="text-[#e5e5e5] font-mono">{part.metalness}</span></>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Parameters */}
        {activeTab === "params" && (
          <div className="space-y-2.5">
            {Object.keys(data.parameters || {}).length === 0 ? (
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
              onClick={() => onRefinePrompt(suggestion)}
              className="px-2.5 py-1 rounded-lg bg-[#1f1f1f] hover:bg-[#282828] text-[#a3a3a3] hover:text-[#f4f4f4] border border-[#292929] transition-colors shrink-0 cursor-pointer"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
