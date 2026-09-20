"use client";

import React, { useState } from "react";
import { useRuntime } from "@/lib/runtime/RuntimeContext";
import { Agent, AgentExecutionRecord } from "@/lib/runtime/types";

export function AgentProfileModal() {
  const { agents, selectedAgentId, selectAgent, chatWithAgent } = useRuntime();
  const [activeTab, setActiveTab] = useState<"history" | "profile" | "memory">("history");

  const agent = agents.find((a) => a.id === selectedAgentId);
  if (!agent) return null;

  const handleStartChat = () => {
    chatWithAgent(agent.role);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#FAF8F2] border border-[#E0DCCF] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-[#0F0F0F]">
        {/* Architectural Header Banner */}
        <div
          className="relative px-6 py-5 border-b border-[#E0DCCF] flex items-start justify-between"
          style={{
            background: `linear-gradient(135deg, ${agent.color}15 0%, #FAF8F2 100%)`,
            borderTop: `4px solid ${agent.accentColor || agent.color}`,
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shadow-sm border border-[#E0DCCF] bg-white"
              style={{ color: agent.accentColor }}
            >
              {agent.symbol}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-2xl font-bold text-[#0F0F0F] tracking-tight">{agent.name}</h3>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold border"
                  style={{
                    backgroundColor: `${agent.color}20`,
                    borderColor: `${agent.color}40`,
                    color: agent.accentColor,
                  }}
                >
                  {agent.state}
                </span>
              </div>
              <p className="font-mono text-xs text-[#5A564C] mt-0.5">{agent.tagline}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartChat}
              className="px-3.5 py-1.5 rounded-lg bg-[#E57D25] hover:bg-[#d06e1c] text-white text-xs font-mono font-bold shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>💬</span>
              <span>Chat with Agent</span>
            </button>
            <button
              type="button"
              onClick={() => selectAgent(null)}
              className="w-8 h-8 rounded-lg bg-[#E0DCCF]/50 hover:bg-[#E0DCCF] text-[#5A564C] hover:text-[#0F0F0F] flex items-center justify-center transition-colors text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#E0DCCF] bg-[#F0EDE0]/70 px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`pb-2.5 px-3 font-mono text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "history"
                ? "border-[#E57D25] text-[#E57D25]"
                : "border-transparent text-[#5A564C] hover:text-[#0F0F0F]"
            }`}
          >
            <span>📋</span>
            <span>What Did This Agent Do?</span>
            {agent.executionHistory && agent.executionHistory.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#E57D25]/15 text-[#E57D25] text-[10px]">
                {agent.executionHistory.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`pb-2.5 px-3 font-mono text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "profile"
                ? "border-[#E57D25] text-[#E57D25]"
                : "border-transparent text-[#5A564C] hover:text-[#0F0F0F]"
            }`}
          >
            <span>🔬</span>
            <span>Role & Connected Tools</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("memory")}
            className={`pb-2.5 px-3 font-mono text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "memory"
                ? "border-[#E57D25] text-[#E57D25]"
                : "border-transparent text-[#5A564C] hover:text-[#0F0F0F]"
            }`}
          >
            <span>🧠</span>
            <span>Memory & Knowledge</span>
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm flex-1">
          {/* TAB 1: WHAT DID THIS AGENT DO? */}
          {activeTab === "history" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-heading text-lg font-bold text-[#0F0F0F]">Execution Dossier & Action Log</h4>
                  <p className="font-body text-xs text-[#5A564C]">
                    Chronological audit of tasks executed, tools invoked, and findings verified by this agent.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleStartChat}
                  className="px-3 py-1 rounded-md bg-[#0F0F0F] text-[#FAF8F2] text-xs font-mono font-medium hover:bg-[#2b2b2b] transition-colors"
                >
                  Ask Agent About This →
                </button>
              </div>

              {(!agent.executionHistory || agent.executionHistory.length === 0) ? (
                <div className="p-8 text-center rounded-xl bg-[#F0EDE0] border border-[#E0DCCF] text-[#5A564C] font-mono text-xs">
                  No execution records logged for this agent in the current session.
                </div>
              ) : (
                <div className="space-y-4">
                  {agent.executionHistory.map((rec: AgentExecutionRecord) => (
                    <div
                      key={rec.id}
                      className="p-4 rounded-xl bg-white border border-[#E0DCCF] shadow-sm space-y-3 transition-all hover:border-[#c9c3b2]"
                    >
                      <div className="flex items-center justify-between border-b border-[#E0DCCF]/60 pb-2">
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <span className="font-bold text-[#0F0F0F]">{rec.runId}</span>
                          <span className="text-[#8A8A8A]">·</span>
                          <span className="text-[#5A564C]">{rec.timestamp}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          {rec.status}
                        </span>
                      </div>

                      {/* Objective */}
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A8A]">Assigned Objective</div>
                        <div className="font-heading font-semibold text-sm text-[#0F0F0F] mt-0.5">
                          {rec.objective || rec.objectiveOrInput}
                        </div>
                      </div>

                      {/* Action Taken */}
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A8A]">Action Performed</div>
                        <p className="font-body text-xs text-[#2b2b2b] mt-0.5 leading-relaxed">{rec.actionTaken}</p>
                      </div>

                      {/* Tools Used */}
                      {rec.toolsUsed && rec.toolsUsed.length > 0 && (
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-[#8A8A8A] mb-1">Tools Invoked</div>
                          <div className="flex flex-wrap gap-1.5">
                            {rec.toolsUsed.map((tool, ti) => (
                              <span
                                key={ti}
                                className="px-2 py-0.5 rounded bg-[#F0EDE0] border border-[#E0DCCF] text-[11px] font-mono text-[#0F0F0F]"
                              >
                                ⚡ {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Key Findings */}
                      {rec.findings && rec.findings.length > 0 && (
                        <div className="p-3 rounded-lg bg-[#F4F1E6] border border-[#E0DCCF]/80">
                          <div className="font-mono text-[10px] uppercase tracking-wider text-[#E57D25] font-bold mb-1">
                            Key Findings & Observations
                          </div>
                          <ul className="space-y-1 text-xs text-[#0F0F0F]">
                            {rec.findings.map((f, fi) => (
                              <li key={fi} className="flex items-start gap-1.5">
                                <span className="text-[#E57D25] font-bold">▪</span>
                                <span className="font-body leading-snug">{f}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Outputs */}
                      {(rec.outputs || rec.outputProduced) && (
                        <div className="pt-2 border-t border-[#E0DCCF]/50 flex items-center justify-between text-xs font-mono">
                          <span className="text-[#8A8A8A] text-[11px]">OUTPUT ARTIFACT:</span>
                          <span className="font-bold text-[#0F0F0F]">
                            {rec.outputs ? rec.outputs.join(", ") : rec.outputProduced}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PROFILE & TOOLS */}
          {activeTab === "profile" && (
            <div className="space-y-5">
              {/* Current Task */}
              <div>
                <div className="font-mono text-[11px] text-[#5A564C] uppercase tracking-wider mb-1.5">Current Focus</div>
                <div className="p-3.5 rounded-xl bg-white border border-[#E0DCCF] flex items-center justify-between">
                  <span className="font-medium text-[#0F0F0F]">{agent.currentTask || "Standing by for objective."}</span>
                  <div className="flex items-center gap-2 font-mono text-xs text-[#5A564C]">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: agent.accentColor }} />
                    <span className="font-bold">{agent.progress}%</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="font-mono text-[11px] text-[#5A564C] uppercase tracking-wider mb-1">Role Description</div>
                <p className="font-body text-[#2B2B2B] leading-relaxed">{agent.description}</p>
              </div>

              {/* Capabilities */}
              <div>
                <div className="font-mono text-[11px] text-[#5A564C] uppercase tracking-wider mb-2">Capabilities</div>
                <div className="flex flex-wrap gap-2">
                  {agent.capabilities.map((cap, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-md bg-white border border-[#E0DCCF] text-xs text-[#0F0F0F]">
                      ✓ {cap}
                    </span>
                  ))}
                </div>
              </div>

              {/* Connected Tools */}
              <div>
                <div className="font-mono text-[11px] text-[#5A564C] uppercase tracking-wider mb-2">Connected Scientific Engines & APIs</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {agent.tools.map((tool, i) => (
                    <div key={i} className="px-3 py-2 rounded-lg bg-white border border-[#E0DCCF] flex items-center justify-between">
                      <span className="text-xs font-mono text-[#0F0F0F] font-medium">{tool.name}</span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                          tool.status === "CONNECTED"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-amber-100 text-amber-800 border border-amber-300"
                        }`}
                      >
                        {tool.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MEMORY & KNOWLEDGE */}
          {activeTab === "memory" && (
            <div className="space-y-4">
              <div>
                <h4 className="font-heading text-lg font-bold text-[#0F0F0F]">Structured Agent Memory</h4>
                <p className="font-body text-xs text-[#5A564C]">
                  Persistent domain knowledge, chemical rules, and heuristics accessible by this agent.
                </p>
              </div>

              <div className="space-y-2">
                {agent.memorySummary.map((mem, i) => (
                  <div key={i} className="p-3 rounded-lg bg-white border border-[#E0DCCF] flex items-start gap-2.5">
                    <span className="text-[#E57D25] font-bold text-sm">▪</span>
                    <span className="font-body text-xs text-[#0F0F0F] leading-relaxed">{mem}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 border-t border-[#E0DCCF] bg-[#F0EDE0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#5A564C]">AGENT ID: {agent.id}</span>
            <span className="text-[#8A8A8A]">·</span>
            <span className="font-mono text-xs text-[#5A564C]">ROLE: {agent.role}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartChat}
              className="px-4 py-1.5 rounded-lg bg-[#E57D25] hover:bg-[#d06e1c] text-xs font-mono font-bold text-white transition-colors"
            >
              💬 Chat with {agent.name}
            </button>
            <button
              type="button"
              onClick={() => selectAgent(null)}
              className="px-4 py-1.5 rounded-lg bg-white hover:bg-[#E0DCCF] text-xs font-semibold text-[#0F0F0F] border border-[#E0DCCF] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
