"use client";

import React, { useState } from "react";

export function AdsPanel() {
  const [copied, setCopied] = useState(false);
  const adEmail = "vanaram.industries@gmail.com"

  const handleCopyEmail = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(adEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <aside className="w-[280px] lg:w-[300px] h-full bg-[#121212] border-l border-[#262626] flex flex-col shrink-0 z-20 shadow-xl overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <div className="h-14 px-4 border-b border-[#262626] bg-[#161616] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#222] text-[#8e8e8e] border border-[#2e2e2e]">
            Ad
          </span>
          <span className="text-xs font-semibold text-[#f4f4f4]">Sponsored</span>
        </div>
        <span className="text-[10px] text-[#666] font-mono uppercase tracking-wider">
          Empty Slots
        </span>
      </div>

      {/* 2. Advertising Content - Two Separate Empty Slots + Contact Section */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 flex flex-col custom-scrollbar">
        {/* Empty Ad Slot 1: Top / Medium Rectangle (300x250) */}
        <div className="rounded-2xl bg-[#161616] border border-[#242424] p-3.5 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 font-mono text-[#8e8e8e]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#404040]" />
              <span className="uppercase tracking-wider font-semibold">Ad Slot 1</span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1c1c1c] text-[#666] border border-[#282828]">
              300 × 250
            </span>
          </div>

          <div className="w-full min-h-[170px] rounded-xl bg-[#0e0e0e]/80 border border-dashed border-[#282828] p-4 text-center flex flex-col items-center justify-center space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#171717] border border-[#262626] flex items-center justify-center text-[#555] shadow-xs">
              <svg
                className="w-4 h-4 text-[#666]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <rect x="3" y="3" width="18" height="18" rx="2.5" strokeWidth="1.5" strokeDasharray="3 3" />
                <path d="M8 10h8M8 14h5" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-[#a3a3a3]">
                No Ad Available
              </div>
              <p className="text-[11px] text-[#555] leading-snug max-w-[200px] mx-auto">
                This ad placement is currently unoccupied
              </p>
            </div>
            <span className="inline-flex items-center text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#141414] text-[#555] border border-[#222]">
              Empty Ad Space
            </span>
          </div>
        </div>

        {/* Empty Ad Slot 2: Bottom / Large Skyscraper (300x600) */}
        <div className="rounded-2xl bg-[#161616] border border-[#242424] p-3.5 shadow-sm space-y-2.5 flex-1 flex flex-col min-h-[220px]">
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 font-mono text-[#8e8e8e]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#404040]" />
              <span className="uppercase tracking-wider font-semibold">Ad Slot 2</span>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1c1c1c] text-[#666] border border-[#282828]">
              300 × 600
            </span>
          </div>

          <div className="w-full flex-1 min-h-[170px] rounded-xl bg-[#0e0e0e]/80 border border-dashed border-[#282828] p-4 text-center flex flex-col items-center justify-center space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#171717] border border-[#262626] flex items-center justify-center text-[#555] shadow-xs">
              <svg
                className="w-4 h-4 text-[#666]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <rect x="4" y="2" width="16" height="20" rx="2.5" strokeWidth="1.5" strokeDasharray="3 3" />
                <path d="M8 8h8M8 12h8M8 16h4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-[#a3a3a3]">
                No Ad Available
              </div>
              <p className="text-[11px] text-[#555] leading-snug max-w-[200px] mx-auto">
                This ad placement is currently unoccupied
              </p>
            </div>
            <span className="inline-flex items-center text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#141414] text-[#555] border border-[#222]">
              Empty Ad Space
            </span>
          </div>
        </div>

        {/* Contact for Ad Service */}
        <div className="rounded-2xl bg-gradient-to-b from-[#181818] to-[#131313] border border-[#282828] p-3.5 shadow-sm space-y-3 shrink-0">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.75"
                  d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                />
              </svg>
            </div>
            <div className="space-y-0.5">
              <h4 className="text-xs font-semibold text-[#ededed]">Advertise With Us</h4>
              <p className="text-[11px] text-[#858585] leading-snug">
                Promote your brand, products, tech tools, or services to our active global audience.
              </p>
            </div>
          </div>

          <div className="pt-0.5 space-y-2">
            <button
              onClick={handleCopyEmail}
              type="button"
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#202020] border border-[#2b2b2b] text-[11px] text-[#999] transition-colors group cursor-pointer"
            >
              <span className="font-mono text-[10px] text-[#888] truncate">{adEmail}</span>
              <span className="text-[10px] text-blue-400 group-hover:text-blue-300 shrink-0 font-medium">
                {copied ? "Copied!" : "Copy"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

