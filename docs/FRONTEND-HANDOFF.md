# Vesyn Frontend Handoff

Written for the next developer picking up the frontend. It says what exists, how it is wired to the backend, how to run it, and what was and was not verified. The longer design notes (motion system, hero, lab, dashboard) are in [FRONTEND.md](FRONTEND.md); this file is the map.

## Frontend completed

A Next.js 14 (App Router) + React 18 + TypeScript + Tailwind frontend in `frontend/`, replacing the earlier single-page lab UI. Three.js is used directly (no React Three Fiber). It has four modes, each its own page, and all of them read the existing Vesyn API and event stream; nothing is mocked.

| Mode | Purpose |
| --- | --- |
| Entry (`/`) | The cinematic 3D molecular hero. |
| Overview (`/dashboard`) | 2D "what is happening right now" page. Embeds no 3D facility. |
| Facility (`/lab`) | The immersive 3D research facility. |
| Detail (`/lab/*`) | Five analytical views over the same run. |

The backend was **not** changed by this work.

## Routes

| Route | What it does |
| --- | --- |
| `/` | The molecular hero ("THE SCAFFOLD"): one oversized molecule with the headline placed inside the scene, depth of field, scroll journey. **ENTER VESYN** leads to `/dashboard`. |
| `/dashboard` | Scientific command dashboard: current research with a large molecule, the seven agents, the workflow including the replan branch, the live event feed, synthesis counts, a route preview, evidence, system health (with the backend's reasons and an INSPECT control), alerts, a 2D lab plan and quick actions. **ENTER LAB** wipes into `/lab`. Empty state: "NO ACTIVE RESEARCH RUN" with a start form. |
| `/lab` | The 3D facility. The layout owns the 3D world and HUD and persists across `/lab/*`; the route itself renders nothing. |
| `/lab/chemistry` | Molecular workspace: the target and route molecules drawn from the backend's SMILES. |
| `/lab/routes` | Synthesis routes and their analysis. |
| `/lab/evidence` | Evidence and provenance, keeping the backend's evidence level (direct / similar / AI-predicted / none). |
| `/lab/intelligence` | Situation brief and decision summaries built only from event payloads. |
| `/lab/audit` | Flight recorder: timeline scrubber, tool-call audit, and a Log view of every event. |

Journey: `/` -> `/dashboard` -> `/lab` -> `/lab/*`. The lab's tab bar has a Dashboard link back. The chosen project is kept in `sessionStorage` (`vesyn.project`) so the dashboard and the lab agree on the current run.

## Architecture

```
frontend/src/
  app/(app)/            routes: /, /dashboard, /lab, /lab/*   (shared layout: fonts, styles, MotionRoot)
  components/hero/      the entry: scene, loader, type-in-world, depth of field, scroll journey
  components/dashboard/ the dashboard (2D, one component per section)
  components/facility/  the 3D facility (zones, architecture, kit, camera, canvas)
  components/lab/       lab frame, top bar, agent rail/inspector, flight recorder, molecule panel
  components/{chemistry,routes,evidence,intelligence,audit}/   the /lab/* workspaces
  components/world/     small three.js helpers shared by the lab and dashboard (molecule mesh, stage hook)
  components/motion/    page-transition wipe, smooth scroll, cursor
  lib/api/              REST client (never throws: ok | offline | error)
  lib/ws/               WebSocket client with reconnect and resume
  lib/events/           the event fold and everything derived from it (pure, tested)
  lib/dashboard/        buildDashboard (pure model) and serviceStatuses
  lib/chem/             SMILES parser and 2D layout
  lib/store/            NeoProvider (data) and LabUI (lab UI state)
  types/                TypeScript types for the API, events, runs, routes, evidence
  styles/app.css        design tokens (nc-* colours, fonts) and shared keyframes
frontend/tests/         Node built-in test runner, pure logic only
```

Design rules that hold across the app: a value the backend did not return reads **NOT REPORTED**; an unreachable API reads **API OFFLINE**; nothing is simulated. The palette (graphite, warm ivory, mineral green, sage, oxidized copper, amber) lives in `styles/app.css`; `nc-cyan` is the historical token name and is actually sage.

## Backend integration

The API base is `NEXT_PUBLIC_API_URL` (default `http://localhost:8436`); the WebSocket base is derived from it (`lib/api/config.ts`).

**REST used** (all in `lib/api/`, plus the dashboard probes):

| Endpoint | Used for |
| --- | --- |
| `GET /health` | API state |
| `GET /api/projects`, `GET /api/projects/{id}`, `POST /api/projects` | project list, one project, starting a run |
| `GET /api/runs/{id}` | run record and the evaluator's final package (routes, critique, report) |
| `GET /api/events?run_id=&after=&limit=` | authoritative event reconcile |
| `GET /api/agents`, `GET /api/tools`, `GET /api/graph` | agent roster and snapshot, tool list, workflow graph |
| `GET /api/audit?run_id=`, `GET /api/audit/{call_id}` | tool-call audit |
| `GET /retrosynthesis/health` | AiZynthFinder state (dashboard health) |
| `GET /retrosynthesis/evidence/status` | evidence index state (dashboard health) |
| `GET /molecules/stats` | chemical library state (dashboard health) |

**Event stream:** `WS /ws/events?run_id=<id>&after=<seq>`. The server replays persisted events after `seq`, then tails live ones. The client reconnects and resumes slightly before the highest `seq` it saw, because `seq` is assigned at insert and concurrent agents can deliver out of order.

**Event-driven UI:** `lib/events/fold.ts` is the only place events become state. It is pure and idempotent, so duplicates and reordering converge to the same run view. The WebSocket is not trusted alone: the REST `/api/events` reconcile runs every 3 s during a run and once at the end. From the folded run come the agent views, the workflow stages, the feed, the alerts, the route and evidence figures. `lib/dashboard/model.ts` derives the whole dashboard from that fold, the evaluator's package and the service probes.

**Data facts worth knowing:**
- There is no `VALIDATION_FAILED` event. A failed validation is `VALIDATION_COMPLETED` with assessment `REVIEW_REQUIRED`, followed by `REPLAN_STARTED`.
- The validator routes to the replanner only when no route is usable, and only up to 3 attempts.
- The backend reports no progress percentage. The dashboard shows "workflow stages that have reported completion" and says so.
- Route trees exist only in the evaluator's final package, so the 3D route tree appears when the run finishes.

## Important frontend files

| File | Purpose |
| --- | --- |
| `src/lib/store/NeoProvider.tsx` | The data layer: health, socket, projects, current run (fold of events), agents, `launch`, `selectProject`; `useRunResult` returns the final package. Each of `/dashboard` and `/lab` mounts its own provider. |
| `src/lib/events/fold.ts` | Events to run state. |
| `src/lib/events/agentViews.ts`, `describe.ts`, `activity.ts` | Agent status, human-readable event text, workflow order. |
| `src/lib/api/http.ts` | `request()`: never throws; returns ok / offline / error with the backend's message. |
| `src/lib/ws/eventSocket.ts` | WebSocket client. |
| `src/lib/dashboard/model.ts` | `buildDashboard`: pure model behind every dashboard section. |
| `src/lib/dashboard/services.ts` | Maps endpoint answers to service rows (AiZynthFinder offline shows the backend's reason). |
| `src/components/dashboard/Dashboard.tsx`, `DashboardFrame.tsx` | Dashboard layout; header, navigation and the ENTER LAB transition. |
| `src/components/facility/FacilityCanvas.tsx`, `facilityWorld.ts`, `layout.ts`, `zone*.ts` | The 3D facility: scene, layout of the departments, and each department's build. |
| `src/components/facility/facilityState.ts` | Agent and run state mapped to what the facility shows. |
| `src/components/lab/LabFrame.tsx`, `LabTopBar.tsx`, `FlightRecorder.tsx` | Lab HUD, tab bar (includes Dashboard), recorder. |
| `src/components/hero/Hero.tsx`, `ScaffoldScene.tsx`, `heroWorld.ts` | The entry page. |
| `src/styles/app.css`, `tailwind.config.ts` | Tokens and shared animation. |
| `tests/*.test.ts` | Unit tests for the fold, socket, dashboard model, facility layout, hero and more. |

## How to run

Backend (from the repository root; see the README for full setup: Postgres on 5434, `conda activate retrosynth`, `pip install langgraph`):

```bash
uvicorn backend.api.main:app --port 8436
```

Frontend (`frontend/`):

```bash
npm install
npm run dev          # http://localhost:3100
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm test             # node --test tests/**/*.test.ts
npm run build        # production build
```

Copy `frontend/.env.example` to `frontend/.env.local` only if the API is not at `http://localhost:8436` (set `NEXT_PUBLIC_API_URL`).

Do not run `npm run build` while `npm run dev` is running in the same folder: the two share `.next` and the dev server ends up serving unstyled pages. Stop dev first, build, then move `.next` aside before restarting dev.

## Validation performed

Run at handoff on Windows 11, Node with the repo's existing `node_modules`:

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm test` | 166 tests, 166 pass, 0 fail |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run build` | passes; `/`, `/dashboard`, `/lab` and all five `/lab/*` routes are prerendered |
| HTTP | all eight routes (`/`, `/dashboard`, `/lab`, `/lab/chemistry`, `/lab/routes`, `/lab/evidence`, `/lab/intelligence`, `/lab/audit`) return 200 on the dev server |
| Browser journey | headed Edge at 1440x900: `/` -> ENTER VESYN -> `/dashboard` -> ENTER LAB -> `/lab` -> each of the five tabs -> Dashboard; every hop landed on the right path, a canvas was present, and there were no uncaught page errors |

During development (not re-run at handoff) the dashboard was also checked live against the backend through a real run (progress 33% -> 50% -> 100%, current agent moving between departments), and in the no-run and API-offline states using intercepted requests.

**Not verified:**
- Layouts other than 1440x900 (the target range is 1440x900 to 2560x1440).
- The replan branch and the failed-run view on screen in a run that actually replans; they are covered only by the model unit tests and a scripted event sequence.
- The Docker image build and `npm start` (the standalone server).
- Anything on a phone or tablet: the app is laptop/desktop only by design.
- 3D performance on machines other than the dev laptop (Intel HD 530: about 29-36 fps; the render scale adapts down on weak GPUs).

## Known issues

These are backend or environment state, shown honestly by the UI rather than hidden. The frontend was not changed to work around them.

- **QSAR solubility model missing.** `models/qsar/solubility/baseline.pkl` does not exist (needs `scripts/download_esol.py` then `python -m backend.qsar.train`).
- **`GET /molecules/stats` returns 500** (observed at handoff). The dashboard shows the chemical library as UNAVAILABLE.
- **`chembl.similarity` fails** in runs with "relation molecules does not exist"; it appears as a failed-tool alert and in the evidence numbers.
- **Evidence index not configured** (`/retrosynthesis/evidence/status` reports `available: false`); the dashboard shows NOT CONFIGURED.
- **AiZynthFinder** was unloaded earlier in development and reported as OFFLINE with the backend's reason ("AiZynthFinder is not loaded"). Its data is now downloaded locally and `/retrosynthesis/health` reported `model_loaded: true` at handoff. `data/external/` is gitignored, so each machine has to download it (`download_public_data data/external/aizynthfinder`).
- **LLM prose.** The critic and report use `VESYN_LLM` (default local Ollama). Runs during development used `VESYN_LLM=none`.
- **Unused earlier code.** `components/airlock/` and `components/ui/airlock-spaceship-hero.tsx` (with their tests) are an earlier entry sequence that no route imports. Safe to remove if nobody wants them.
- **Structures are layouts, not conformers.** The backend returns SMILES only; the drawings ignore stereochemistry.
- **No cancel.** The backend has no cancel endpoint, so the UI has none.
- **Ports.** UI on 3100 (3000 is in a Windows excluded range on the dev machine); API on 8436.

## Handoff instructions

1. Pull the branch: `git pull origin main` (or `git fetch origin` then check out the branch this was pushed to).
2. Install: `cd frontend && npm install`.
3. Start the backend: Postgres, then `uvicorn backend.api.main:app --port 8436` (see the README for the environment and optional services).
4. Start the frontend: `npm run dev` in `frontend/`.
5. Verify: open `/`, click ENTER VESYN, then ENTER LAB, and step through the five lab tabs; start a run from the dashboard and watch the workflow and feed update. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.
6. Continue from the pushed commit. Good next steps: check the dashboard at 1600, 1920 and 2560 widths; exercise a run that replans and a run that fails; fix the backend items above, after which the corresponding health rows should turn green with no frontend change.
