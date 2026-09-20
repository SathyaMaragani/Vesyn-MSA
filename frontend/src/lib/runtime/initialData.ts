import { Agent } from './types';

// PRESENTATION ONLY. Symbol, colour, desk position and the static description of
// each agent's job. Everything that changes during a run - state, progress,
// currentTask, recentEvents, executionHistory - is owned by the event stream and
// must be folded in from WS /ws/events, never hardcoded here.
//
// `tools` lists the real gateway tools each agent is permitted to call; the
// authoritative list is GET /api/tools, and `status` should be driven from it
// rather than assumed. The ids below match the backend's node ids in
// GET /api/graph: planner, research, retro, validator, replanner, critic,
// evaluator.

const NO_HISTORY = {
  memorySummary: [],
  recentEvents: [],
  executionHistory: [],
};

export const INITIAL_AGENTS: Agent[] = [
  {
    id: 'planner',
    name: 'Orchestrator',
    role: 'ORCHESTRATOR',
    symbol: '⚡',
    tagline: 'Target resolution & task planning',
    description:
      'Resolves the target from a SMILES string or a compound name, creates the run\'s tasks and briefs the team.',
    state: 'IDLE',
    currentTask: undefined,
    progress: 0,
    color: '#0254EC',
    accentColor: '#3B82F6',
    workstationPos: [0, 0, 0],
    capabilities: ['Target resolution', 'Task creation', 'Team briefing'],
    tools: [
      { name: 'pubchem.resolve', status: 'AVAILABLE' },
      { name: 'rdkit.represent', status: 'AVAILABLE' },
    ],
    ...NO_HISTORY,
  },
  {
    id: 'research',
    name: 'Research Agent',
    role: 'RESEARCH',
    symbol: '🔬',
    tagline: 'Descriptors, solubility & nearest approved drugs',
    description:
      'Computes descriptors, predicts solubility and finds the nearest approved drugs. Runs in parallel with retrosynthesis.',
    state: 'IDLE',
    currentTask: undefined,
    progress: 0,
    color: '#5B7553',
    accentColor: '#10B981',
    workstationPos: [-5, 0, -3],
    capabilities: ['Descriptor calculation', 'Solubility prediction', 'Similarity search'],
    tools: [
      { name: 'rdkit.represent', status: 'AVAILABLE' },
      { name: 'qsar.solubility', status: 'AVAILABLE' },
      { name: 'chembl.similarity', status: 'AVAILABLE' },
    ],
    ...NO_HISTORY,
  },
  {
    id: 'retro',
    name: 'Retrosynthesis Agent',
    role: 'RETROSYNTHESIS',
    symbol: '🧪',
    tagline: 'Route search at the current budget',
    description:
      'Runs an AiZynthFinder MCTS search over USPTO-derived templates at the iteration budget the replanner sets.',
    state: 'IDLE',
    currentTask: undefined,
    progress: 0,
    color: '#E57D25',
    accentColor: '#F97316',
    workstationPos: [5, 0, -3],
    capabilities: ['Retrosynthetic search', 'Route enumeration'],
    tools: [{ name: 'aizynthfinder.plan', status: 'AVAILABLE' }],
    ...NO_HISTORY,
  },
  {
    id: 'validator',
    name: 'Validation Agent',
    role: 'VALIDATION',
    symbol: '🛡️',
    tagline: 'Per-step structural, forward & literature checks',
    description:
      'For each step: RDKit template reversal, a ReactionT5 forward prediction and an ORD/USPTO precedent lookup, then a rule-based assessment. Flags steps as REVIEW_REQUIRED on disagreement.',
    state: 'IDLE',
    currentTask: undefined,
    progress: 0,
    color: '#7B6B8A',
    accentColor: '#8B5CF6',
    workstationPos: [-5, 0, 3],
    capabilities: ['Template reversal', 'Forward validation', 'Precedent lookup'],
    tools: [
      { name: 'rdkit.template_validation', status: 'AVAILABLE' },
      { name: 'reactiont5.forward_validation', status: 'STANDBY' },
      { name: 'ord.evidence', status: 'AVAILABLE' },
    ],
    ...NO_HISTORY,
  },
  {
    id: 'replanner',
    name: 'Replanner',
    role: 'REPLANNER',
    symbol: '🔄',
    tagline: 'Widens the search on a failed verdict',
    description:
      'On a failed verdict, widens the search budget (100 → 250 → 500 iterations, +5 routes per attempt) for up to three attempts.',
    state: 'IDLE',
    currentTask: undefined,
    progress: 0,
    color: '#DBC9A0',
    accentColor: '#EAB308',
    workstationPos: [0, 0, -5],
    capabilities: ['Budget escalation', 'Attempt tracking'],
    tools: [],
    ...NO_HISTORY,
  },
  {
    id: 'evaluator',
    name: 'Route Evaluator',
    role: 'EVALUATOR',
    symbol: '📊',
    tagline: 'Scores, ranks & recommends - or refuses to',
    description:
      'Scores and ranks the routes, persists them, writes the report, and recommends one. If the top route still needs review it recommends nothing.',
    state: 'IDLE',
    currentTask: undefined,
    progress: 0,
    color: '#0D9488',
    accentColor: '#14B8A6',
    workstationPos: [5, 0, 3],
    capabilities: ['Route scoring', 'Ranking', 'Report generation'],
    tools: [{ name: 'llm.generate', status: 'STANDBY' }],
    ...NO_HISTORY,
  },
  {
    id: 'critic',
    name: 'Critic Agent',
    role: 'CRITIC',
    symbol: '⚖️',
    tagline: 'Severity-ranked critique of every route',
    description:
      'Produces a deterministic critique of each route - severity-ranked issues and strengths - with optional LLM prose on top.',
    state: 'IDLE',
    currentTask: undefined,
    progress: 0,
    color: '#C1847B',
    accentColor: '#EF4444',
    workstationPos: [0, 0, 5],
    capabilities: ['Issue detection', 'Severity ranking', 'Adversarial review'],
    tools: [{ name: 'llm.generate', status: 'STANDBY' }],
    ...NO_HISTORY,
  },
];
