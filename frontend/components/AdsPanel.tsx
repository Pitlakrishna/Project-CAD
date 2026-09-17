"use client";

import React from "react";

export function AdsPanel() {
  return (
    <aside className="w-[280px] lg:w-[300px] h-full bg-[#121212] border-l border-[#262626] flex flex-col shrink-0 z-20 shadow-xl overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <div className="h-14 px-4 border-b border-[#262626] bg-[#161616] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#242424] text-[#a3a3a3] border border-[#333]">
            Ad
          </span>
          <span className="text-xs font-semibold text-[#f4f4f4]">Sponsored</span>
        </div>
        <span className="text-[10px] text-[#666] font-mono uppercase tracking-wider">
          Partner Ads
        </span>
      </div>

      {/* 2. Scrollable Advertising Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {/* Ad Unit 1: Medium Rectangle (300x250) */}
        <div className="rounded-2xl bg-[#181818] border border-[#282828] p-3.5 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between text-[10px] text-[#666]">
            <span className="uppercase tracking-wider font-mono">Ad • 300x250</span>
            <span>Featured</span>
          </div>

          <div className="w-full rounded-xl bg-[#0e0e0e] border border-dashed border-[#2d2d2d] p-4 text-center flex flex-col items-center justify-center space-y-2">
            <div className="w-8 h-8 rounded-full bg-[#1f1f1f] border border-[#333] flex items-center justify-center text-sm shadow-xs">
              ⚡
            </div>
            <div className="text-xs font-semibold text-[#f4f4f4]">
              Instant 3D Printing & CNC
            </div>
            <p className="text-[11px] text-[#7a7a7a] leading-tight max-w-[210px]">
              Turn your generated Replicad models into real aluminum, resin, and nylon parts.
            </p>
            <a
              href="#quote"
              onClick={(e) => e.preventDefault()}
              className="inline-block mt-1 px-3 py-1 rounded-lg bg-[#242424] hover:bg-[#303030] text-[#e0e0e0] hover:text-white text-[11px] font-medium border border-[#383838] transition-colors"
            >
              Instant Quote →
            </a>
          </div>
        </div>

        {/* Ad Unit 2: Large Vertical Skyscraper (300x600) */}
        <div className="rounded-2xl bg-[#181818] border border-[#282828] p-3.5 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between text-[10px] text-[#666]">
            <span className="uppercase tracking-wider font-mono">Ad • Skyscraper</span>
            <span>300x600</span>
          </div>

          <div className="w-full min-h-[300px] rounded-xl bg-[#0e0e0e] border border-dashed border-[#2d2d2d] p-4 text-center flex flex-col items-center justify-between space-y-3">
            <div className="w-full text-right">
              <span className="text-[9px] text-[#555] uppercase font-mono">Ad Slot #2</span>
            </div>

            <div className="space-y-2 py-2">
              <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] border border-[#2d2d2d] mx-auto flex items-center justify-center text-lg shadow-xs">
                🔩
              </div>
              <div className="text-xs font-semibold text-[#f4f4f4]">
                CAD Fasteners & Inserts
              </div>
              <p className="text-[11px] text-[#7a7a7a] leading-relaxed max-w-[190px] mx-auto">
                Stainless M2-M8 hex bolts, threaded heat-set inserts, and silicone O-rings.
              </p>
              <div className="inline-block px-3 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold transition-colors cursor-pointer shadow-xs">
                Hardware Shop
              </div>
            </div>

            <div className="text-[10px] text-[#4d4d4d] border-t border-[#1c1c1c] pt-2 w-full">
              Google AdSense banner space
            </div>
          </div>
        </div>

        {/* Ad Unit 3: Partner with Us */}
        <div className="p-3.5 rounded-2xl bg-[#151515] border border-[#242424] text-center space-y-1.5">
          <div className="text-xs font-medium text-[#c0c0c0]">Advertise on AICAD</div>
          <p className="text-[11px] text-[#666] leading-tight">
            Reach hardware engineers, 3D printing designers, and robotics creators.
          </p>
          <div className="pt-1">
            <span className="text-[11px] text-[#888] hover:text-white underline cursor-pointer">
              Contact Sales
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
