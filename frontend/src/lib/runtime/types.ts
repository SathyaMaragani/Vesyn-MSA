export type AgentRole =
  | 'ORCHESTRATOR'
  | 'RESEARCH'
  | 'RETROSYNTHESIS'
  | 'VALIDATION'
  | 'REPLANNER'
  | 'EVALUATOR'
  | 'CRITIC';

export type AgentState =
  | 'IDLE'
  | 'WORKING'
  | 'WAITING'
  | 'VALIDATING'
  | 'COMMUNICATING'
  | 'ERROR'
  | 'COMPLETE';

export interface AgentExecutionRecord {
  id: string;
  runId: string;
  timestamp: string;
  objectiveOrInput: string;
  objective?: string;
  actionTaken: string;
  outputProduced: string;
  outputs?: string[];
  toolsUsed: string[];
  findings: string[];
  status: 'SUCCESS' | 'FLAGGED' | 'REVISED';
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  symbol: string;
  tagline: string;
  description: string;
  state: AgentState;
  currentTask?: string;
  progress: number;
  color: string;
  accentColor: string;
  workstationPos: [number, number, number]; // [x, y, z] in 3D scene
  capabilities: string[];
  tools: { name: string; status: 'CONNECTED' | 'AVAILABLE' | 'STANDBY' }[];
  memorySummary: string[];
  recentEvents: string[];
  executionHistory: AgentExecutionRecord[];
}

export type TaskStatus = 'QUEUED' | 'RUNNING' | 'VALIDATING' | 'COMPLETE' | 'FAILED';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedAgent: AgentRole;
  status: TaskStatus;
  progress: number;
  dependencies: string[];
  output?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ReactionStep {
  stepNumber: number;
  transformation: string;
  reactants: string[];
  product: string;
  reagents: string;
  conditions: string;
  yield: string;
  feasibility: number; // 0-100
  validationStatus: 'VERIFIED' | 'WARNING' | 'REJECTED';
  notes?: string;
}

export interface RetrosynthesisRoute {
  id: string;
  title: string;
  confidence: number;
  stepsCount: number;
  startingMaterials: string[];
  disconnections: string[];
  steps: ReactionStep[];
  status: 'VALIDATED' | 'CRITIQUED' | 'REVISED' | 'REJECTED';
  criticVerdict: string;
}

export interface MolecularProperties {
  formula: string;
  molecularWeight: number;
  logP: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotatableBonds: number;
  solubility: string;
  solubilityValue: string;
  drugLikeness: 'High' | 'Moderate' | 'Low';
}

export interface EvidenceItem {
  id: string;
  title: string;
  authors: string;
  source: string;
  year: number;
  doi: string;
  relevance: string;
  confidenceScore: number;
  verified: boolean;
}

export interface StructuredResult {
  targetName: string;
  smiles: string;
  summary: string;
  routes: RetrosynthesisRoute[];
  properties: MolecularProperties;
  evidence: EvidenceItem[];
  criticNotes: string[];
  validationPassed: boolean;
  completionTime: string;
}

export interface AgentActivityStep {
  agentRole: AgentRole;
  agentName: string;
  action: string;
  timestamp: string;
  status: 'STARTED' | 'IN_PROGRESS' | 'REPLANNING' | 'COMPLETED' | 'FLAGGED';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  runId?: string;
  targetedAgent?: AgentRole;
  isStreaming?: boolean;
  activitySteps?: AgentActivityStep[];
  structuredResult?: StructuredResult;
}

export interface RunState {
  id: string;
  objective: string;
  targetMolecule?: string;
  status: 'IDLE' | 'RUNNING' | 'REPLANNING' | 'COMPLETED' | 'ERROR';
  progress: number;
  currentStepDescription: string;
  activeAgents: AgentRole[];
  startedAt?: string;
  completedAt?: string;
}
