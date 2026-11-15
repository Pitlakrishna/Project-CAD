"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CadGeometryResponse, CadGenerationResponse } from "../lib/types";
import { generateBlueprintPackage } from "../lib/blueprintGenerator";
import { formatMass, resolveEngineeringMaterial } from "../lib/physicalMaterials";

export interface DetectedCadFormats {
  hasPromptIntent: boolean;
  step: boolean;
  stl: boolean;
  dxf: boolean;
  pdf: boolean;
  blueprint: boolean;
  matchedKeywords: string[];
}

export function detectCadFormatIntent(prompt?: string): DetectedCadFormats {
  if (!prompt || typeof prompt !== "string") {
    return {
      hasPromptIntent: false,
      step: false,
      stl: false,
      dxf: false,
      pdf: false,
      blueprint: false,
      matchedKeywords: [],
    };
  }
  const norm = prompt.toLowerCase();
  return {
    hasPromptIntent: /\b(?:step|stl|dxf|pdf|blueprint)\b/i.test(norm),
    step: /\b(?:step|stp)\b/i.test(norm),
    stl: /\bstl\b/i.test(norm),
    dxf: /\bdxf\b/i.test(norm),
    pdf: /\bpdf\b/i.test(norm),
    blueprint: /\bblueprint\b/i.test(norm),
    matchedKeywords: [],
  };
}

export interface CadModelCardProps {
  geometry: CadGeometryResponse;
  cadResponse?: CadGenerationResponse;
  userPrompt?: string;
  onRefinePrompt?: (suggestion: string) => void;
}

export function CadModelCard({ geometry, cadResponse, userPrompt }: CadModelCardProps) {
  // Construct dynamic 2D Blueprint Package to extract normalized dimensions & concise title
  const blueprint = useMemo(() => {
    return generateBlueprintPackage(
      geometry.modelId,
      geometry.metrics?.boundingBox?.dimensions,
      cadResponse?.parameters || {},
      cadResponse?.raw_explanation,
      userPrompt,
      geometry.metrics,
      cadResponse?.parts || [],
      cadResponse?.materials_used || []
    );
  }, [geometry, cadResponse, userPrompt]);

  const dim = geometry.metrics.boundingBox?.dimensions || { width: 0, depth: 0, height: 0 };
  const volume = geometry.metrics.volume ?? 0;

  // Resolve material info and dynamic mass properties
  const resolvedMat = resolveEngineeringMaterial(
    geometry.metrics.material || cadResponse?.materials_used?.[0]
  );
  const materialName = geometry.metrics.materialName || resolvedMat.name;
  const massKg = geometry.metrics.massKg ?? ((volume / 1e9) * resolvedMat.density);
  const estimatedCost = geometry.metrics.estimatedCostUsd ?? (massKg * resolvedMat.costPerKg);

  // Short ID for clean look
  const shortId = geometry.modelId.slice(0, 8);

  return (
    <div className="w-full my-3 rounded-2xl bg-[#161616] border border-[#272727] overflow-hidden shadow-lg transition-all">
      {/* 1. Header Bar: Clean, short title */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1c1c1c] border-b border-[#262626]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold text-white tracking-wide flex items-center gap-1.5 truncate">
              <span className="truncate max-w-[260px] sm:max-w-[380px]" title={blueprint.title}>
                {blueprint.title}
              </span>
              {geometry.engine_mode === "threejs" ? (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-800/40 shrink-0">
                  WebGL Studio
                </span>
              ) : (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 shrink-0">
                  Ready
                </span>
              )}
            </h4>
            <p className="text-[11px] text-[#8e8e8e] truncate">
              {geometry.engine_mode === "threejs"
                ? "Native Procedural WebGL • Three.js PBR"
                : `OpenCASCADE B-Rep Solid • ${resolvedMat.standard}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-[11px] font-mono px-2 py-1 rounded-lg bg-[#222222] text-[#8e8e8e] border border-[#2e2e2e]">
            #{shortId}
          </span>
        </div>
      </div>

      {/* 2. Compact Engineering Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2.5 bg-[#141414] border-b border-[#222222]">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-[#6e6e6e] font-medium">
            Dimensions (WxDxH)
          </span>
          <span className="text-xs font-mono font-semibold text-[#f0f0f0] mt-0.5 truncate">
            {dim.width} × {dim.depth} × {dim.height} <span className="text-[10px] text-[#737373]">mm</span>
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-[#6e6e6e] font-medium">
            Material & Standard
          </span>
          <span className="text-xs font-medium text-amber-400 mt-0.5 truncate" title={`${materialName} (${resolvedMat.standard})`}>
            {materialName}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-[#6e6e6e] font-medium">
            Mass & Cost
          </span>
          <span className="text-xs font-mono font-semibold text-emerald-400 mt-0.5 truncate">
            {formatMass(massKg)} <span className="text-[10px] text-[#737373]">(${estimatedCost.toFixed(2)})</span>
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-[#6e6e6e] font-medium">
            Solid Volume
          </span>
          <span className="text-xs font-mono font-semibold text-sky-400 mt-0.5 truncate">
            {volume.toLocaleString()} <span className="text-[10px] text-[#737373]">mm³</span>
          </span>
        </div>
      </div>

      {/* 3. Single Prominent Action: Launch 3D Studio */}
      <div className="p-3 bg-gradient-to-r from-blue-950/25 via-indigo-950/20 to-purple-950/25">
        <Link
          href={`/viewer/${geometry.modelId}`}
          target="_blank"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:via-indigo-500 hover:to-violet-500 text-white font-semibold text-xs shadow-lg shadow-indigo-500/25 transition-all group/btn cursor-pointer text-center"
        >
          <svg className="w-4 h-4 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
          <span className="tracking-wide">Launch 3D Studio</span>
          <span className="group-hover/btn:translate-x-0.5 transition-transform text-sm font-bold">↗</span>
        </Link>
      </div>
    </div>
  );
}
