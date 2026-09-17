import React, { useState } from "react";
import { CadGenerationResponse } from "../lib/types";
import {
  IconCode,
  IconCopy,
  IconCheck,
  IconDownload,
  IconLayers,
  IconSliders,
  IconClose,
  IconCube,
  IconSparkles,
} from "./icons";

interface CadPanelProps {
  data: CadGenerationResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onRefinePrompt: (prompt: string) => void;
}

export function CadPanel({ data, isOpen, onClose, onRefinePrompt }: CadPanelProps) {
  const [activeTab, setActiveTab] = useState<"code" | "parts" | "params">("code");
  const [copied, setCopied] = useState(false);
  const [refineInput, setRefineInput] = useState("");

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.replicad_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([data.replicad_code], { type: "text/typescript;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `model-${data.prompt_id.slice(0, 8)}.ts`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleQuickRefine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refineInput.trim()) return;
    onRefinePrompt(refineInput.trim());
    setRefineInput("");
  };

  return (
    <aside className="w-full md:w-[460px] lg:w-[520px] xl:w-[580px] h-full bg-[#121212] border-l border-[#262626] flex flex-col z-30 shrink-0 shadow-2xl transition-all">
      {/* Panel Header */}
      <div className="h-14 px-4 border-b border-[#262626] bg-[#141414] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#212121] border border-[#303030] flex items-center justify-center text-white shrink-0">
            <IconCube className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#f4f4f4] truncate flex items-center gap-1.5">
              <span>CAD Model Workspace</span>
              {data && (
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#212121] text-[#8e8e8e] border border-[#2b2b2b]">
                  {data.provider}
                </span>
              )}
            </div>
            <div className="text-[10px] text-[#737373] truncate">
              {data ? `${data.latency_ms || 0}ms • ${data.token_usage || 0} tokens` : "Ready for generation"}
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1">
          {data && (
            <>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8e8e8e] hover:text-white hover:bg-[#212121] transition-colors cursor-pointer"
                title="Copy code"
              >
                {copied ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconCopy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline text-[11px]">{copied ? "Copied" : "Copy"}</span>
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8e8e8e] hover:text-white hover:bg-[#212121] transition-colors cursor-pointer"
                title="Download Replicad TypeScript file"
              >
                <IconDownload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">.ts</span>
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8e8e8e] hover:text-white hover:bg-[#212121] transition-colors cursor-pointer"
            title="Close vertical panel"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      {data && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[#212121] bg-[#171717] shrink-0 text-xs">
          <button
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${activeTab === "code"
                ? "bg-[#262626] text-white shadow-xs"
                : "text-[#8e8e8e] hover:text-[#f4f4f4] hover:bg-[#1e1e1e]"
              }`}
          >
            <IconCode className="w-3.5 h-3.5" />
            <span>Code</span>
          </button>

          <button
            onClick={() => setActiveTab("parts")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${activeTab === "parts"
                ? "bg-[#262626] text-white shadow-xs"
                : "text-[#8e8e8e] hover:text-[#f4f4f4] hover:bg-[#1e1e1e]"
              }`}
          >
            <IconLayers className="w-3.5 h-3.5" />
            <span>Assembly ({data.parts?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab("params")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${activeTab === "params"
                ? "bg-[#262626] text-white shadow-xs"
                : "text-[#8e8e8e] hover:text-[#f4f4f4] hover:bg-[#1e1e1e]"
              }`}
          >
            <IconSliders className="w-3.5 h-3.5" />
            <span>Params ({Object.keys(data.parameters || {}).length})</span>
          </button>
        </div>
      )}

      {/* Vertical Content Workspace */}
      <div className="flex-1 overflow-y-auto p-4">
        {!data ? (
          /* Empty / Waiting state */
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 text-[#737373]">
            <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] border border-[#2b2b2b] flex items-center justify-center text-[#555]">
              <IconCube className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-xs">
              <h3 className="text-sm font-semibold text-[#d1d1d1]">CAD Workspace</h3>
              <p className="text-xs text-[#737373] leading-relaxed">
                Generated 3D CAD Replicad code, assembly parts, and parametric sliders will appear here vertically side-by-side with your chat.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Tab 1: Replicad Code */}
            {activeTab === "code" && (
              <div className="h-full flex flex-col space-y-2">
                <div className="flex items-center justify-between text-[11px] text-[#737373] px-1">
                  <span>Replicad TypeScript</span>
                  <span>Parametric main()</span>
                </div>
                <div className="relative flex-1">
                  <pre className="h-full max-h-[calc(100vh-230px)] overflow-y-auto p-4 rounded-xl bg-[#090909] border border-[#222] text-xs font-mono text-[#dcdcdc] leading-relaxed select-all">
                    <code>{data.replicad_code}</code>
                  </pre>
                </div>
              </div>
            )}

            {/* Tab 2: Assembly Parts & Materials */}
            {activeTab === "parts" && (
              <div className="space-y-3">
                <div className="text-[11px] text-[#737373] px-1">
                  Assembly Components & PBR Materials
                </div>

                {(!data.parts || data.parts.length === 0) ? (
                  <div className="p-6 text-center text-xs text-[#737373] rounded-xl bg-[#171717] border border-[#262626]">
                    Single unified part (no separate assembly components defined).
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data.parts.map((part, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-[#171717] border border-[#262626] space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-4 h-4 rounded-full border border-white/20 shrink-0 shadow-xs"
                              style={{ backgroundColor: part.color || "#3b82f6" }}
                            />
                            <span className="text-xs font-semibold text-[#f4f4f4]">{part.name}</span>
                          </div>
                          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-[#212121] text-[#b4b4b4] border border-[#2d2d2d]">
                            {part.material}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#222] text-[11px] text-[#8e8e8e]">
                          <div>
                            Opacity: <span className="text-[#f4f4f4] font-mono">{part.opacity}</span>
                          </div>
                          <div>
                            Roughness: <span className="text-[#f4f4f4] font-mono">{part.roughness}</span>
                          </div>
                          <div>
                            {part.material === "glass" ? (
                              <>IOR: <span className="text-[#f4f4f4] font-mono">{part.ior}</span></>
                            ) : (
                              <>Metal: <span className="text-[#f4f4f4] font-mono">{part.metalness}</span></>
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
              <div className="space-y-3">
                <div className="text-[11px] text-[#737373] px-1">
                  Extracted Parametric Variables
                </div>

                {Object.keys(data.parameters || {}).length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#737373] rounded-xl bg-[#171717] border border-[#262626]">
                    No parametric variables extracted.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(data.parameters).map(([key, value]) => {
                      const def = data.parameter_definitions?.find((d) => d.name === key);
                      return (
                        <div
                          key={key}
                          className="p-3 rounded-xl bg-[#171717] border border-[#262626] flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-mono text-[#f4f4f4] font-semibold">{key}</div>
                            {def?.description && (
                              <div className="text-[10px] text-[#737373] line-clamp-1">{def.description}</div>
                            )}
                          </div>
                          <span className="font-mono text-xs text-[#f4f4f4] bg-[#212121] px-2.5 py-1 rounded-md border border-[#303030]">
                            {String(value)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Quick Refine Bar */}
      {data && (
        <div className="p-3 border-t border-[#262626] bg-[#141414] space-y-2 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
            {["Add 4 mounting tabs", "Make lid clear glass", "Increase wall thickness", "Make 20% taller"].map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onRefinePrompt(s)}
                className="px-2.5 py-1 rounded-lg bg-[#1e1e1e] hover:bg-[#282828] text-[11px] text-[#a3a3a3] hover:text-white border border-[#2b2b2b] transition-colors shrink-0 cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>

          <form onSubmit={handleQuickRefine} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Refine this model (e.g. add mounting holes)..."
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-xl bg-[#1e1e1e] border border-[#2b2b2b] text-xs text-[#f4f4f4] placeholder-[#666] focus:outline-hidden focus:border-[#444]"
            />
            <button
              type="submit"
              disabled={!refineInput.trim()}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${refineInput.trim()
                  ? "bg-white text-black hover:bg-neutral-200 shadow-xs"
                  : "bg-[#252525] text-[#666] cursor-not-allowed"
                }`}
            >
              Refine
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
