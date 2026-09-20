# Frontend — what it is, and how it got here

_Last updated: 2026-09-20._

The frontend is the Next.js 14 app the user supplied
(`frontend/assets/neochems-main`), moved to `frontend/` and stripped of an
unrelated product (AllocFlow) and of the simulated lab it shipped with.

⚠️ **It is not yet wired to the backend.** The shell renders and the build is
clean, but no component fetches anything; `sendMessage` in
`src/lib/runtime/RuntimeContext.tsx` is an honest placeholder. Connecting it is
the next piece of work — see **[FRONTEND-HANDOFF.md](FRONTEND-HANDOFF.md)**,
which is the doc to read first.

## Routes

| Path   | What                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| `/`    | Landing page — beige/CRT design; "Enter Lab" → `/lab`                                      |
| `/lab` | The lab: Conversation, Aerial Office (three.js), Agent Graph, Chemistry Workspace          |

Dev: `npm run dev --prefix frontend` → <http://localhost:3100>.
Port 3100, not 3000: **3000 is in a Windows excluded port range on this machine**
and cannot be bound. The backend CORS allow-list names `http://localhost:3100`
(`backend/api/main.py`), so the two must move together.

## What was removed from the supplied app

It shipped with a second, unrelated product (AllocFlow: conference/manuscript/
reviewer matching) and a fully simulated lab:

- `src/app/dashboard/**`, `src/app/login`, `src/app/api/v1/**` (a 1283-line
  in-memory mock API), `src/components/matching`, `src/components/graph`,
  `src/lib/api.ts` (axios + JWT for AllocFlow), `src/lib/auth.tsx`, `src/types`.
- Dependencies that only those pages used: `axios`, `@tanstack/react-query`,
  `recharts`, plus `puppeteer` and `html-to-jsx` (build-weight, unused).
- `FRONTEND_MASTER_DOC.md` (the BrowserOS design bible this template came from),
  `vercel.json`, unreferenced `public/browseros.css`, `public/script.js`,
  `src/browseros.css`.
- Next was upgraded 14.2.5 → 14.2.33: the pinned version carries a published
  security advisory.

## The important change: the lab is no longer simulated

`RuntimeContext` previously ran a scripted demo — `setTimeout` chains, invented
DOIs (`10.1002/cber.18780110158`), invented yields ("88–94%"), invented
confidence ("98.2%"), and per-agent chat replies written as fiction. Presenting
fabricated references and numbers as findings is the one thing a scientific tool
must never do, so all of it was replaced by real backend data:

```
src/lib/backend/client.ts   typed REST + WebSocket client (NEXT_PUBLIC_API_URL, default :8436)
src/lib/backend/fold.ts     folds the event stream into agent / task / run state
src/lib/backend/result.ts   maps a finished run into the lab's view models
src/lib/runtime/RuntimeContext.tsx   single source of truth for every lab view
```

- Sending a molecule in the chat calls `POST /api/projects` — it launches the
  agent team for real.
- The lab opens `WS /ws/events?run_id=…` and folds every event: which agent is
  working, its current tool, the task queue, progress, the execution trace, and
  agent-to-agent messages.
- Agent profiles show the **real** tool registry (`GET /api/tools`), real
  execution history (from `TOOL_COMPLETED`/`TOOL_FAILED`) and real messages.
- The Chemistry Workspace renders the finished run's evidence package: ranked
  routes, per-step RDKit / ReactionT5 / literature verdicts, real ORD/USPTO
  citations, and real descriptors.
- Where the backend has no value, the UI says `not reported` (yields, reagents,
  conditions nobody recorded) instead of filling in a plausible number.
- With the API down the header shows **API OFFLINE** and the chat says so.
- `cancelRun` detaches the view and says the agents keep running server-side;
  there is no backend cancel endpoint, so it does not pretend to stop them.

## Agent roles

The template's roles were `KNOWLEDGE` and `ANALYSIS`, which do not exist in this
backend. They were renamed to the real agents — `REPLANNER` and `EVALUATOR` —
across `types.ts`, `initialData.ts` and the graph view. `initialData.ts` is now
presentation only (symbol, colours, desk position in the 3D office); everything
that can change is filled in from the backend.

`AgentGraphView` now draws the real LangGraph wiring from `backend/mas/graph.py`:
planner fans out to research and retro, both join at the validator, which either
passes to the critic or sends the replanner back round to retro.

## Polish pass

- All emoji chrome replaced with `lucide-react` icons (header tabs, sidebar
  buttons, modal, office overlays). The per-agent symbols (⚡🔬🧪…) stay: they
  are agent identity, part of the design.
- Live API status pill in the lab header.
- Landing: removed four placeholder `https://github.com` links, fixed a nav item
  labelled "System" that pointed at `#features` (now "Features") and a duplicated
  `target`/`rel` attribute pair.
- Root layout is a proper server component with Next `metadata`/`viewport`
  (title, description, icons, Open Graph) instead of a client component with a
  hand-written `<head>`.
- Prettier added (`.prettierrc.json`, `npm run format`) and the source formatted;
  `npm run typecheck` added.
- `next.config.js` lost the AllocFlow API rewrite; `Dockerfile` now defaults
  `NEXT_PUBLIC_API_URL` to the NeoChems API.

## Verified

`npm run typecheck` is clean. `npm run format` formats all files cleanly. The landing page
is a 100% native React App Router page with interactive CRT 3D computer, typing terminal
animation, live canvas bento grid, 7-agent showcase, architecture map, and FAQ accordion.
The lab loads the 7-agent roster; sending a molecule runs the team end-to-end; the Chemistry
Workspace shows real routes, descriptors, and USPTO/ORD citations. The aerial 3D office and
agent graph render. Reopening past runs from the Projects modal replays the full event history
and evidence package into the workspace. Targeted agent chat consults each agent within its
specialized scientific domain.

## Resolved gaps (2026-09-20)

- **Landing page rebuilt as React components**: The raw HTML file (`src/app/allocflow_hydrated_body.html`),
  prebuilt Astro bundles, and third-party tracking scripts were removed. The landing page is now
  composed of clean, modular React components (`src/components/landing/`: `LandingHeader`, `LandingHero`,
  `LandingFeatures`, `LandingAgents`, `LandingArchitecture`, `LandingFaq`, `LandingFooter`).
- **Per-agent chat endpoint added**: `POST /api/agents/{agent_id}/chat` serves domain-specific
  consultations for the 7 agents. In the lab, selecting an agent allows chemists to interrogate
  its methodology and validation criteria directly.
- **UI components audited & trimmed**: Unused template components (`Card3D`, `GlassSurface`, `PixelSnow`,
  `Tooltip`) were audited and deleted, eliminating dead weight and React Hook warnings.
- **Projects view implemented**: A Projects & Run History modal (`src/components/lab/ProjectsModal.tsx`)
  was added to the Lab header, allowing chemists to search past campaigns, inspect runs, and reload
  historical runs with interactive replay.
