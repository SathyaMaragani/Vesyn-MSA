<p align="center">
  <img src="docs/assets/banner.svg" alt="Vesyn — a multi-agent chemistry workbench" width="100%">
</p>

<p align="center">
  <img alt="Python 3.11" src="https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white&style=flat-square">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.141-009688?logo=fastapi&logoColor=white&style=flat-square">
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-1.2-1C3C3C?style=flat-square">
  <img alt="Next.js 14" src="https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white&style=flat-square">
  <img alt="three.js" src="https://img.shields.io/badge/three.js-0.185-000000?logo=threedotjs&logoColor=white&style=flat-square">
  <img alt="Postgres with the RDKit cartridge" src="https://img.shields.io/badge/Postgres-RDKit_cartridge-4169E1?logo=postgresql&logoColor=white&style=flat-square">
  <img alt="Hindsight agent memory" src="https://img.shields.io/badge/memory-Hindsight_0.10-D6A45B?style=flat-square">
  <img alt="276 backend and 185 frontend tests" src="https://img.shields.io/badge/tests-276_backend_·_185_frontend-2ea44f?style=flat-square">
</p>

<p align="center">
  <img src="docs/images/hero.jpg" alt="The Vesyn entry scene: an oversized molecule with the headline set inside it" width="96%">
</p>

<h2 align="center">Drug discovery agents that remember what they learned.</h2>

<p align="center">Seven agents plan and validate synthesis routes with real chemistry tools. <a href="https://github.com/vectorize-io/hindsight">Hindsight</a> keeps what<br>
each investigation learned — which routes it recommended, which transformations failed, and why —<br>
and the next investigation starts from it instead of from scratch.</p>

<p align="center"><sub>Every screenshot and number on this page comes from a real run, not a mock-up.</sub></p>

---

## <img src="docs/assets/icons/history.svg" height="20" align="top"> &nbsp;Why it remembers

Drug discovery is iterative: a team investigates a compound, rejects routes, finds out on scale-up which steps
fail, and then meets the same chemistry again on the next compound. A stateless research agent starts every
question from zero. Vesyn keeps the outcomes, and lets them change the next decision.

```mermaid
flowchart LR
    Q["Researcher asks"] --> R["Orchestrator<br/>recalls earlier findings"]
    R --> T["Agents investigate<br/>search · validate · critique"]
    T --> L["Critic applies lessons<br/>to routes that reuse a<br/>flagged transformation"]
    L --> D["Evaluator decides"]
    D --> K["Evaluator retains<br/>the outcome"]
    K -. "Hindsight memory bank" .-> R
```

**What it keeps.** The investigation and its outcome, the route it recommended, and every step that validation
flagged — keyed by the reaction template, so a lesson attaches to the *same transformation* wherever it recurs,
in this compound or the next. Knowledge no tool can produce, like a step that failed on scale-up, goes in the same
way.

**What it changes.** A recalled lesson marks every step that reuses the flagged transformation and costs that route
0.15 of its ranking score. It changes the order, and — when the lesson hits the leader — the recommendation.

### One memory apart

Same question, same routes, same tools — `find a synthesis route for gefitinib` — asked before and after the bank
learns that one transformation failed on scale-up:

| | Before | After |
|---|---|---|
| Recommended | the 3-step route that couples the aniline onto the quinazolinone · **0.79** | a 3-step route that avoids that coupling · **0.76** |
| The route that led before | — | ranked down to **0.64**: *"flagged in 1 earlier investigation(s) (simulated demo record): … at 120 g the isolated yield fell from 68% to 31% with bis-arylated impurity as the main by-product"* |
| Lessons | 4, all real — transformations ReactionT5 disputed while investigating **erlotinib**, a related EGFR inhibitor. They rank a candidate down, but not the leader | 5 — the same four, plus the lab report, which does hit the leader |

<table>
<tr>
<td width="50%">
  <img src="docs/images/memory-before.png" alt="Before the lab report: the coupling route recommended at 0.79, no simulated badge, and the memory card showing 21 recalled and 4 lessons, all from real ReactionT5 disagreements" width="100%">
  <p align="center"><b>Before</b> — 21 recalled, 4 lessons, all real. The coupling route leads at <b>0.79</b>.</p>
</td>
<td width="50%">
  <img src="docs/images/memory.png" alt="After the lab report: another route recommended; the coupling route marked as reusing a transformation flagged in an earlier investigation, labelled simulated; the memory card lists it and a sibling ranked down by the simulated lab record, and two more by a real ReactionT5 disagreement" width="100%">
  <p align="center"><b>After</b> — one memory later. The coupling route is <b>0.64</b>, marked <b>SIMULATED</b>, and a route that avoids it leads.</p>
</td>
</tr>
</table>

The routes, templates, scores and the erlotinib disagreements are real pipeline output. The scale-up failure is
invented for the demo — see below.

### Honest about what it remembers

- **Real and simulated are never mixed up.** Seeded history the pipeline could not have produced (a lab outcome, a
  chemist's preference) is tagged `demo-seed`. The critic writes "(simulated demo record)" wherever one changes a
  ranking, the dashboard marks it **SIMULATED**, and any LLM prose built on one gets a disclaimer appended in code —
  whatever the model wrote.
- **Not known is not none.** Mid-run the memory panel says what it is waiting for; an unreachable memory server is
  reported, and the run goes on without it rather than failing.
- **Old lessons are not new evidence.** A step flagged only by memory is not retained again, so a lesson cannot
  echo itself into a stronger one.

### How Hindsight is wired in

| | |
|---|---|
| **Recall** | the Orchestrator, before the team starts — `hindsight.recall` through the tool gateway, so it is policy-checked and audited |
| **Lessons** | the Critic reads the `outcome:flagged` + `rxn:<template_hash>` tags on recalled facts ([`memory.lessons`](backend/mas/memory.py)) |
| **Retain** | the Evaluator, after deciding — `hindsight.retain`, asynchronous, one item per outcome with a stable `document_id` |
| **Events** | `MEMORY_RECALLED` and `MEMORY_RETAINED` drive the dashboard's memory panel and timeline ([docs/EVENTS.md](docs/EVENTS.md)) |
| **Server** | self-hosted Hindsight 0.10.1 in `docker-compose.yml`; fact extraction on Groq's free tier or a local Ollama model |

```bash
python scripts/seed_memories.py --reset --phase before   # the bank without the lab report
# ask "find a synthesis route for gefitinib"              -> the coupling route is recommended
python scripts/seed_memories.py --phase after            # the lab report, ~20 s to store
# ask again                                              -> it is ranked down, another route leads
```

The seeder checks its own work: it scores the recorded routes against the whole bank and refuses to seed one whose
before and after would agree. The full walkthrough is in [docs/DEMO.md](docs/DEMO.md).

---

## <img src="docs/assets/icons/monitor.svg" height="20" align="top"> &nbsp;Watch it think

<table>
<tr>
<td width="50%">
  <img src="docs/images/overview.png" alt="The overview: gefitinib with its formula and measured properties, the Orchestrator above the six agents it coordinates, the validation agent's tasks and tools, and the pipeline" width="100%">
  <p><b>Overview — the team, and what each agent did.</b><br>
  <sub>Every state comes from the agents' own events; the replanner reads Skipped because nothing needed a second search.</sub></p>
</td>
<td width="50%">
  <img src="docs/images/lab.jpg" alt="The 3D research facility, one zone per agent, with a validation alert" width="100%">
  <p><b>The lab — one zone per agent.</b><br>
  <sub>Work lights up where it happens. The alert is real: route 3 needs review.</sub></p>
</td>
</tr>
<tr>
<td width="50%">
  <img src="docs/images/routes.png" alt="Route analysis: five ranked routes, the top route's tree, and each step's validation signals" width="100%">
  <p><b>Routes — ranked, with the reasons.</b><br>
  <sub>Template check, forward model, literature, stock. The score is a heuristic, and the UI says so.</sub></p>
</td>
<td width="50%">
  <img src="docs/images/audit.png" alt="The flight recorder: swimlanes per agent over time, and the full event log" width="100%">
  <p><b>Flight recorder — scrub the whole run.</b><br>
  <sub>153 events, 23 tool calls, one lane per agent. Drag back in time and the UI re-folds.</sub></p>
</td>
</tr>
</table>

---

## <img src="docs/assets/icons/nodes.svg" height="20" align="top"> &nbsp;How a run works

<p align="center">
  <img src="docs/assets/flow.svg" alt="Pipeline: orchestrator, then research and retrosynthesis in parallel, then validation, critic and evaluator, with a replanner loop back to the search" width="100%">
</p>

<p align="center">
  <img src="docs/assets/principles.svg" alt="Four principles: tools decide what is true, nothing is faked, everything is audited, degrade rather than fail" width="100%">
</p>

<p align="center">
  <img src="docs/assets/stack.svg" alt="The chemistry tools and the runtime Vesyn is built on" width="100%">
</p>

---

## <img src="docs/assets/icons/beaker.svg" height="20" align="top"> &nbsp;Ask it

```text
plan a synthesis of aspirin            →  routes to purchasable precursors, validated step by step
solubility of ibuprofen                →  predicted aqueous solubility, with an interval
drugs similar to caffeine              →  the nearest approved drugs from ChEMBL
descriptors for CC(=O)Oc1ccccc1C(=O)O  →  RDKit descriptors and drug-likeness
tell me about paracetamol              →  the full profile
```

Or draw the structure in the editor. The orchestrator works out the task and the molecule, and runs only the
agents that task needs. An unsupported ask fails honestly, listing what it can do, rather than guessing.

---

## <img src="docs/assets/icons/bolt.svg" height="20" align="top"> &nbsp;Run it

```bash
cp .env.example .env                                  # an LLM for Hindsight's fact extraction: Groq key or Ollama
docker compose up -d                                  # Postgres + RDKit cartridge on :5437, Hindsight on :8888
conda env create -f environment.yml && conda activate retrosynth
uvicorn backend.api.main:app --port 8436              # API + agents
npm install --prefix frontend && npm run dev --prefix frontend
python scripts/seed_memories.py --reset               # optional: the demo's memory bank (~7 min on Groq)
```

<samp>→ <a href="http://localhost:3100">localhost:3100</a></samp> &nbsp;·&nbsp; needs Docker, Python 3.11, Node 20 and ~6 GB of RAM &nbsp;·&nbsp; on Windows `.\start-vesyn.ps1` does all of it

<details>
<summary><b>First run — model data, the solubility model, the drug library</b></summary>

```bash
download_public_data data/external/aizynthfinder     # ~750 MB of AiZynthFinder models
python scripts/download_esol.py && python -m backend.qsar.train
python scripts/download_chembl.py && python scripts/ingest_molecules.py
```
</details>

<details>
<summary><b>Optional services — each degrades gracefully when absent</b></summary>

```bash
# ReactionT5 forward validation (:8435). One-off setup, Python 3.10 + CPU torch:
#   py -3.10 -m venv venv-t5 && venv-t5\Scripts\pip install -r backend/forward_model_service/requirements.txt
venv-t5\Scripts\python -m uvicorn --app-dir backend/forward_model_service main:app --port 8435

# LLM for the critic's notes and the report (default: a local Ollama model)
ollama pull qwen3:14b

# Literature evidence: ingest Open Reaction Database datasets (separate conda env)
conda activate ord-ingest && python scripts/ingest_ord.py --list
```

Without ReactionT5 a step is not forward-checked; without the index it reports "no verified evidence" instead of
inventing conditions; without an LLM (`VESYN_LLM=none`) the prose falls back to templates. The run still
finishes, and the critique says what was missing.
</details>

---

## <img src="docs/assets/icons/terminal.svg" height="20" align="top"> &nbsp;Drive it from code

```bash
curl -X POST localhost:8436/api/projects -H 'Content-Type: application/json' \
     -d '{"prompt": "plan a synthesis of aspirin"}'

curl localhost:8436/api/runs/<run id>             # ranked routes, critique, report
curl "localhost:8436/api/audit?run_id=<run id>"   # every tool call, with input and output
```

<details>
<summary><b>The rest of the surface</b> — REST, WebSocket, AG-UI</summary>

| Endpoint | What it does |
| --- | --- |
| `POST /api/projects` | `{prompt, smiles?}` (or `{target}`) → a project and a started run |
| `GET /api/runs/{id}` | status and the final package: ranked routes, critique, report |
| `GET /api/events?run_id=&after=` · `WS /ws/events` | persisted events; replay from a sequence number, then the live tail |
| `GET /api/audit?run_id=` · `GET /api/audit/{call_id}` | the provenance log; one call with its full input and output |
| `GET /api/agents` · `/api/tools` · `/api/graph` | live agent state, the tool registry, the agent graph |
| `POST /agui` | AG-UI `RunAgentInput` → an SSE stream, for any AG-UI client |
| `POST /api/retrosynthesis` · `POST /api/validation` | one governed tool call, no agents |

The chemistry endpoints (`/retrosynthesis/*`, `/search/*`, `/molecules/*`, `/predict/*`) are listed in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#api).
</details>

<details>
<summary><b>Configuration and ports</b></summary>

| Variable | Default | Notes |
| --- | --- | --- |
| `VESYN_DSN` | `postgresql://vesyn:vesyn@127.0.0.1:5437/vesyn` | Postgres connection |
| `VESYN_LLM` | `ollama:qwen3:14b` | or `anthropic:<model>`, `openai:<model>`, `none` |
| `VESYN_FORWARD_URL` | `http://localhost:8435/predict` | ReactionT5 service |
| `VESYN_EVIDENCE_PROVIDER` | `ord` | `null` turns the evidence index off |
| `VESYN_HINDSIGHT_URL` | `http://127.0.0.1:8888` | the memory server; `none` turns memory off |
| `VESYN_HINDSIGHT_BANK` | `vesyn-research` | the memory bank runs recall from and retain into |
| `VESYN_FORWARD_TIMEOUT` | `180` | seconds to wait for ReactionT5, which answers one step at a time |
| `HINDSIGHT_API_LLM_*` (in `.env`) | Ollama `qwen3:14b` | the LLM Hindsight extracts facts with — see [`.env.example`](.env.example) |
| `VESYN_CORS_ORIGINS` · `VESYN_CORS_ORIGIN_REGEX` | `*` | browser origins allowed to call the API |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8436` | the API base the browser calls |

**Ports:** `8436` API · `3100` web · `8435` ReactionT5 · `5437` Postgres · `8888` Hindsight (`9999` its UI) · `11434` Ollama — off the defaults on
purpose, so a sibling project can run beside it untouched.
</details>

<details>
<summary><b>Tests</b> — 276 backend, 185 frontend</summary>

```bash
conda activate retrosynth
pytest                       # 276 backend tests
pytest tests/test_mas.py     # 24 agent-layer tests, memory included; the end-to-end ones run the real team on aspirin

npm test --prefix frontend   # 185 tests: the event fold, the socket, the dashboard, checked against recorded runs
npm run typecheck --prefix frontend && npm run lint --prefix frontend
```

The agent layer's decisions — when to search again, how to judge a verdict, how to score a route — are pure
functions, and they are tested as such.
</details>

<details>
<summary><b>Deploy it for review</b> — Vercel + Tailscale Funnel, no payment card</summary>

The web app goes on Vercel; the backend stays on a laptop, published over HTTPS by Tailscale Funnel, which gives
a stable URL and passes WebSockets through.

1. Install [Tailscale](https://tailscale.com/download/windows) and sign in.
2. `.\start-vesyn.ps1` — starts everything, then the Funnel, and prints the public API URL.
3. On Vercel: import the repo, root directory `frontend`, `NEXT_PUBLIC_API_URL` = that URL.
4. Any other domain: `.\start-vesyn.ps1 -Origins "https://<your-app>.vercel.app"`.

While the backend is down the site still loads, and replays one recorded run labelled **SIMULATED** in a banner
and in the connection pill. Health, the services panel and the entry checks keep reporting the real state, and no
run can be started.
</details>

---

## <img src="docs/assets/icons/shield.svg" height="20" align="top"> &nbsp;What this is not

- **Not lab-validated.** No route here has been run at a bench. The ranking score is a heuristic over the signals
  available — explicitly not a feasibility or yield probability — and when the best route still needs review, the
  evaluator recommends nothing at all.
- **Not a black box.** Evidence keeps its level: direct precedent, similar precedent, AI-predicted, or none. A
  similar precedent is never dressed up as a direct one.
- **Not concurrent.** AiZynthFinder is one in-process instance behind a lock, and events fan out inside a single
  API process. Workers and a shared bus come first — see the decisions table in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Not authenticated.** Access is limited only by reachability and a browser-origin allow-list. The review
  deployment is for review; take the Funnel down afterwards.
- **Not a lab notebook.** The demo's memory bank mixes real pipeline outcomes with seeded history that is labelled
  simulated everywhere it appears. A real deployment would retain real lab results the same way — none are here.

<details>
<summary><b>Data, licences and provenance</b> — one of them has ShareAlike strings attached</summary>

| Component | Licence | Commercial use |
| --- | --- | --- |
| AiZynthFinder + USPTO templates | MIT / public-domain source | Yes |
| USPTO patent reactions (Lowe) | CC0 | Yes |
| **Open Reaction Database conditions** | **CC-BY-SA-4.0** | **ShareAlike — legal review before release** |
| ChEMBL drug library | CC-BY-SA-3.0 | Attribution; review |
| PubChem name resolution | Public domain | Yes |

Every dataset, where it came from, what its licence permits and how that was verified:
[docs/data-provenance.md](docs/data-provenance.md). Until the ShareAlike question is settled, treat the ORD index
as one research evidence provider among several, not a permanent foundation.
</details>

---

## <img src="docs/assets/icons/book.svg" height="20" align="top"> &nbsp;Go deeper

| Document | What is in it |
| --- | --- |
| [**Architecture**](docs/ARCHITECTURE.md) | Agents, the graph, the gateway, memory, the API, and what was deliberately left out |
| [**Demo**](docs/DEMO.md) | The three-minute walkthrough: before and after one memory, and the run that refuses to recommend |
| [**Events**](docs/EVENTS.md) | The contract every interface folds |
| [**Frontend**](docs/FRONTEND.md) · [**Handoff**](docs/FRONTEND-HANDOFF.md) | The interface, its rules, and how it is wired |
| [**Data provenance**](docs/data-provenance.md) | Datasets, licences, and the verification behind each |
| [**Evidence index**](docs/reaction-condition-intelligence.md) · [**Retrieval benchmark**](docs/retrieval-benchmark.md) | How conditions are retrieved, and whether "similar" is actually relevant |
| [**Product plan**](docs/product-plan.md) · [**Roadmap**](docs/ROADMAP.md) | Where this is going |
| [Retrosynthesis](backend/retrosynthesis/README.md) · [Molrepr](backend/molrepr/README.md) · [QSAR](backend/qsar/README.md) · [Frontend](frontend/README.md) | The services, module by module |

---

<p align="center"><b>Built by</b> Sathya Krishna Maragani · Shriyan Bohra</p>

<br>

<sub>The gefitinib run on this page is checked in at <a href="frontend/public/demo/run.json"><code>frontend/public/demo/run.json</code></a> — events, audit log, memory and final package — and is what the site replays, labelled SIMULATED, when the backend is offline.<br>
No licence has been chosen for this code yet, so default copyright applies. The datasets and models carry their own — see <a href="docs/data-provenance.md">data provenance</a>.</sub>
