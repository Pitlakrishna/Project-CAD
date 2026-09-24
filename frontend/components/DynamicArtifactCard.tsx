"use client";

import React, { useState } from "react";
import { FileArtifact } from "../lib/types";
import { downloadDynamicArtifact } from "../lib/universalDocumentGenerator";

interface DynamicArtifactCardProps {
  artifact: FileArtifact;
}

export function DynamicArtifactCard({ artifact }: DynamicArtifactCardProps) {
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [downloaded, setDownloaded] = useState<boolean>(false);

  const type = (artifact.type || getFileExtension(artifact.filename)).toLowerCase();

  const handleDownload = async () => {
    try {
      setIsCompiling(true);
      await downloadDynamicArtifact(artifact);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2500);
    } catch (err) {
      console.error("Failed to download artifact:", err);
    } finally {
      setIsCompiling(false);
    }
  };

  // Color theme and format metadata
  const theme = getThemeForType(type);

  return (
    <div
      className={`w-full my-3 p-3.5 rounded-2xl border transition-all duration-200 bg-[#161616] ${theme.borderColor} hover:border-[#383838] shadow-md`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Icon & Document Details */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border font-bold text-xs ${theme.iconBg} ${theme.textColor} ${theme.iconBorder}`}
          >
            {theme.badgeLetter}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs font-semibold text-white tracking-wide truncate">
                {artifact.title || artifact.filename}
              </h4>
              <span
                className={`text-[9px] font-mono font-medium px-1.5 py-0.5 rounded uppercase tracking-wider ${theme.badgeBg} ${theme.textColor} border ${theme.iconBorder}`}
              >
                {theme.label}
              </span>
            </div>

            <p className="text-[11px] text-[#8e8e8e] font-sans mt-0.5 truncate">
              {theme.subtitle}
            </p>

            {theme.features && theme.features.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {theme.features.map((feat) => (
                  <span
                    key={feat}
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#202020] text-[#a3a3a3] border border-[#2e2e2e] font-sans"
                  >
                    {feat}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Download Action Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isCompiling}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              downloaded
                ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-300"
                : `${theme.buttonBg} ${theme.buttonHover} ${theme.buttonBorder} ${theme.textColor}`
            }`}
            title={`Download ${artifact.filename}`}
          >
            {isCompiling ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Compiling...</span>
              </>
            ) : downloaded ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <span className="text-emerald-400 font-semibold">Downloaded</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span>Download {theme.extName}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function getFileExtension(filename: string): string {
  if (!filename) return "txt";
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop() || "txt" : "txt";
}

function getThemeForType(type: string) {
  switch (type) {
    case "docx":
    case "doc":
      return {
        label: "Word Document",
        extName: ".DOCX",
        badgeLetter: "DOC",
        subtitle: "Executive Engineering Spec • ISO 2768-m • Sign-Off",
        features: ["📐 CAD Diagram", "📋 Exec Summary", "✍️ Sign-Off"],
        borderColor: "border-blue-500/25",
        iconBg: "bg-blue-500/10",
        iconBorder: "border-blue-500/30",
        badgeBg: "bg-blue-950/70",
        textColor: "text-blue-400",
        buttonBg: "bg-blue-500/15",
        buttonHover: "hover:bg-blue-500/25",
        buttonBorder: "border-blue-500/40",
      };
    case "xlsx":
    case "xls":
      return {
        label: "Excel Spreadsheet",
        extName: ".XLSX",
        badgeLetter: "XLS",
        subtitle: "Executive BOM Financial Model • KPI Cards • Sticky Header",
        features: ["📊 KPI Dashboard", "💰 Accounting Format", "📌 Sticky Header"],
        borderColor: "border-emerald-500/25",
        iconBg: "bg-emerald-500/10",
        iconBorder: "border-emerald-500/30",
        badgeBg: "bg-emerald-950/70",
        textColor: "text-emerald-400",
        buttonBg: "bg-emerald-500/15",
        buttonHover: "hover:bg-emerald-500/25",
        buttonBorder: "border-emerald-500/40",
      };
    case "pptx":
    case "ppt":
      return {
        label: "PowerPoint Presentation",
        extName: ".PPTX",
        badgeLetter: "PPT",
        subtitle: "16:9 Executive Deck • Pillar Cards • CAD Schematic • BOM Table",
        features: ["🎯 Pillar Cards", "📐 CAD Diagram", "📋 BOM Table"],
        borderColor: "border-amber-500/25",
        iconBg: "bg-amber-500/10",
        iconBorder: "border-amber-500/30",
        badgeBg: "bg-amber-950/70",
        textColor: "text-amber-400",
        buttonBg: "bg-amber-500/15",
        buttonHover: "hover:bg-amber-500/25",
        buttonBorder: "border-amber-500/40",
      };
    case "pdf":
      return {
        label: "PDF Document",
        extName: ".PDF",
        badgeLetter: "PDF",
        subtitle: "ISO Engineering Blueprint PDF • Running Headers • Vector Tables",
        features: ["📐 CAD Diagram", "📑 Running Headers", "🛡️ ISO Standards"],
        borderColor: "border-rose-500/25",
        iconBg: "bg-rose-500/10",
        iconBorder: "border-rose-500/30",
        badgeBg: "bg-rose-950/70",
        textColor: "text-rose-400",
        buttonBg: "bg-rose-500/15",
        buttonHover: "hover:bg-rose-500/25",
        buttonBorder: "border-rose-500/40",
      };
    case "csv":
      return {
        label: "CSV Spreadsheet",
        extName: ".CSV",
        badgeLetter: "CSV",
        subtitle: "RFC 4180 Table Data • Structured Columns",
        features: ["📊 Structured Data"],
        borderColor: "border-purple-500/25",
        iconBg: "bg-purple-500/10",
        iconBorder: "border-purple-500/30",
        badgeBg: "bg-purple-950/70",
        textColor: "text-purple-400",
        buttonBg: "bg-purple-500/15",
        buttonHover: "hover:bg-purple-500/25",
        buttonBorder: "border-purple-500/40",
      };
    default:
      return {
        label: "Documentation File",
        extName: `.${type.toUpperCase()}`,
        badgeLetter: type.slice(0, 3).toUpperCase(),
        subtitle: "Technical Markdown Documentation & Data",
        features: ["📝 Documentation"],
        borderColor: "border-sky-500/25",
        iconBg: "bg-sky-500/10",
        iconBorder: "border-sky-500/30",
        badgeBg: "bg-sky-950/70",
        textColor: "text-sky-400",
        buttonBg: "bg-sky-500/15",
        buttonHover: "hover:bg-sky-500/25",
        buttonBorder: "border-sky-500/40",
      };
  }
}
