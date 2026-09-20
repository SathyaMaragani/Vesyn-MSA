"use client";

import React from "react";
import Link from "next/link";
import { useRuntime } from "@/lib/runtime/RuntimeContext";

export function LabHeader() {
  const {
    activeView,
    setActiveView,
    isSplitAerialOpen,
    setIsSplitAerialOpen,
    currentRun,
    resetRun,
  } = useRuntime();

  return (
    <header className="h-16 px-4 sm:px-6 bg-[#F0EDE0] border-b border-[#E0DCCF] flex items-center justify-between z-40 select-none text-[#0F0F0F]">
      {/* Left: Brand Lockup & Run Context */}
      <div className="flex items-center gap-4 sm:gap-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <svg className="h-7 w-7 text-accent-orange transition-transform duration-300 group-hover:scale-105" viewBox="0 0 32 32" fill="none">
            <circle cx="6" cy="16" r="4" fill="#E57D25" />
            <circle cx="16" cy="6" r="3.5" fill="#0F0F0F" />
            <circle cx="16" cy="26" r="3.5" fill="#0F0F0F" />
            <circle cx="26" cy="16" r="4" fill="#E57D25" />
            <path d="M6 16L16 6M6 16L16 26M16 6L26 16M16 26L26 16" stroke="#0F0F0F" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="font-heading text-xl font-bold tracking-tight text-[#0F0F0F]">
            Neo<span className="text-accent-orange font-normal italic">Chems</span>
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-widest bg-[#E57D25]/15 text-[#E57D25] border border-[#E57D25]/30 font-bold">
              LAB
            </span>
          </span>
        </Link>

        {/* Run / Project Ticker */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-lg bg-white border border-[#E0DCCF] text-xs font-mono shadow-xs">
          <span className="text-[#8A8A8A] font-bold">RUN:</span>
          <span className="text-[#0F0F0F] font-bold">{currentRun.id}</span>
          <span className="text-[#E0DCCF]">|</span>
          <span className="text-[#5A564C] truncate max-w-xs">{currentRun.targetMolecule || currentRun.objective}</span>
        </div>
      </div>

      {/* Center: Persistent View Switcher */}
      <div className="flex items-center p-1 rounded-xl bg-[#E5E1D4] border border-[#D5D0C2]">
        <button
          type="button"
          onClick={() => setActiveView("chat")}
          className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 ${
            activeView === "chat"
              ? "bg-[#0F0F0F] text-[#FAF8F2] font-bold shadow-sm"
              : "text-[#5A564C] hover:text-[#0F0F0F] hover:bg-white/40"
          }`}
        >
          <span>💬</span>
          <span className="hidden sm:inline">Conversation</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("aerial")}
          className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 ${
            activeView === "aerial"
              ? "bg-[#0F0F0F] text-[#FAF8F2] font-bold shadow-sm"
              : "text-[#5A564C] hover:text-[#0F0F0F] hover:bg-white/40"
          }`}
        >
          <span>🏢</span>
          <span className="hidden sm:inline">Aerial Office</span>
          <span className="text-[10px] px-1 rounded bg-[#E57D25]/20 text-[#E57D25] font-bold">3D</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("graph")}
          className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 ${
            activeView === "graph"
              ? "bg-[#0F0F0F] text-[#FAF8F2] font-bold shadow-sm"
              : "text-[#5A564C] hover:text-[#0F0F0F] hover:bg-white/40"
          }`}
        >
          <span>🕸️</span>
          <span className="hidden sm:inline">Agent Graph</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("chemistry")}
          className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 ${
            activeView === "chemistry"
              ? "bg-[#0F0F0F] text-[#FAF8F2] font-bold shadow-sm"
              : "text-[#5A564C] hover:text-[#0F0F0F] hover:bg-white/40"
          }`}
        >
          <span>⚗️</span>
          <span className="hidden sm:inline">Chemistry</span>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2.5">
        {/* Toggle Split Aerial View in Chat mode */}
        {activeView === "chat" && (
          <button
            type="button"
            onClick={() => setIsSplitAerialOpen(!isSplitAerialOpen)}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              isSplitAerialOpen
                ? "bg-[#E57D25] text-white border-[#E57D25] font-bold shadow-xs"
                : "bg-white text-[#5A564C] border-[#E0DCCF] hover:bg-[#FAF8F2] hover:text-[#0F0F0F]"
            }`}
            title="Toggle side-by-side 3D Aerial Office"
          >
            <span>👁️</span>
            <span>{isSplitAerialOpen ? "Hide 3D Split" : "Split 3D"}</span>
          </button>
        )}

        <button
          type="button"
          onClick={resetRun}
          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#FAF8F2] text-[#5A564C] hover:text-[#0F0F0F] text-xs font-mono border border-[#E0DCCF] transition-colors"
          title="Reset Run State"
        >
          ↻ Reset
        </button>

        <Link
          href="/"
          className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-[#FAF8F2] text-[#0F0F0F] text-xs font-mono font-bold border border-[#E0DCCF] shadow-xs transition-colors"
        >
          Exit Lab
        </Link>
      </div>
    </header>
  );
}
