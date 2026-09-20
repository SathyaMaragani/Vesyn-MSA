"use client";

import React, { useState } from "react";
import { useRuntime } from "@/lib/runtime/RuntimeContext";

export function TaskQueueSidebar() {
  const { agents, tasks, selectAgent, chatWithAgent, currentRun } = useRuntime();
  const [tab, setTab] = useState<"agents" | "tasks">("agents");

  return (
    <aside className="w-80 h-full bg-[#F0EDE0] border-l border-[#E0DCCF] flex flex-col select-none text-[#0F0F0F] text-xs">
      {/* Top Segmented Tabs */}
      <div className="flex border-b border-[#E0DCCF] p-2 gap-1.5 bg-[#E8E4D6]">
        <button
          type="button"
          onClick={() => setTab("agents")}
          className={`flex-1 py-1.5 rounded-lg font-mono text-[11px] uppercase transition-all font-bold ${
            tab === "agents"
              ? "bg-white text-[#0F0F0F] shadow-xs border border-[#D5D0C2]"
              : "text-[#5A564C] hover:text-[#0F0F0F]"
          }`}
        >
          Workforce ({agents.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("tasks")}
          className={`flex-1 py-1.5 rounded-lg font-mono text-[11px] uppercase transition-all font-bold ${
            tab === "tasks"
              ? "bg-white text-[#0F0F0F] shadow-xs border border-[#D5D0C2]"
              : "text-[#5A564C] hover:text-[#0F0F0F]"
          }`}
        >
          Task Queue ({tasks.length})
        </button>
      </div>

      {/* Workforce or Task Queue List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {tab === "agents" ? (
          agents.map((ag) => (
            <div
              key={ag.id}
              className="p-3.5 rounded-xl bg-white border border-[#E0DCCF] hover:border-[#c4bea8] transition-all shadow-xs flex flex-col space-y-2 group"
            >
              {/* Agent Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-base bg-[#F4F1E6] border border-[#E0DCCF]"
                    style={{ color: ag.accentColor }}
                  >
                    {ag.symbol}
                  </div>
                  <div>
                    <div className="font-heading font-bold text-[#0F0F0F] text-sm leading-tight">
                      {ag.name}
                    </div>
                    <div className="font-mono text-[9px] text-[#8A8A8A] uppercase">
                      {ag.role}
                    </div>
                  </div>
                </div>

                <span
                  className="px-2 py-0.5 rounded text-[9px] font-mono uppercase font-bold border"
                  style={{
                    backgroundColor: `${ag.color}15`,
                    borderColor: `${ag.color}40`,
                    color: ag.accentColor,
                  }}
                >
                  {ag.state}
                </span>
              </div>

              {/* Tagline / Current Task */}
              <p className="text-[11px] text-[#5A564C] line-clamp-2 font-body leading-snug">
                {ag.currentTask || ag.tagline}
              </p>

              {/* Progress bar if active */}
              {(ag.state === "WORKING" || ag.state === "VALIDATING") && (
                <div className="w-full bg-[#E0DCCF] rounded-full h-1 overflow-hidden mt-1">
                  <div
                    className="h-full bg-[#E57D25] rounded-full transition-all duration-300"
                    style={{ width: `${ag.progress}%` }}
                  />
                </div>
              )}

              {/* Action Buttons: Chat & What It Did */}
              <div className="pt-2 border-t border-[#E0DCCF]/60 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => chatWithAgent(ag.role)}
                  className="flex-1 py-1 px-2 rounded-lg bg-[#E57D25] hover:bg-[#d06e1c] text-white font-mono text-[10px] font-bold transition-colors flex items-center justify-center gap-1 shadow-xs"
                >
                  <span>💬</span>
                  <span>Chat</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectAgent(ag.id)}
                  className="flex-1 py-1 px-2 rounded-lg bg-[#F0EDE0] hover:bg-[#E0DCCF] border border-[#E0DCCF] text-[#0F0F0F] font-mono text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                >
                  <span>📋</span>
                  <span>What it did</span>
                </button>
              </div>
            </div>
          ))
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center text-[#5A564C] font-mono text-xs space-y-1">
            <span className="text-xl block">📂</span>
            <span>No active tasks in queue.</span>
            <span className="text-[11px] text-[#8A8A8A] block">Enter a research objective to trigger workflow.</span>
          </div>
        ) : (
          tasks.map((task) => {
            const ag = agents.find((a) => a.role === task.assignedAgent);
            return (
              <div
                key={task.id}
                className="p-3.5 rounded-xl bg-white border border-[#E0DCCF] space-y-2 text-xs shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-mono text-[10px] font-bold"
                    style={{ color: ag?.accentColor || "#0F0F0F" }}
                  >
                    {ag?.name || task.assignedAgent}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                      task.status === "COMPLETE"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : task.status === "RUNNING"
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-[#F0EDE0] text-[#5A564C]"
                    }`}
                  >
                    {task.status}
                  </span>
                </div>

                <div className="font-heading font-semibold text-[#0F0F0F] text-xs">
                  {task.title}
                </div>

                <p className="font-body text-[11px] text-[#5A564C] leading-snug">{task.description}</p>

                {task.output && (
                  <div className="p-2 rounded bg-[#FAF8F2] border border-[#E0DCCF] font-mono text-[10px] text-[#0F0F0F]">
                    <span className="text-[#8A8A8A] block text-[9px]">OUTPUT:</span>
                    {task.output}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-[#E0DCCF] bg-[#E8E4D6] flex items-center justify-between font-mono text-[10px] text-[#5A564C]">
        <span>STATUS: {currentRun.status}</span>
        <span className="font-bold text-[#E57D25]">{currentRun.progress}% COMPLETE</span>
      </div>
    </aside>
  );
}
