"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Agent, AgentRole, Task, ChatMessage, RunState } from "./types";
import { INITIAL_AGENTS } from "./initialData";

interface RuntimeContextType {
  agents: Agent[];
  tasks: Task[];
  messages: ChatMessage[];
  currentRun: RunState;
  selectedAgentId: string | null;
  targetedAgentRole: AgentRole | null;
  activeView: "chat" | "aerial" | "graph" | "chemistry";
  isSplitAerialOpen: boolean;
  activeCommunication: { from: AgentRole; to: AgentRole } | null;
  
  // Actions
  setActiveView: (view: "chat" | "aerial" | "graph" | "chemistry") => void;
  setIsSplitAerialOpen: (open: boolean) => void;
  selectAgent: (agentId: string | null) => void;
  setTargetedAgentRole: (role: AgentRole | null) => void;
  chatWithAgent: (role: AgentRole) => void;
  sendMessage: (content: string) => Promise<void>;
  resetRun: () => void;
  cancelRun: () => void;
}

const RuntimeContext = createContext<RuntimeContextType | null>(null);

const DEFAULT_RUN: RunState = {
  id: "NC-RUN-2026-INIT",
  objective: "Awaiting research objective...",
  status: "IDLE",
  progress: 0,
  currentStepDescription: "System ready. Specialized agents synchronized.",
  activeAgents: [],
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "msg-welcome",
    role: "assistant",
    content: "Welcome to NeoChems Lab. I am connected to a synchronized workforce of 7 specialized scientific agents: Orchestrator, Research, Retrosynthesis, Validation, Knowledge, Analysis, and Critic. What molecular target, synthesis problem, or literature review objective would you like to investigate?",
    timestamp: "Just now",
  },
];

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [currentRun, setCurrentRun] = useState<RunState>(DEFAULT_RUN);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [targetedAgentRole, setTargetedAgentRole] = useState<AgentRole | null>(null);
  const [activeView, setActiveView] = useState<"chat" | "aerial" | "graph" | "chemistry">("chat");
  const [isSplitAerialOpen, setIsSplitAerialOpen] = useState(false);
  const [activeCommunication, setActiveCommunication] = useState<{ from: AgentRole; to: AgentRole } | null>(null);

  // Update specific agent's state
  const updateAgent = useCallback((role: AgentRole, partial: Partial<Agent>) => {
    setAgents((prev) =>
      prev.map((a) => (a.role === role ? { ...a, ...partial } : a))
    );
  }, []);

  const selectAgent = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId);
  }, []);

  const chatWithAgent = useCallback((role: AgentRole) => {
    setTargetedAgentRole(role);
    setSelectedAgentId(null);
    setActiveView("chat");
  }, []);

  const resetRun = useCallback(() => {
    setAgents(INITIAL_AGENTS);
    setTasks([]);
    setCurrentRun(DEFAULT_RUN);
    setActiveCommunication(null);
    setTargetedAgentRole(null);
  }, []);

  const cancelRun = useCallback(() => {
    setCurrentRun((prev) => ({ ...prev, status: "IDLE", progress: 0, currentStepDescription: "Run cancelled." }));
    setAgents((prev) => prev.map((a) => ({ ...a, state: "IDLE", progress: 100, currentTask: "Idle." })));
    setActiveCommunication(null);
  }, []);

  // Multi-Agent Execution Simulator or Direct Agent Consultation
  // NOT WIRED YET. This is the single place the lab becomes real.
  //
  // The backend already exposes everything needed; see docs/FRONTEND-HANDOFF.md.
  //   POST /api/projects {target}      -> {project, run}
  //   WS   /ws/events?run_id=&after=0  -> replay, then live tail
  //   GET  /api/runs/{id}              -> the final result package
  //
  // Implement as a fold: every field rendered by the lab must come from an
  // event or from GET /api/runs/{id}. Never synthesise a value the backend did
  // not return - render "not reported" instead. The previous version of this
  // file faked entire runs, including DOIs and confidence scores, which is why
  // it was deleted rather than extended.
  const sendMessage = useCallback(
    async (content: string) => {
      const now = () =>
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-user-${Date.now()}`,
          role: "user",
          content,
          timestamp: now(),
          targetedAgent: targetedAgentRole || undefined,
        },
        {
          id: `msg-asst-${Date.now()}`,
          role: "assistant",
          content:
            "The lab UI is not connected to the NeoChems API yet, so there is " +
            "nothing real to report. Wire `sendMessage` in " +
            "`src/lib/runtime/RuntimeContext.tsx` to `POST /api/projects` and " +
            "`WS /ws/events` - see docs/FRONTEND-HANDOFF.md.",
          timestamp: now(),
        },
      ]);
    },
    [targetedAgentRole]
  );

  return (
    <RuntimeContext.Provider
      value={{
        agents,
        tasks,
        messages,
        currentRun,
        selectedAgentId,
        targetedAgentRole,
        activeView,
        isSplitAerialOpen,
        activeCommunication,
        setActiveView,
        setIsSplitAerialOpen,
        selectAgent,
        setTargetedAgentRole,
        chatWithAgent,
        sendMessage,
        resetRun,
        cancelRun,
      }}
    >
      {children}
    </RuntimeContext.Provider>
  );
}

export function useRuntime() {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error("useRuntime must be used within a RuntimeProvider");
  }
  return context;
}
