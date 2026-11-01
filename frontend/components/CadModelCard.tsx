"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CadGeometryResponse, CadGenerationResponse, CadSceneResponse } from "../lib/types";
import { getCadDownloadUrl, downloadCadFileBlob, fetchCadScene } from "../lib/api";
import { generateBlueprintPackage } from "../lib/blueprintGenerator";
import { downloadEngineeringBlueprintPdf } from "../lib/pdfGenerator";
import { formatMass, formatVolume, resolveEngineeringMaterial } from "../lib/physicalMaterials";

const StudioViewer3D = dynamic(
  () => import("./StudioViewer3D").then((m) => m.StudioViewer3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0f1115] text-white">
        <div className="w-8 h-8 rounded-full border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin mb-2" />
        <span className="text-[11px] text-zinc-400 font-mono">Loading 3D Engine...</span>
      </div>
    ),
  }
);

export interface DetectedCadFormats {
  hasPromptIntent: boolean;
  step: boolean;
  stl: boolean;
  dxf: boolean;
  pdf: boolean;
  blueprint: boolean;
  matchedKeywords: string[];
}

/**
 * Commercial-grade CAD export intent parser.
 */
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

  const normalized = prompt.toLowerCase();
  const matchedKeywords: string[] = [];

  // 1. STEP
  const stepPatterns = [
    { regex: /(?:\.step|\.stp)\b/i, label: ".step" },
    { regex: /\b(?:step|stp)\s*(?:files?|formats?|models?|solid|brep|b-rep)\b/i, label: "step" },
    { regex: /\b(?:both\s+)?(?:step|stp)\s*(?:and|&|\/)\s*stl\b/i, label: "step & stl" },
    { regex: /\b(?:export|download|save|give|get|generate|produce)\s+(?:me\s+)?(?:both\s+)?(?:the\s+)?(?:as\s+)?(?:a\s+)?(?:\.)?(?:step|stp)\b/i, label: "step" },
    { regex: /\bin\s+(?:\.)?(?:step|stp)(?:\s+format)?\b/i, label: "step" },
    { regex: /\bfor\s+(?:solidworks|fusion\s*360|freecad|inventor|catia|cad\/cam|cnc)\b/i, label: "cad/cnc" },
    { regex: /\b(?:parametric|brep|b-rep)\s+solid\b/i, label: "b-rep solid" },
  ];

  let wantsStep = false;
  for (const { regex, label } of stepPatterns) {
    if (regex.test(normalized)) {
      wantsStep = true;
      matchedKeywords.push(label);
      break;
    }
  }

  // 2. DXF (2D AutoCAD Drawing Exchange Format)
  const dxfPatterns = [
    { regex: /\.dxf\b/i, label: ".dxf" },
    { regex: /\bdxf\s*(?:files?|formats?|drawings?|profiles?)?\b/i, label: "dxf" },
    { regex: /\b(?:export|download|save|give|get|generate|produce)\s+(?:me\s+)?(?:the\s+)?(?:as\s+)?(?:a\s+)?(?:\.)?dxf\b/i, label: "dxf" },
    { regex: /\blaser\s*cut(?:ting)?\b|\bwaterjet\b/i, label: "laser/cnc" },
    { regex: /\b2d\s*(?:cad|drawing|floor\s*plan|layout|draft|vector|orthographic)\b/i, label: "2d cad" },
    { regex: /\b(?:floor\s*plans?|floorplans?|architectur(?:e|al)|blueprints?)\b/i, label: "2d floor plan" },
  ];

  let wantsDxf = false;
  for (const { regex, label } of dxfPatterns) {
    if (regex.test(normalized)) {
      wantsDxf = true;
      matchedKeywords.push(label);
      break;
    }
  }

  // 3. PDF & 2D Blueprint
  const pdfPatterns = [
    { regex: /\.pdf\b/i, label: ".pdf" },
    { regex: /\b(?:export|download|save|give|get|generate|make)\s+(?:me\s+)?(?:a\s+)?pdf\b/i, label: "pdf" },
    { regex: /\bpdf\s*(?:drawing|blueprint|format|document|file)?\b/i, label: "pdf" },
    { regex: /\b(?:floor\s*plans?|floorplans?|blueprints?)\b/i, label: "blueprint" },
  ];

  let wantsPdf = false;
  for (const { regex, label } of pdfPatterns) {
    if (regex.test(normalized)) {
      wantsPdf = true;
      matchedKeywords.push(label);
      break;
    }
  }

  const blueprintPatterns = [
    { regex: /\b2d\s*(?:design|drawing|blueprint|plan|layout|draft|architectural)?\b/i, label: "2d blueprint" },
    { regex: /\bblueprint\b/i, label: "blueprint" },
    { regex: /\b(?:floor\s*plans?|floorplans?|architectur(?:e|al)|schematic)\b/i, label: "architectural floor plan" },
    { regex: /\bdimensions?\b|\bdimenstions?\b/i, label: "dimensions" },
  ];

  let wantsBlueprint = wantsPdf;
  for (const { regex, label } of blueprintPatterns) {
    if (regex.test(normalized)) {
      wantsBlueprint = true;
      matchedKeywords.push(label);
      break;
    }
  }

  // 4. STL
  const stlPatterns = [
    { regex: /\.stl\b/i, label: ".stl" },
    { regex: /\bstl\s*(?:files?|formats?|models?|mesh)?\b/i, label: "stl" },
    { regex: /\b(?:both\s+)?(?:step|stp)\s*(?:and|&|\/)\s*stl\b/i, label: "step & stl" },
    { regex: /\b(?:both\s+)?stl\s*(?:and|&|\/)\s*(?:step|stp)\b/i, label: "stl & step" },
    { regex: /\b(?:export|download|save|give|get|generate|produce)\s+(?:me\s+)?(?:both\s+)?(?:the\s+)?(?:as\s+)?(?:an?\s+)?(?:\.)?stl\b/i, label: "stl" },
    { regex: /\bin\s+stl(?:\s+format)?\b/i, label: "stl" },
    { regex: /\b(?:for\s+)?3d\s*print(?:ing|able)?\b/i, label: "3d print" },
    { regex: /\b(?:for\s+)?slicer\b|\b(?:in\s+)?bambu\b|\bprusa\b|\bcura\b|\borcaslicer\b/i, label: "slicer" },
  ];

  let wantsStl = false;
  for (const { regex, label } of stlPatterns) {
    if (regex.test(normalized)) {
      wantsStl = true;
      matchedKeywords.push(label);
      break;
    }
  }

  const hasPromptIntent = wantsStep || wantsStl || wantsDxf || wantsPdf || wantsBlueprint;

  return {
    hasPromptIntent,
    step: wantsStep,
    stl: wantsStl,
    dxf: wantsDxf,
    pdf: wantsPdf,
    blueprint: wantsBlueprint,
    matchedKeywords,
  };
}

export interface CadModelCardProps {
  geometry: CadGeometryResponse;
  cadResponse?: CadGenerationResponse;
  userPrompt?: string;
  onRefinePrompt?: (suggestion: string) => void;
}

export function CadModelCard({ geometry, cadResponse, userPrompt, onRefinePrompt }: CadModelCardProps) {
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [previewScene, setPreviewScene] = useState<CadSceneResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);

  const togglePreview = async () => {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    setShowPreview(true);
    if (!previewScene) {
      const threejsCode = cadResponse?.threejs_code || geometry?.threejs_code;
      if (threejsCode) {
        setPreviewScene({
          status: "success",
          modelId: geometry.modelId,
          engine_mode: "threejs",
          threejs_code: threejsCode,
          metrics: geometry.metrics,
          parts: [],
          availableExports: ["stl"],
        });
        return;
      }
      try {
        setLoadingPreview(true);
        const data = await fetchCadScene(geometry.modelId);
        if (data && data.status === "success") {
          setPreviewScene(data);
        }
      } catch (err) {
        console.error("Failed to load embedded CAD preview:", err);
      } finally {
        setLoadingPreview(false);
      }
    }
  };

  // Parse prompt intent
  const intent = useMemo(() => detectCadFormatIntent(userPrompt), [userPrompt]);

  // Construct dynamic 2D Blueprint Package without hardcoded mocks
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

  const handleDownload = async (format: "step" | "stl" | "dxf") => {
    try {
      setDownloadingFormat(format);
      const blob = await downloadCadFileBlob(geometry.modelId, format, cadResponse);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `model-${geometry.modelId}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(`Failed to download ${format}:`, err);
    } finally {
      setTimeout(() => setDownloadingFormat(null), 800);
    }
  };

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      await downloadEngineeringBlueprintPdf(blueprint);
    } catch (err) {
      console.error("Failed to export PDF blueprint:", err);
    } finally {
      setTimeout(() => setIsExportingPdf(false), 800);
    }
  };

  const dim = geometry.metrics.boundingBox?.dimensions || { width: 0, depth: 0, height: 0 };
  const volume = geometry.metrics.volume ?? 0;
  const triangles = geometry.metrics.triangleCount ?? 0;
  const faces = geometry.metrics.faceCount;

  // Resolve material info and dynamic mass properties
  const resolvedMat = resolveEngineeringMaterial(
    geometry.metrics.material || cadResponse?.materials_used?.[0]
  );
  const materialName = geometry.metrics.materialName || resolvedMat.name;
  const massKg = geometry.metrics.massKg ?? ((volume / 1e9) * resolvedMat.density);
  const estimatedCost = geometry.metrics.estimatedCostUsd ?? (massKg * resolvedMat.costPerKg);

  // Short ID for clean look
  const shortId = geometry.modelId.slice(0, 8);

  // Dynamic post-generation quick tweaks based on actual parametric dimensions (Strict Zero Hardcoding)
  const dynamicTweaks = useMemo(() => {
    if (!cadResponse?.parameters || !onRefinePrompt) return [];
    const tweaks: { label: string; actionPrompt: string }[] = [];
    const entries = Object.entries(cadResponse.parameters);
    for (const [key, rawVal] of entries) {
      const val = Number(rawVal);
      if (!isNaN(val) && val > 0 && typeof rawVal !== "boolean") {
        const cleanName = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const delta = Math.max(1, Math.round(val * 0.2));
        tweaks.push({
          label: `${cleanName} +${delta}`,
          actionPrompt: `Modify the 3D model: Increase ${key} from ${val} to ${val + delta}.`,
        });
        if (val - delta > 0) {
          tweaks.push({
            label: `${cleanName} -${delta}`,
            actionPrompt: `Modify the 3D model: Decrease ${key} from ${val} to ${val - delta}.`,
          });
        }
      }
      if (tweaks.length >= 6) break;
    }
    return tweaks;
  }, [cadResponse?.parameters, onRefinePrompt]);

  return (
    <div className="w-full my-3 rounded-2xl bg-[#161616] border border-[#272727] overflow-hidden shadow-lg transition-all">
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1c1c1c] border-b border-[#262626]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white tracking-wide flex items-center gap-1.5">
              <span>{blueprint.title}</span>
              {geometry.engine_mode === "threejs" ? (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-800/40">
                  🎨 WebGL Studio
                </span>
              ) : (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                  Ready
                </span>
              )}
            </h4>
            <p className="text-[11px] text-[#8e8e8e]">
              {geometry.engine_mode === "threejs"
                ? "Native Procedural WebGL • Three.js PBR"
                : `OpenCASCADE B-Rep Solid • ${resolvedMat.standard}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      {/* 2.5 Primary 3D Actions: Inline Quick Preview + Full-Screen Studio */}
      <div className="p-3 bg-gradient-to-r from-blue-950/30 via-indigo-950/20 to-purple-950/30 border-b border-[#222222] flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePreview}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              showPreview
                ? "bg-blue-600/30 border-blue-500/50 text-blue-200"
                : "bg-white/10 hover:bg-white/15 border-white/10 text-white"
            }`}
          >
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            <span>{showPreview ? "Hide 3D Preview" : "👁️ Quick 3D Preview"}</span>
          </button>

          <Link
            href={`/viewer/${geometry.modelId}`}
            target="_blank"
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:via-indigo-500 hover:to-violet-500 text-white font-semibold text-xs shadow-lg shadow-indigo-500/25 transition-all group/btn cursor-pointer text-center"
          >
            <span>Launch 3D Studio</span>
            <span className="group-hover/btn:translate-x-0.5 transition-transform">↗</span>
          </Link>
        </div>

        {showPreview && (
          <div className="relative w-full h-80 rounded-xl overflow-hidden bg-[#0f1115] border border-white/10 mt-1 shadow-inner">
            {loadingPreview ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 text-xs gap-2">
                <div className="w-8 h-8 rounded-full border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                <span className="font-mono">Loading 3D Mesh...</span>
              </div>
            ) : previewScene ? (
              <StudioViewer3D
                sceneData={previewScene}
                userPrompt={userPrompt}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
                3D Preview currently unavailable. Try launching the full studio.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Universal 4-Deliverable Export Bar (STEP, STL, DXF, PDF all always available) */}
      <div className="p-3 bg-[#161616]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-[#8e8e8e]">
            Export Deliverables
          </span>
          <span className="text-[10px] text-[#6b6b6b]">
            Direct 1-Click Binary & PDF
          </span>
        </div>

        {/* Clean, balanced 4-column deliverables grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* 1. STEP 3D Parametric Solid */}
          <button
            type="button"
            onClick={() => handleDownload("step")}
            disabled={downloadingFormat === "step"}
            className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left cursor-pointer disabled:opacity-50 ${intent.step
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15 ring-1 ring-emerald-500/20"
                : "bg-[#1f1f1f] hover:bg-[#262626] border-[#2c2c2c] hover:border-[#383838] text-white"
              }`}
            title="Download ISO 10303 STEP B-Rep solid model for CAD/CAM and CNC machining"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              {downloadingFormat === "step" ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate flex items-center gap-1">
                <span>{downloadingFormat === "step" ? "Exporting..." : "3D Solid (.STEP)"}</span>
              </div>
              <div className="text-[10px] text-[#8e8e8e] truncate">
                CAD / CNC B-Rep
              </div>
            </div>
          </button>

          {/* 2. STL 3D Mesh (3D Printing / Slicers) */}
          <button
            type="button"
            onClick={() => handleDownload("stl")}
            disabled={downloadingFormat === "stl"}
            className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left cursor-pointer disabled:opacity-50 ${intent.stl
                ? "bg-sky-500/10 border-sky-500/40 text-sky-300 hover:bg-sky-500/15 ring-1 ring-sky-500/20"
                : "bg-[#1f1f1f] hover:bg-[#262626] border-[#2c2c2c] hover:border-[#383838] text-white"
              }`}
            title="Download triangulated STL mesh for 3D printing slicers (Bambu Lab, PrusaSlicer, Cura)"
          >
            <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
              {downloadingFormat === "stl" ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate flex items-center gap-1">
                <span>{downloadingFormat === "stl" ? "Exporting..." : "3D Mesh (.STL)"}</span>
              </div>
              <div className="text-[10px] text-[#8e8e8e] truncate">
                3D Print Slicer
              </div>
            </div>
          </button>

          {/* 3. DXF 2D Vector CAD */}
          <button
            type="button"
            onClick={() => handleDownload("dxf")}
            disabled={downloadingFormat === "dxf"}
            className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left cursor-pointer disabled:opacity-50 ${intent.dxf
                ? "bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/15 ring-1 ring-amber-500/20"
                : "bg-[#1f1f1f] hover:bg-[#262626] border-[#2c2c2c] hover:border-[#383838] text-white"
              }`}
            title="Download layered AutoCAD DXF vector drawing"
          >
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              {downloadingFormat === "dxf" ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate flex items-center gap-1">
                <span>{downloadingFormat === "dxf" ? "Exporting..." : "2D CAD (.DXF)"}</span>
              </div>
              <div className="text-[10px] text-[#8e8e8e] truncate">
                AutoCAD Layers
              </div>
            </div>
          </button>

          {/* 4. PDF 2D Blueprint */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left cursor-pointer disabled:opacity-50 ${intent.pdf || intent.blueprint
                ? "bg-red-500/10 border-red-500/40 text-red-300 hover:bg-red-500/15 ring-1 ring-red-500/20"
                : "bg-[#1f1f1f] hover:bg-[#262626] border-[#2c2c2c] hover:border-[#383838] text-white"
              }`}
            title="Download multi-page engineering drawing PDF with all dimensions and full explanations"
          >
            <div className="w-7 h-7 rounded-lg bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
              {isExportingPdf ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate flex items-center gap-1">
                <span>{isExportingPdf ? "Generating..." : "2D Blueprint (.PDF)"}</span>
              </div>
              <div className="text-[10px] text-[#8e8e8e] truncate">
                Drawings & Specs
              </div>
            </div>
          </button>
        </div>

        {/* Dynamic Post-Generation Parametric Tweaks (Zero Hardcoding) */}
        {dynamicTweaks.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-[#222222]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#8e8e8e]">
                Quick Parametric Adjustments
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dynamicTweaks.map((tweak, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onRefinePrompt?.(tweak.actionPrompt)}
                  className="px-2.5 py-1 rounded-md bg-[#1f1f1f] hover:bg-[#2b2b2b] text-zinc-300 hover:text-white border border-[#2e2e2e] hover:border-blue-500/40 text-[11px] font-mono transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                  title={tweak.actionPrompt}
                >
                  <span>{tweak.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
