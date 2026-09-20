# Frontend handoff

You are building the NeoChems lab UI. The backend is finished and tested; the
UI shell exists but **is not connected to it**. This doc is what you need to
close that gap.

---

## What NeoChems does

You give it a molecule — a SMILES string or a name like `paracetamol` — and a
team of seven agents plans a synthesis route for it, validates every step
against real chemistry tools and published literature, critiques the routes, and
ranks them. Or refuses to recommend any, which is a legitimate outcome.

Your job is to make that process watchable, and to make every number on screen
traceable back to the tool call that produced it.

---

## Get it running

You need three things up. Takes about ten minutes the first time.

**1. Postgres** — shared with the sibling RamChems project, so the container may
already exist:

```bash
docker start ramchems_db        # if it exists
docker compose up -d            # only if it does not
```

**2. Backend** (Python 3.11, conda env `retrosynth` — see the [README](../README.md)):

```bash
conda activate retrosynth
uvicorn backend.api.main:app --port 8436
```

Takes ~8 s to start; it loads the retrosynthesis model once at startup.
`GET /health` returns `{"status":"ok"}` when it is up.

**3. Frontend:**

```bash
npm install --prefix frontend
npm run dev --prefix frontend   # http://localhost:3100
```

⚠️ **Port 3100, not 3000.** On the machine this was built on, 3000 is inside a
Windows excluded port range and cannot be bound. The backend's CORS allow-list
names 3100 — if you move one, move both.

No auth, no login. Two routes: `/` (landing) and `/lab` (your work).

Check the backend independently of the UI:

```bash
curl -X POST localhost:8436/api/projects -H 'Content-Type: application/json' \
     -d '{"target": "aspirin"}'
curl localhost:8436/api/runs/<run id>
```

Aspirin is the reliable demo target — it solves in about 3 seconds.

---

## What state the UI is in

The app was supplied with a second, unrelated product inside it (AllocFlow —
conference paper matching) and a **fully simulated lab** that faked entire runs
with `setTimeout`, including invented DOIs, yields and confidence scores. All of
that has been deleted. What is left is real shell, honest placeholders, and no
data.

**Kept and working** — `src/components/lab/`:

| File | What it is |
| --- | --- |
| `LabShell.tsx` | Layout and view switching |
| `AerialAgentOffice.tsx` | The three.js office; each agent is a desk |
| `AgentGraphView.tsx` | The agent graph — now matches the real backend topology |
| `LabChat.tsx` | Chat transcript and input |
| `TaskQueueSidebar.tsx` | Task list |
| `AgentProfileModal.tsx` | Per-agent detail panel |
| `ChemistryWorkspace.tsx` | **Placeholder.** Renders an empty state. |

`src/lib/runtime/initialData.ts` is **presentation only** — symbol, colour, desk
position and a static description per agent. Anything that changes during a run
belongs to the event stream.

---

## The one thing to build

Everything flows from one place: `sendMessage` in
`src/lib/runtime/RuntimeContext.tsx`. It currently posts an honest "not wired
yet" message. Replace it with:

```
POST /api/projects {target}         -> {project, run}
WS   /ws/events?run_id=&after=0     -> replay, then live tail
GET  /api/runs/{id}                 -> the final result package
```

**Build it as a fold.** One pure reducer, `fold(state, event) -> state`, is the
only place backend events become UI state. Everything the lab renders is derived
from that state.

```
  events (sorted by seq) ──► fold ──► RuntimeState
                                        │
              ┌──────────────┬──────────┴───┬──────────────┐
           Office          Graph          Chat         Chemistry
```

Why a fold, specifically:

- **Reconnect is free.** Socket drops, you reconnect with the last `seq` you
  saw, state converges. Nothing lost, nothing duplicated.
- **Replay is free.** `?after=0` replays a finished run from the database. A
  recorded real run can drive the UI identically to a live one — which is how
  demos stay safe without faking anything.
- **Fabrication becomes structurally impossible**, which is the point.

The full event contract — every type and its `data` payload — is
[docs/EVENTS.md](EVENTS.md). Read it before you start; it is 74 lines and it is
the whole interface.

Two things it is worth repeating here:

- **Sort by `seq`.** Concurrent agents can deliver slightly out of order.
- **Full outputs never ride on events.** Events carry summaries. Fetch detail
  from `/api/audit/{call_id}` or `/api/runs/{id}`.

### Agent ids

The backend's node ids map to the UI roles like this. They are already correct
in `initialData.ts`; do not invent new ones.

| Backend `agent_id` | UI `AgentRole` |
| --- | --- |
| `planner` | `ORCHESTRATOR` |
| `research` | `RESEARCH` |
| `retro` | `RETROSYNTHESIS` |
| `validator` | `VALIDATION` |
| `replanner` | `REPLANNER` |
| `critic` | `CRITIC` |
| `evaluator` | `EVALUATOR` |

`GET /api/graph` returns the real LangGraph nodes and edges — prefer driving
`AgentGraphView` from it over the hand-laid list currently in that file.

---

## The rule that matters most

**Never render a value the backend did not return.**

This is not a style preference. The entire product argument is that our results
are traceable and our uncertainty is honest — competitors show confident numbers
they cannot source. One invented DOI in a demo destroys that, and a chemist in
the room will catch it.

Concretely:

- A missing field renders **"not reported"**. Not a dash that looks like zero,
  not a plausible default, not a placeholder number.
- Backend unreachable renders **"API OFFLINE"**. The UI shows nothing else.
- Evidence keeps its level (`DIRECT` / `SIMILAR` / `AI-PREDICTED` /
  `NO VERIFIED`) and its licence. A similar precedent is **never** labelled as
  a direct one.
- The evaluator may recommend nothing. That is a real state — render it as a
  finding, not as an error or an empty screen.
- Some signals degrade when an optional service is down (the forward-validation
  model, the LLM). The backend says so in the critique — surface that rather
  than hiding it.

There are backend tests that assert the UI never mislabels evidence provenance.
They are currently pointed at deleted files and will need re-pointing at your
components — please do that rather than deleting them. They exist because this
exact failure has happened before.

---

## Things that will trip you up

- **A run is not instant.** Aspirin ~3 s, but a hard target can widen its search
  budget up to three times and take minutes. Show the real stage from
  `TASK_*` and `TOOL_*` events, not a spinner.
- **Name resolution hits PubChem live** and PubChem rate-limits. A name-based
  run can fail at the first step through no fault of yours. SMILES input always
  works; prefer it while developing.
- **The landing page at `/` is prebuilt HTML**, not React — it is injected from
  `src/app/landing_body.html` with assets in `public/_astro/`. Leave it alone
  unless you are redesigning it.
- **`GET /api/tools`** lists the real tool registry, including which agents may
  call what. Use it rather than assuming.

---

## Where to read more

| | |
| --- | --- |
| [EVENTS.md](EVENTS.md) | The event contract. Your main reference. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the agents and the tool gateway work. |
| [product-plan.md](product-plan.md) | Where this is all going, and why. |
| [README.md](../README.md) | Running the whole stack. |

Questions about intent rather than mechanics: the design rationale for the fold
is in `product-plan.md` under "Design: the event fold".
