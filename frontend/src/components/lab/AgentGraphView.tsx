"use client";

import React, { useState } from "react";
import { useRuntime } from "@/lib/runtime/RuntimeContext";
import { AgentRole } from "@/lib/runtime/types";

interface GraphNode {
  id: AgentRole;
  label: string;
  sublabel: string;
  x: number;
  y: number;
}

// Mirrors the real LangGraph in backend/mas/graph.py. Hand-laid positions are
// fine while the graph is 7 fixed nodes, but the topology itself is available
// from GET /api/graph - drive it from there rather than editing this list.
const NODES: GraphNode[] = [
  { id: "ORCHESTRATOR", label: "Orchestrator", sublabel: "Resolve target & plan", x: 450, y: 60 },
  { id: "RESEARCH", label: "Research Agent", sublabel: "Descriptors & solubility", x: 240, y: 190 },
  { id: "RETROSYNTHESIS", label: "Retrosynthesis", sublabel: "AiZynthFinder search", x: 660, y: 190 },
  { id: "VALIDATION", label: "Validation Agent", sublabel: "Structure, forward & precedent", x: 450, y: 330 },
  { id: "REPLANNER", label: "Replanner", sublabel: "Widen the budget", x: 780, y: 330 },
  { id: "CRITIC", label: "Critic Agent", sublabel: "Severity-ranked critique", x: 450, y: 460 },
  { id: "EVALUATOR", label: "Route Evaluator", sublabel: "Score, rank & recommend", x: 450, y: 580 },
];

const EDGES: { from: AgentRole; to: AgentRole; label?: string }[] = [
  { from: "ORCHESTRATOR", to: "RESEARCH", label: "target" },
  { from: "ORCHESTRATOR", to: "RETROSYNTHESIS", label: "target" },
  { from: "RESEARCH", to: "VALIDATION", label: "profile" },
  { from: "RETROSYNTHESIS", to: "VALIDATION", label: "candidate routes" },
  { from: "VALIDATION", to: "CRITIC", label: "pass" },
  { from: "VALIDATION", to: "REPLANNER", label: "fail" },
  { from: "REPLANNER", to: "RETROSYNTHESIS", label: "wider budget" },
  { from: "CRITIC", to: "EVALUATOR", label: "critique" },
];

export function AgentGraphView() {
  const { agents, selectAgent, chatWithAgent, activeCommunication, currentRun } = useRuntime();
  const [hoveredNode, setHoveredNode] = useState<AgentRole | null>(null);

  const getAgent = (role: AgentRole) => agents.find((a) => a.role === role);

  return (
    <div className="relative w-full h-full min-h-[580px] bg-[#FAF8F2] rounded-2xl overflow-hidden border border-[#E0DCCF] p-6 flex flex-col shadow-xs text-[#0F0F0F]">
      {/* Header Info */}
      <div className="flex items-center justify-between mb-4 border-b border-[#E0DCCF] pb-3">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-white border border-[#E0DCCF] flex items-center gap-2 shadow-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E57D25] animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-widest text-[#0F0F0F] font-bold">
              REAL-TIME AGENT TASK GRAPH
            </span>
          </div>
          <span className="font-mono text-xs text-[#5A564C] hidden md:inline">
            Status: <strong className="text-[#0F0F0F]">{currentRun.status}</strong> · Phase: {currentRun.currentStepDescription}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-[#5A564C]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Active Step</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E57D25]" />
            <span>Critic Replan Loop</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-auto">
        <svg
          viewBox="0 0 900 580"
          className="w-full h-full max-w-4xl max-h-[580px] select-none"
        >
          <defs>
            <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#E57D25" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.9" />
            </linearGradient>
            <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Technical Grid in SVG */}
          <g opacity="0.15">
            {Array.from({ length: 18 }).map((_, i) => (
              <line key={`vg-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="580" stroke="#0F0F0F" strokeWidth="0.5" strokeDasharray="3,3" />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={`hg-${i}`} x1="0" y1={i * 50} x2="900" y2={i * 50} stroke="#0F0F0F" strokeWidth="0.5" strokeDasharray="3,3" />
            ))}
          </g>

          {/* Edges */}
          {EDGES.map((edge, idx) => {
            const fromNode = NODES.find((n) => n.id === edge.from)!;
            const toNode = NODES.find((n) => n.id === edge.to)!;

            const isCommActive =
              activeCommunication &&
              activeCommunication.from === edge.from &&
              activeCommunication.to === edge.to;

            const isReplanLoop = edge.from === "CRITIC" && edge.to === "ORCHESTRATOR";

            // Curve calculation
            let pathD = `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`;
            if (isReplanLoop) {
              pathD = `M ${fromNode.x - 70} ${fromNode.y} C 50 ${fromNode.y}, 50 ${toNode.y}, ${toNode.x - 80} ${toNode.y}`;
            }

            return (
              <g key={idx}>
                {/* Background path line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isReplanLoop ? "rgba(229, 125, 37, 0.4)" : "#D8D3C5"}
                  strokeWidth={isCommActive ? "3.5" : "2"}
                  strokeDasharray={isReplanLoop ? "6,4" : undefined}
                />

                {/* Animated active pulse edge */}
                {isCommActive && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="url(#edgeGrad)"
                    strokeWidth="4"
                    strokeDasharray="8,6"
                    className="animate-pulse"
                    filter="url(#softGlow)"
                  />
                )}

                {/* Edge Label */}
                {edge.label && (
                  <text
                    x={(fromNode.x + toNode.x) / 2 + (isReplanLoop ? -140 : 0)}
                    y={(fromNode.y + toNode.y) / 2 + (isReplanLoop ? 0 : -8)}
                    fill={isReplanLoop ? "#E57D25" : "#7A7568"}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {NODES.map((node) => {
            const ag = getAgent(node.id);
            if (!ag) return null;

            const isWorking = ag.state === "WORKING" || ag.state === "VALIDATING";
            const isHovered = hoveredNode === node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => selectAgent(ag.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-transform group"
              >
                {/* Outer halo when working */}
                {isWorking && (
                  <circle
                    r="46"
                    fill="none"
                    stroke={ag.accentColor}
                    strokeWidth="2.5"
                    strokeDasharray="6,4"
                    className="animate-spin"
                    style={{ transformOrigin: "0px 0px" }}
                    opacity="0.9"
                  />
                )}

                {/* Drop shadow */}
                <rect
                  x="-85"
                  y="-28"
                  width="170"
                  height="60"
                  rx="10"
                  fill="rgba(0,0,0,0.06)"
                  transform="translate(2, 3)"
                />

                {/* Main Node Card Background */}
                <rect
                  x="-85"
                  y="-30"
                  width="170"
                  height="60"
                  rx="10"
                  fill="#FFFFFF"
                  stroke={isWorking ? ag.accentColor : isHovered ? "#E57D25" : "#E0DCCF"}
                  strokeWidth={isWorking || isHovered ? "2.5" : "1.5"}
                />

                {/* Left Colored Accent Bar */}
                <rect x="-85" y="-30" width="6" height="60" rx="3" fill={ag.accentColor || ag.color} />

                {/* Symbol */}
                <text x="-62" y="5" fontSize="18" textAnchor="middle">
                  {ag.symbol}
                </text>

                {/* Name */}
                <text x="-46" y="-6" fill="#0F0F0F" fontSize="12" fontWeight="bold" fontFamily="system-ui">
                  {ag.name}
                </text>

                {/* Sublabel */}
                <text x="-46" y="12" fill="#5A564C" fontSize="9" fontFamily="monospace">
                  {node.sublabel}
                </text>

                {/* Status Dot */}
                <circle
                  cx="65"
                  cy="-15"
                  r="4"
                  fill={
                    ag.state === "WORKING"
                      ? "#10B981"
                      : ag.state === "VALIDATING"
                      ? "#8B5CF6"
                      : ag.state === "COMPLETE"
                      ? "#3B82F6"
                      : "#9CA3AF"
                  }
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Footer Info / Legend */}
      <div className="pt-3 border-t border-[#E0DCCF] flex items-center justify-between text-xs font-mono text-[#5A564C]">
        <span>Graph Model: LangGraph Dynamic Task DAG</span>
        <div className="flex items-center gap-3">
          <span className="text-[#0F0F0F] font-bold">💡 Click any agent node to inspect what it did or chat directly</span>
        </div>
      </div>
    </div>
  );
}
