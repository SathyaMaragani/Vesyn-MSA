# Vesyn — Product Plan

How Vesyn becomes a working product: RamChems' chemistry, run by the
multi-agent system, with every number on screen traceable to the tool call that
produced it.

Written 20 Sep 2026. Baseline is commit `e074b38` plus 79 uncommitted files.

**Target: demo-grade for fundraising and pilots.** Genuinely real — zero
fabrication — and reliable in a live demo. One user at a time is acceptable.

This doc is about making the platform *real and shippable*.
[chemairs-parity-plan.md](chemairs-parity-plan.md) is about making the
*chemistry deeper*. They run in parallel and neither blocks the other; this one
comes first, because depth in a system nobody can run is not demonstrable.

---

## Where we actually stand

The backend and the frontend are not at the same maturity, and the gap is much
wider than the docs suggest.

| Layer | State | Honest verdict |
| --- | --- | --- |
| MAS orchestration (`backend/mas/`) | LangGraph, 7 agents, governed tool gateway, full audit, event sourcing | **Product-grade.** ~7.3k LOC, clean, deliberate. This is the asset. |
| RamChems chemistry | 4 modules, 197 tests, benchmarked retrieval | Works. Route engine is weak (ibuprofen unsolved at defaults). |
| Event contract | 21 typed events, persisted with `seq`, replayable | **Product-grade**, and unused by the UI. |
| Frontend | Next.js shell, 3D office, agent graph | ⚠️ **A mock.** See below. |
| Deployment | none | No CI, no auth, CORS `*`, Docker not running. |
| Licensing | ORD is CC-BY-SA-4.0 | Copyleft. Blocks commercial release today. |

### ⚠️ The frontend does not talk to the backend

Not "partially wired" — there is **no `fetch`, no `WebSocket`, and no backend
URL anywhere in `frontend/src`**.

- `RuntimeContext.sendMessage` is a `setTimeout` simulation that returns
  hardcoded prose: fabricated DOIs (`10.1002/cber.18780110158`), invented yields
  ("88% and 94%"), and a literal `98.2% confidence`.
- Results come from `SAMPLE_RESULTS` in `lib/runtime/initialData.ts`.
- The UI's agent roles (`KNOWLEDGE`, `ANALYSIS`) are not the backend's
  (`REPLANNER`, `EVALUATOR`).
- ~3,100 LOC of **AllocFlow** — an unrelated conference-paper-matching product —
  is still in the tree: eight `/dashboard` pages, `components/matching/`,
  `app/allocflow_hydrated_body.html`, and `lib/api.ts`.
- `lib/auth.tsx` is fake auth that auto-logs-in as `admin@allocflow.io` with a
  hardcoded password.

This matters beyond tidiness. Our one stated advantage over ChemAIRS is
traceability and honest uncertainty. **A demo that fabricates a DOI destroys the
entire pitch**, and it is exactly the thing a chemist in the room will catch.

---

## Product thesis

What a viewer should walk away believing:

> Seven agents planned a synthesis, argued about it, and every claim they made
> can be clicked back to the tool that produced it — including the claims they
> refused to make.

Three beats, in order of how much they differentiate us:

1. **Provenance.** `mas.tool_calls` already records who called what, why, with
   which input and version, and what came back — written *before* execution, so
   a crash still leaves a record. Exposing that is the product.
2. **Honest refusal.** The evaluator can decline to recommend a route. Steps
   with no precedent say so. This is a feature, and it is the opposite of what
   the competition demos.
3. **The agents are legible.** The 3D office and the graph make an opaque
   pipeline watchable. Good, but it is the wrapper — beats 1 and 2 are the
   substance.

---

## Design: the event fold

The single architectural decision that makes the rest cheap.

`docs/ARCHITECTURE.md` already states the principle — *"the office, graph and
feed are pure functions of the event stream"* — and the backend already honours
it. The frontend simply never implemented its half. So we do not invent a new
contract; we consume the one that exists.

```
 POST /api/projects {target}          -> {project, run}
 WS   /ws/events?run_id=&after=0      -> replay from `after`, then live tail
 GET  /api/runs/{id}                  -> the final result package
 GET  /api/audit?run_id=              -> provenance for every tool call
```

```
  events (ordered by seq) ──► fold(state, event) ──► RuntimeState
                                                      │
                          ┌───────────────┬───────────┴────┬──────────────┐
                       Office          Graph            Feed          Chemistry
                    (desks, walks)  (node status)   (transcript)    (routes, evidence)
```

The fold is one pure reducer, and it is the only place backend events become UI
state:

| Event | Folds into |
| --- | --- |
| `AGENT_STATUS_CHANGED` | agent state + progress |
| `TASK_*` | the task queue sidebar |
| `TOOL_REQUESTED/STARTED/COMPLETED/FAILED` | office animation (`station` says which desk), tool activity log |
| `MESSAGE_SENT` | the agent-to-agent transcript |
| `ROUTE_GENERATED`, `VALIDATION_*`, `CRITIQUE_CREATED` | the chemistry workspace |
| `PROJECT_COMPLETED` | trigger `GET /api/runs/{id}` for the full package |
| `PROJECT_FAILED` | an honest failure card, with the error |

Why this shape:

- **Replay is free.** `?after=seq` already replays. A recorded run re-folds
  identically, so a live demo can fall back to a real recorded run — not a mock —
  if the network or a model misbehaves. This is the single biggest demo de-risk
  available, and it costs nothing extra.
- **Reconnect is free.** Drop the socket, reconnect with the last `seq`, and the
  state converges. No special-casing.
- **Fabrication becomes structurally hard.** If the UI can only render what a
  reducer derived from a persisted event, there is nowhere for an invented DOI
  to enter. The rule stops being discipline and becomes architecture.
- **`types.ts` and `initialData.ts` mostly survive.** They become *presentation*
  only — desk positions, colours, symbols — which is what the architecture
  already intended. We replace the state *producer*, not the state *shape*.

Empty and degraded states are part of the contract, not an afterthought:
no value → `not reported`; socket down → `API OFFLINE`; ReactionT5 or the LLM
absent → a visible "signal downgraded" badge, which the critic already reports.

---

## Phase 0 — Stabilise the ground

*Nothing below is trustworthy until this is done.*

- **Commit the 79 uncommitted files** in coherent chunks. The entire frontend
  swap and the V2.3 forward-validation work are currently unversioned. This is
  the highest-risk item in the repo and the cheapest to fix.
- ⚠️ **`docker compose up -d` from this repo is wrong, and the README says to
  run it.** The container name `ramchems_db` already belongs to the RamChems
  project, which owns the data volume. Running compose here fails on a name
  conflict *after* creating a stray empty `rs_msa_pgdata` volume. Since we
  deliberately share RamChems' database, this repo should not declare the `db`
  service at all — depend on it, document `docker start ramchems_db`, and have
  the preflight script check for it.
- Add `restart: unless-stopped` to whichever compose file does own the `db`
  service; Postgres stopping between sessions is why test runs fail with
  `PoolClosed` rather than real failures.
- One command brings the stack up: Postgres → wait healthy → API → wait for the
  ~8 s AiZynthFinder load → frontend. `scripts/wait_for_uvicorn.py` already
  exists; wrap it.
- Get a green suite **on record**. Measured 20 Sep 2026: **256 collected, 237
  passing, 4 failing** (see below), the rest not run without the ORD index.
  `tests/test_mas.py` is **20/20 including the live aspirin run**.
- ⚠️ **Repair the two dead UI-contract tests.**
  `test_ui_never_claims_the_route_came_from_the_matched_source` and
  `test_ui_distinguishes_direct_from_similar_in_the_label_itself` read
  `frontend/src/workspaces/results.tsx`, a file from the deleted Vite app, so
  they now fail with `FileNotFoundError`. These were the automated guard against
  the UI mislabelling evidence provenance — exactly the failure the mock
  frontend then went on to commit. Re-point them at the real components in
  Phase 1 and treat them as the regression test for "no fabrication".
- The other two failures (`test_resolve_*` in `test_search.py`) are PubChem
  returning `503 PUGREST.ServerBusy`. Not our bug, but the skip guard only
  catches "could not be reached", so upstream load shows up as a red suite.
  Widen it.

```
EXIT  clean `git status`
EXIT  one command, cold machine to working lab
EXIT  green suite committed, with the run recorded
```

## Phase 1 — Delete the lie

- Delete AllocFlow entirely: `app/dashboard/*`, `app/login/`,
  `components/matching/`, `app/allocflow_hydrated_body.html`, `lib/api.ts`,
  `lib/auth.tsx`, and the dead types. ~3,400 LOC out.
- Build the client and the fold (`lib/backend/client.ts`, `lib/backend/fold.ts`).
- Replace `RuntimeContext`'s simulation with the fold. Chat input becomes
  `POST /api/projects`.
- Remap the seven agents to the backend's seven; `initialData.ts` keeps only
  symbol, colour and desk position.
- Implement the empty/degraded states above.

```
EXIT  zero hardcoded chemistry values in frontend/src (grep for a DOI, a yield,
      a confidence score — all must be absent)
EXIT  a real aspirin run drives the office, graph, feed and workspace
EXIT  with the API stopped, the lab says API OFFLINE and invents nothing
```

## Phase 2 — Survive a live demo

- Cancel a run; reconnect resumes from the last `seq`.
- Progress that reflects reality. A run is not 3 s: ibuprofen needs 500
  iterations (~95 s) and ReactionT5 adds ~5 s per reaction. Show the actual
  stage, not a spinner.
- Record 3–4 vetted targets as replayable runs, and a one-key fallback to
  replay. Real runs, recorded — never a mock.
- Kill each optional dependency in turn (ReactionT5, LLM, evidence index) and
  confirm the run completes with a visible downgrade.
- ⚠️ **Cache and retry `pubchem.resolve`.** It is the planner's first tool call
  on every name-based run, it is an uncached live call to an external service,
  and PubChem was returning `503 PUGREST.ServerBusy` during this assessment.
  Today that means "type paracetamol" fails at step one, in front of the room,
  for a reason that is not our fault and will not look like it. Cache resolved
  names in Postgres, retry with backoff, and pre-resolve the demo targets.

```
EXIT  a demo survives: no ReactionT5, no LLM, PubChem 503, and a dropped socket
EXIT  replay of a recorded run is visually identical to the live one
```

## Phase 3 — Licence segregation

Cheap, because the schema already carries it: `ord_reactions.license` is
`NOT NULL` and `Precedent.license` exists on the domain model. This is a filter
and a surface, not a migration.

- Verify the licence values actually present (Lowe/USPTO CC0 was ingested beside
  ORD into the same table — confirm the tagging is correct before trusting it).
- `EVIDENCE_CORPORA=cc0` vs `cc0,ccbysa` as a provider-level filter, so a
  commercially clean build exists without losing ORD's capability.
- Show the licence on every precedent in the UI, and the active corpus in the
  header.
- Re-run the retrieval benchmark under CC0-only and record the coverage cost
  honestly.

```
EXIT  CC0-only mode runs end to end, with its measured coverage published
EXIT  no precedent renders without its licence
```

## Phase 4 — Provenance as the product surface

The fundraising beat. Mostly exposure of what already exists.

- A provenance panel: click any number → the `mas.tool_calls` row that produced
  it (tool, version, input, output, duration, status).
- Drive `AgentGraphView` from `GET /api/graph` rather than a hand-laid layout,
  so the graph is the real LangGraph.
- Export the run as a report: routes, evidence levels, critique, refusals, and
  the audit trail.

```
EXIT  every rendered value reaches its tool call in one click
EXIT  a report exports with no claim lacking a source
```

## Phase 5 — Package it for a pilot

- Dockerfile for the API; a compose profile that brings up the whole stack.
- Lock CORS to the real origin behind an env var — the wildcard in
  `main.py` is flagged LOCAL DEV ONLY and must not ship.
- A single shared token in front of the API. Not user accounts — just enough
  that a pilot URL is not open to the world.
- CI: the test suite on push. Do **not** wire in
  `scripts/test_retrosynthesis.py`; it exits 1 by design.

```
EXIT  a pilot runs it from a tag on their own machine, with the README alone
```

---

## Deliberately not built

Beyond the deferrals already recorded in `ARCHITECTURE.md` (Redis, Celery,
Qdrant, OTel, React Flow), the "demo-grade" target also defers:

| | Why |
| --- | --- |
| Multi-tenancy, orgs, billing | One user at a time is in scope. Adding tenancy now rewrites the store for nobody. |
| User accounts and RBAC | A shared token covers a pilot. The gateway already has a principal model (`"user"`) when real auth is wanted. |
| Parallel runs | `graph._team` is one lock and AiZynthFinder is one ~1 GB locked instance. Concurrency needs a finder pool, which is Phase 1 of the parity plan's territory, not this one. |
| Postgres 13 → newer | EOL, but pinned to the RDKit cartridge version. Move both together, and not during a demo push. |

---

## Risks, and what we must not oversell

The plan above makes the platform honest. These are the things it does **not**
fix, and which the demo must not paper over:

- **The route engine is weak.** Ibuprofen does not solve at default settings.
  Pick demo targets that work, and say plainly that hard targets are the
  parity-plan roadmap — do not imply they solve today.
- **Forward validation is not a filter yet.** Precision 0.91 / recall 0.46, 29%
  false positives. It informs the verdict; it must never be labelled as
  certainty.
- **QSAR is a pipeline, not a predictor.** R² 0.79, ±0.96 log units ≈ a factor
  of 9, nothing experimentally validated. The `structurally_familiar` flag
  demonstrably does not predict error.
- **Evidence coverage is thin.** Most targets will honestly report ⚪. That is
  the correct behaviour and it will look sparse. Frame it as the differentiator
  it is, and pair it with the coverage number from Phase 3.
- **No chemist has judged these routes.** Benchmark agreement is not
  feasibility. A chemist partner is the missing input, and no amount of
  engineering substitutes.

Rough sizing: Phases 0–2 land a demo that is real and does not break (~2–3
weeks). Phases 3–5 make it clean, credible and shippable to a pilot (~3 weeks).
