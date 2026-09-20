"use client";

import React, { useState } from "react";
import { useRuntime } from "@/lib/runtime/RuntimeContext";
import { LabHeader } from "./LabHeader";
import { LabChat } from "./LabChat";
import { AerialAgentOffice } from "./AerialAgentOffice";
import { AgentGraphView } from "./AgentGraphView";
import { ChemistryWorkspace } from "./ChemistryWorkspace";
import { TaskQueueSidebar } from "./TaskQueueSidebar";
import { AgentProfileModal } from "./AgentProfileModal";

export function LabShell() {
  const { activeView, isSplitAerialOpen, setIsSplitAerialOpen } = useRuntime();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="relative w-screen h-screen bg-[#F4F1E6] text-[#0F0F0F] flex flex-col overflow-hidden font-sans select-none">
      {/* Top Navigation Chrome */}
      <LabHeader />

      {/* Main Workspace Layout */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden p-3 sm:p-5 relative bg-[#F4F1E6]">
          {/* Background Architectural Drafting Grid Motif */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(15,15,15,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,15,15,0.2) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          {/* VIEW: CONVERSATION */}
          {activeView === "chat" && (
            <div className="flex-1 flex gap-4 w-full h-full overflow-hidden">
              <div className="flex-1 h-full overflow-hidden flex flex-col">
                <LabChat />
              </div>

              {/* Split-screen Aerial Office (if toggled) */}
              {isSplitAerialOpen && (
                <div className="hidden md:flex w-[480px] lg:w-[560px] h-full flex-col relative border border-[#E0DCCF] rounded-2xl overflow-hidden shadow-xl bg-[#FAF8F2] animate-slide-in">
                  <div className="p-3 bg-[#F0EDE0] border-b border-[#E0DCCF] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#E57D25]" />
                      <span className="font-mono text-xs text-[#0F0F0F] font-bold">AERIAL WORKFORCE · STUDIO 3D</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSplitAerialOpen(false)}
                      className="text-[#5A564C] hover:text-[#0F0F0F] text-xs px-2 py-0.5 rounded bg-white border border-[#E0DCCF] transition-colors"
                    >
                      ✕ Close Split
                    </button>
                  </div>
                  <div className="flex-1 relative">
                    <AerialAgentOffice isCompact={true} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW: AERIAL 3D OFFICE */}
          {activeView === "aerial" && (
            <div className="w-full h-full flex flex-col flex-1 overflow-hidden">
              <AerialAgentOffice />
            </div>
          )}

          {/* VIEW: AGENT GRAPH */}
          {activeView === "graph" && (
            <div className="w-full h-full flex flex-col flex-1 overflow-hidden">
              <AgentGraphView />
            </div>
          )}

          {/* VIEW: CHEMISTRY WORKSPACE */}
          {activeView === "chemistry" && (
            <div className="w-full h-full flex flex-col flex-1 overflow-hidden">
              <ChemistryWorkspace />
            </div>
          )}
        </main>

        {/* Right Collapsible Task & Workforce Sidebar */}
        {isSidebarOpen && <TaskQueueSidebar />}
      </div>

      {/* Floating Modal for Selected Agent Profile */}
      <AgentProfileModal />
    </div>
  );
}
