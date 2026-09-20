# NEOCHEMS

> **A Multi-Agent Scientific Intelligence System for Chemistry Research, Reasoning, Planning, Validation, and Discovery.**

---

## Overview

**NEOCHEMS** is an autonomous multi-agent chemical intelligence platform designed to accelerate molecular discovery, retrosynthetic planning, and reaction feasibility validation. 

Combining specialized agent reasoning, domain ontologies, and interactive spatial visualization, NeoChems provides researchers with both a comprehensive public knowledge surface and an immersive interactive research laboratory.

---

## System Architecture

NeoChems operates across a synchronized workforce of seven specialized autonomous agents:

| Agent | Role | Domain Responsibility |
| :--- | :--- | :--- |
| **Orchestrator** | Dynamic Workflow DAG | Objective decomposition, subtask dispatch, cross-agent coordination, and iterative replanning. |
| **Research Agent** | Literature & Precedents | Querying literature citations (SciFinder, Reaxys, PubMed), extracting reaction precedents, and scoring confidence. |
| **Retrosynthesis** | Disconnection Pathways | Proposing multi-step disconnections, assessing precursor availability, and calculating cumulative step yields. |
| **Validation Agent** | Reaction Feasibility | Auditing thermodynamics, steric accessibility, chemoselectivity, and hazardous intermediate safety. |
| **Knowledge Agent** | Ontology & Memory | Maintaining persistent domain ontologies, reaction heuristics, molecular fingerprints, and chemical schemas. |
| **Analysis Agent** | Physicochemical Descriptors | Generating RDKit molecular descriptors, Lipinski rule-of-five profiles, and LogP / TPSA calculations. |
| **Critic Agent** | Adversarial QC & Directives | Rigorous audit of proposed pathways, flagging chemoselectivity conflicts, and issuing replan directives. |

---

## Product Worlds

### 1. Public Landing Page (`/`)
- Vintage paper & ink aesthetic (`#F4F1E6`, `#E0DCCF`, `#0F0F0F`, `#E57D25`)
- Editorial typography (`EB Garamond`, `Source Serif 4`, `Space Mono`)
- Interactive systems architecture breakdown, benchmark cards, and research showcases

### 2. NeoChems Lab (`/lab`)
- **Conversation & Direct Agent Channels**: Chat with the entire synchronized workforce or establish a direct 1-on-1 consultation channel with any individual specialist.
- **Agent Action Dossier ("What Did This Agent Do?")**: Inspect chronological task history, tools invoked, key observations, and output artifacts for each agent.
- **Cinematic 3D Aerial Office**: Studio-grade architectural pavilion rendering the workforce in real time with 5 camera presets (`Director`, `Orchestrator`, `Synthesis Bay`, `Critic QC`, `Floor Plan`).
- **Real-Time Agent Task Graph**: Interactive LangGraph DAG showing live communication edges and adversarial replan loops.
- **Chemistry Workspace**: 2D chemical structure rendering, RDKit physicochemical descriptors, and multi-step retrosynthetic reaction trees.

---

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, React 18, TypeScript)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with vintage paper & ink design system
- **3D Visualization**: [Three.js](https://threejs.org/) with soft shadow maps and cinematic lerp camera easing
- **State & Runtime**: Custom reactive simulation context with multi-agent communication event bus
- **Icons & Graphics**: Lucide React, inline mathematical & molecular SVG structures

---

## Getting Started

### Prerequisites
- Node.js 18.x or later
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/sashank321/neochems.git

# Navigate into the project
cd neochems

# Install dependencies
npm install

# Start the local development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) for the Landing Page or [http://localhost:3000/lab](http://localhost:3000/lab) for the NeoChems Lab.

---

## License

MIT License © 2026 NeoChems.
