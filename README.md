<h1 align="center">Vesyn</h1>

<p align="center">
  <strong>Ask a chemistry question in plain words. A team of agents answers it with real tools, and shows its work.</strong>
</p>

<p align="center">
  <img alt="Python 3.11" src="https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.141-009688?logo=fastapi&logoColor=white">
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-1.2-1C3C3C">
  <img alt="Next.js 14" src="https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white">
  <img alt="Postgres with the RDKit cartridge" src="https://img.shields.io/badge/Postgres-RDKit%20cartridge-4169E1?logo=postgresql&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-272%20backend%20%C2%B7%20170%20frontend-2ea44f">
</p>

Type *"plan a synthesis of aspirin"*, *"solubility of ibuprofen"* or *"drugs similar to caffeine"* — or draw the
structure. An orchestrator works out the task and the molecule, and runs only the agents that task needs.
Specialist agents call real chemistry tools: AiZynthFinder for retrosynthesis, RDKit for structure and template
checks, a ReactionT5 forward model, a literature index built from the Open Reaction Database and USPTO patents,
a QSAR solubility model, ChEMBL and PubChem. A validator checks every step, a critic and an evaluator rank what
survived and write the report.

Every tool call is policy-checked, recorded and streamed as an event, so the interface can show a run as it
happens — and replay it afterwards, exactly as it ran.

<p align="center">
  <img alt="The Vesyn dashboard: current run, agent workflow and live event feed" src="docs/images/dashboard.png" width="900">
</p>

## What makes it different from a chatbot

- **Agents decide what to do; tools decide what is true.** No agent judges chemical validity — RDKit, the
  forward model and the literature index do. The LLM only writes prose (the critic's notes and the report), and
  a run is fully functional with no LLM at all (`VESYN_LLM=none`).
- **Nothing is faked in the interface.** Every panel is a pure fold of the event stream. A value the backend did
  not return reads *NOT REPORTED*; an unreachable API reads *API OFFLINE*.
- **Every scientific action has provenance.** `mas.tool_calls` records who called what, which tool version, why,
  the full input and output, timing and status — written *before* execution, so even a crash leaves a record.
- **Degrade, don't fail.** A missing forward model, evidence index or LLM downgrades the affected signal and says
  so in the critique. Only a failure of the core search, or an unresolvable target, fails a run.

## What you can ask

| Task | Example prompt | What comes back |
| --- | --- | --- |
| Retrosynthesis | "plan a synthesis of aspirin" | Ranked routes, validated step by step, with a recommendation or an honest refusal |
| Solubility | "solubility of ibuprofen" | Predicted aqueous solubility with an interval and an applicability flag |
| Properties | "descriptors for CC(=O)Oc1ccccc1C(=O)O" | RDKit descriptors and drug-likeness |
| Analogues | "drugs similar to caffeine" | Nearest approved drugs from ChEMBL, by fingerprint similarity |
| Profile | "tell me about paracetamol" | Descriptors, predicted solubility and nearest approved drugs |

A prompt that names no supported task fails honestly, listing what Vesyn can do, instead of guessing.

## How a run works

```mermaid
flowchart LR
    U(["Prompt and/or structure"]) --> P["Orchestrator<br/>resolve target, plan tasks"]
    P --> R["Research<br/>descriptors, solubility, analogues"]
    P --> T["Retrosynthesis<br/>AiZynthFinder search"]
    R --> V["Validation<br/>RDKit · ReactionT5 · literature"]
    T --> V
    V -- "a route is usable" --> C["Critic<br/>severity-ranked issues"]
    V -- "none usable, up to 3x" --> RP["Replanner<br/>widen the budget"]
    RP --> T
    C --> E["Evaluator<br/>score, rank, report"]
    E --> O(["Ranked routes · critique · report"])
```

Research and retrosynthesis run in parallel. Validation checks each step by reversing the template in RDKit,
predicting the forward reaction with ReactionT5, and looking for literature precedent; the verdict passes when at
least one solved route has no step flagged for review. A failed verdict sends the run back to the replanner, which
widens the search (100 → 250 → 500 iterations) up to three times.

Every tool call passes through one gateway: **policy → audit → run → audit → event**. A call is refused, and
audited as refused, when the tool is unknown, the agent is not on its allow-list, or the input breaks the tool's
policy. Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Event contract: [docs/EVENTS.md](docs/EVENTS.md).

## Quickstart

**You need:** Docker, Python 3.11 (conda), Node 20, and about 6 GB of free RAM — the API holds the AiZynthFinder
model and its purchasable-compound stock in memory.

```bash
# 1. Database: Postgres with the RDKit cartridge, on 127.0.0.1:5437
docker compose up -d

# 2. Python environment
conda env create -f environment.yml && conda activate retrosynth

# 3. First run only: model data (~750 MB), the solubility model, the drug library
download_public_data data/external/aizynthfinder
python scripts/download_esol.py && python -m backend.qsar.train
python scripts/download_chembl.py && python scripts/ingest_molecules.py

# 4. API and agents (creates its own mas.* schema)
uvicorn backend.api.main:app --port 8436

# 5. Web app, in another terminal
npm install --prefix frontend && npm run dev --prefix frontend
```

Then open <http://localhost:3100>. The API reports retrosynthesis as not ready until the model has loaded, which
takes tens of seconds on the first start.

Three additions are optional, and each degrades gracefully when absent:

```bash
# ReactionT5 forward validation (:8435). One-off setup, Python 3.10 + CPU torch:
#   py -3.10 -m venv venv-t5 && venv-t5\Scripts\pip install -r backend/forward_model_service/requirements.txt
venv-t5\Scripts\python -m uvicorn --app-dir backend/forward_model_service main:app --port 8435

# LLM for the critic's notes and the report; the default is a local Ollama model
ollama pull qwen3:14b

# Literature evidence: ingest Open Reaction Database datasets into the index
# (separate conda env; see docs/reaction-condition-intelligence.md)
conda activate ord-ingest
python scripts/ingest_ord.py --list
python scripts/ingest_ord.py --dataset <id>
```

Without the evidence index, validation reports "no verified evidence" for a step rather than inventing
conditions for it.

On Windows, `.\start-vesyn.ps1` starts all of it in order (database → Ollama → ReactionT5 → API), leaves anything
already running alone, and writes logs to `logs/`. `.\stop-vesyn.ps1` stops it and keeps the data.

Two things to know before changing versions. The conda environments are deliberately separate — `retrosynth`
serves the API, `qsar-chemprop` trains, `ord-ingest` ingests ORD — because their pins contradict each other; see
[backend/qsar/README.md](backend/qsar/README.md). And the Postgres image tag is coupled to the Python `rdkit` pin:
both ship RDKit 2023.09 so that Python and the database cannot disagree about canonicalisation. Move them
together, as the comment in [docker-compose.yml](docker-compose.yml) says.

## Without the web app

```bash
curl -X POST localhost:8436/api/projects -H 'Content-Type: application/json' \
     -d '{"prompt": "plan a synthesis of paracetamol"}'

curl -X POST localhost:8436/api/projects -H 'Content-Type: application/json' \
     -d '{"prompt": "solubility of this", "smiles": "CCO"}'

curl localhost:8436/api/runs/<run id>     # status, ranked routes, critique, report
```

| Endpoint | What it does |
| --- | --- |
| `POST /api/projects` | `{prompt, smiles?}` (or `{target}`) → a project and a started run |
| `GET /api/runs/{id}` | status and the final package: ranked routes, critique, report |
| `GET /api/events?run_id=&after=` · `WS /ws/events` | persisted events; replay from a sequence number, then the live tail |
| `GET /api/audit?run_id=` · `GET /api/audit/{call_id}` | the provenance log, and one call with its full input and output |
| `GET /api/agents` · `/api/tools` · `/api/graph` | live agent state, the tool registry, the agent graph |
| `POST /agui` | AG-UI `RunAgentInput` → an SSE stream, for any AG-UI client |
| `POST /api/retrosynthesis` · `POST /api/validation` | one governed tool call, no agents |

The full list, including the chemistry endpoints (`/retrosynthesis/*`, `/search/*`, `/molecules/*`, `/predict/*`),
is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#api).

## What a run produces

`{"prompt": "plan a synthesis of aspirin"}` on a laptop, with the local LLM: about a minute, 153 events and 23
audited tool calls, ending in five ranked routes. The top route (score 0.9996) is one step — acetic anhydride and
salicylic acid, both in stock — where the RDKit template check and the forward model agree and the literature
index finds experimental precedent. The verdict: *3 of 5 routes have no step flagged by validation*.

That exact run is checked into the repo at [`frontend/public/demo/run.json`](frontend/public/demo/run.json), so
you can read its events, audit log and final package without running anything.

## The web app

Next.js 14, React 18, TypeScript, Tailwind and three.js, in [`frontend/`](frontend/README.md).

| Route | What it shows |
| --- | --- |
| `/` | The entry: one molecule, rendered in 3D |
| `/dashboard` | The current run: target, agents, workflow, live event feed, routes, evidence, service health |
| `/lab` | The 3D research facility, one zone per agent |
| `/lab/{chemistry,routes,evidence,intelligence,audit}` | Workspaces over the same run, including the flight recorder |

The whole interface is derived from the event stream, so the timeline scrubber replays a run by re-folding the
events it actually emitted. When the API has not answered since the page loaded, the app shows one recorded run
from `public/demo/run.json`, labelled **SIMULATED** in a banner and in the connection pill; API health, the
services panel and the entry checks keep reporting the real state, and no run can be started.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `VESYN_DSN` | `postgresql://vesyn:vesyn@127.0.0.1:5437/vesyn` | Postgres connection |
| `VESYN_LLM` | `ollama:qwen3:14b` | or `anthropic:<model>`, `openai:<model>`, or `none` |
| `VESYN_FORWARD_URL` | `http://localhost:8435/predict` | ReactionT5 service |
| `VESYN_EVIDENCE_PROVIDER` | `ord` | `null` turns the evidence index off |
| `VESYN_CORS_ORIGINS` | `*` | comma-separated browser origins |
| `VESYN_CORS_ORIGIN_REGEX` | — | regex for further origins |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8436` | the API base the browser calls |

**Ports:** 8436 API · 3100 web app · 8435 ReactionT5 · 5437 Postgres · 11434 Ollama. They avoid the defaults on
purpose, so a sibling project can run beside Vesyn untouched.

## Repository layout

```
backend/
  api/        FastAPI app: chemistry endpoints, the agent routes, the WebSocket
  mas/        the agent layer: graph, agents, tools, gateway, events, store, intent, LLM
  retrosynthesis/  molrepr/  qsar/  conditions/    the chemistry services
  forward_model_service/                           ReactionT5, its own process and venv
frontend/     Next.js app: entry, dashboard, 3D lab and its workspaces
scripts/      data download, ingestion and benchmarks
db/           the schema SQL Postgres runs on first start
docs/         architecture, events, frontend, data provenance, benchmarks, plans
tests/        backend tests
```

## Tests

```bash
conda activate retrosynth
pytest                       # 272 backend tests
pytest tests/test_mas.py     # 21 agent-layer tests; the end-to-end ones run the real team on aspirin

npm test --prefix frontend       # 170 tests: the event fold, the socket, the dashboard model
npm run typecheck --prefix frontend && npm run lint --prefix frontend
```

The agent layer's decision functions — when to search again, how to judge a verdict, how to score a route — are
pure functions, and they are unit-tested as such.

## Deploying for review

The review setup is free and needs no payment card: the web app on Vercel, the backend on a laptop, published
over HTTPS by Tailscale Funnel, which gives a stable URL and passes WebSockets through.

1. Install [Tailscale](https://tailscale.com/download/windows) and sign in.
2. `.\start-vesyn.ps1` — starts everything, then the Funnel, and prints the public API URL.
3. On Vercel: import the repository, set the root directory to `frontend`, set `NEXT_PUBLIC_API_URL` to that URL.
4. The API accepts browser calls from `http://localhost:3100` and a Vercel project named `vesyn*`. For any other
   domain: `.\start-vesyn.ps1 -Origins "https://<your-app>.vercel.app"`.

A first connection through the Funnel takes a few seconds, so the client waits patiently before it will call the
API offline. While the backend is down, the site still loads and shows the labelled recording.

## Data, licences and provenance

Every dataset, where it came from, what its licence permits, and how that was verified:
[docs/data-provenance.md](docs/data-provenance.md).

| Component | Licence | Commercial use |
| --- | --- | --- |
| AiZynthFinder + USPTO templates | MIT / public-domain source | Yes |
| USPTO patent reactions (Lowe) | CC0 | Yes |
| **Open Reaction Database conditions** | **CC-BY-SA-4.0** | **ShareAlike — needs legal review before release** |
| ChEMBL drug library | CC-BY-SA-3.0 | Attribution; review |
| PubChem name resolution | Public domain | Yes |

Until the ShareAlike question is settled, treat the ORD index as a research evidence provider, one of several,
rather than a permanent foundation.

## Status and limits

- **A research instrument, not a validated one.** No route here has been run in a lab. The ranking score is a
  heuristic over the signals available, explicitly *not* a feasibility or yield probability, and when the best
  route still needs review the evaluator recommends nothing.
- **Evidence keeps its level.** Direct precedent, similar precedent, AI-predicted and no verified evidence stay
  distinguishable everywhere; a similar precedent is never presented as a direct one.
- **One run at a time.** AiZynthFinder is a single in-process instance behind a lock, and events fan out inside
  one API process. Concurrency needs workers and a shared bus first — see the decisions table in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **No authentication.** Access is limited only by where the API is reachable and by the browser-origin
  allow-list. The review deployment is for that purpose alone; take the Funnel down afterwards.
- **The helper scripts are PowerShell**, so the one-command start is Windows-only; the stack itself is not.

## Documentation

| Document | What is in it |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Agents, the graph, the gateway, the API, and what was deliberately left out |
| [docs/EVENTS.md](docs/EVENTS.md) | The event contract every interface folds |
| [docs/FRONTEND.md](docs/FRONTEND.md) · [docs/FRONTEND-HANDOFF.md](docs/FRONTEND-HANDOFF.md) | The interface, its rules, and how it is wired |
| [docs/data-provenance.md](docs/data-provenance.md) | Datasets, licences and the verification behind each |
| [docs/reaction-condition-intelligence.md](docs/reaction-condition-intelligence.md) | The evidence index: how conditions are retrieved |
| [docs/retrieval-benchmark.md](docs/retrieval-benchmark.md) | Whether "similar" is actually relevant, measured |
| [docs/product-plan.md](docs/product-plan.md) · [docs/ROADMAP.md](docs/ROADMAP.md) | Where this is going |
| [backend/retrosynthesis](backend/retrosynthesis/README.md) · [backend/molrepr](backend/molrepr/README.md) · [backend/qsar](backend/qsar/README.md) | The chemistry services |

## Licence

No licence has been chosen yet, so default copyright applies to this code. The datasets and models it uses carry
their own licences — see [docs/data-provenance.md](docs/data-provenance.md).
