# The assistant: VESYN on a phone

A mobile-first bridge over the existing platform. It adds no backend, no second data layer and no
duplicate adapters — it is a second front end on the same `lib/`, shaped for a thumb.

**Status: implemented and browser-verified at 390 × 844.** The production build passes, including
TypeScript and lint, and **205 tests pass**. The guided before/after demo uses newly recorded database
runs. A live paracetamol profile was started in the mobile UI, completed, and reopened from History.

```
http://localhost:3100/assistant
```

---

## What it is

Next allows **one root layout per top-level route group**, and `app/(app)/layout.tsx` is already the
laptop app's. So the assistant got its own: `app/(mobile)/layout.tsx`, with its own document, viewport
and manifest. A phone opening `/assistant` never loads the 3D hero shell.

```
Mobile UI  ──►  NeoProvider  ──►  lib/api  ──►  VESYN API  ──►  LangGraph agents
                    │                                               │
                    │                                          Hindsight memory
                    └─ WebSocket events ─► fold ─► buildDashboard ──┘
```

Nothing on a screen is computed twice: the agent progress, the route cards, the "why this route" checks
and the memory panel all come from the same pure functions the dashboard uses.

## Screens

| | What it shows |
|---|---|
| **Home** | Ask bar (type / speak / photograph), example questions, Continue research, Recent memory. Makes no requests of its own. |
| **Research** | The conversation. A question either launches the agent team or goes to the agent whose role covers it — and the screen says which it chose. Live agent progress, the short answer, memory recall, route cards. |
| **Memory** | *What VESYN remembers*: each experience, what it cost a route, where it came from, when it was recalled. Filterable by "changed a ranking" and "simulated". |
| **History** | Every investigation grouped by day. Tap to reopen and carry on. |
| **Profile** | Backend and service status, memory statistics, and the few settings that actually do something. |

## The honest bits

These were deliberate, and each one is visible in the UI rather than buried:

- **A seeded demo memory reads `SIMULATED` everywhere it appears** — on the route card, in the recall
  list, on the memory card. The tag comes from the backend (`demo-seed`), not from the phone.
- **"Memory changed the decision" is only claimed when a recalled lesson actually marked a step**
  (`memory.applied`). A memory that was read and found not to apply says exactly that.
- **Routes are named by their chemistry, never by a letter.** AiZynthFinder renumbers routes per run, so
  a card leads with its step count and starting material; the route id is shown small for cross-checking.
- **The short answer is assembled, not generated.** Its headline is the evaluator's own recommendation
  and every bullet is one of `whyRoute()`'s checks — the test asserts this.
- **Vision is refused, not faked.** The camera captures and previews; the backend has no image endpoint,
  so `analyzeImage()` says so and returns `ok: false`. One function to replace when one exists.
- **The research service is never cached by the service worker.** A stale score served from a cache
  would be a wrong answer presented as a current one.

## Mobile features

| Feature | How |
|---|---|
| Voice | Web Speech API (`lib/mobile/speech.ts`). Absent on browsers without it — the mic simply does not appear, typing is the fallback. Swap the hook's internals for native/cloud speech; the return shape is the contract. |
| Camera | Native capture/file picker, local image preview and removal. Photos stay on the device; the UI explains the absent vision endpoint. |
| Install (PWA) | `public/manifest.webmanifest` + `public/sw.js` + icons. Standalone, portrait, scoped to `/assistant`. Profile shows an **Install** button when Chrome offers one. |
| Offline | Up to eight previously opened investigations are saved on the device, including their events/results. Offline copies are labelled; saved questions cannot be sent until connected. Without a saved investigation, the recorded demo is shown. |
| Long-running jobs | A run keeps going server-side. When one that was watched running lands, the shell says so on any screen and raises a **local** notification if permission was granted. No push server. |
| Accessibility | 44px minimum touch targets, pinch-zoom left enabled, labelled controls, `role="status"` on live regions, `prefers-reduced-motion` honoured, bottom sheets built on `<dialog>` so Escape and focus trapping are the platform's. |

## Files

**Initial app files** (completion additions are listed below)

```
src/app/(mobile)/layout.tsx                 its own root layout: viewport, manifest, metadata
src/app/(mobile)/assistant/layout.tsx       NeoProvider + shell + service worker
src/app/(mobile)/assistant/{,research,memory,history,profile}/page.tsx

src/components/mobile/MobileShell.tsx       status strip, offline banner, bottom nav, run watcher
src/components/mobile/AskBar.tsx            type / speak / photograph, draft kept on the device
src/components/mobile/Home.tsx
src/components/mobile/Research.tsx          the conversation
src/components/mobile/AgentProgress.tsx     the team's work in words, memory in its place
src/components/mobile/RouteList.tsx         stacked route cards + the detail sheets
src/components/mobile/MemoryScreen.tsx
src/components/mobile/History.tsx
src/components/mobile/Profile.tsx
src/components/mobile/ui.tsx                sheet, tile, row — the rest is imported from dashboard/ui
src/components/mobile/ServiceWorker.tsx

src/lib/mobile/assistant.ts                 the short answer, ask routing, this device's own state
src/lib/mobile/speech.ts                    voice, where the device has it
```

**New — assets**: `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*.png`
**New — tests**: `tests/mobile.test.ts`, `tests/mobile-demo.test.ts`, `tests/mobile-worker.test.ts`

**Completion work**:

- `components/mobile/DemoStory.tsx`: explicit guided demo, before/after controls and score comparison.
- `lib/mobile/demo.ts`: matches the same chemistry across recordings rather than assuming route IDs are stable.
- `lib/mobile/cache.ts`: bounded, quota-tolerant saved investigations; invalid storage is ignored.
- `lib/mobile/install.ts`: preserves the browser install prompt before Profile is opened.
- `lib/store/NeoProvider.tsx`: opt-in mobile persistence, offline restoration and explicit demo selection;
  live requests cannot overwrite a selected demonstration.
- `scripts/record-demo.mjs`: accepts an output filename; `public/demo/before.json` and `run.json` now
  contain the before and after runs respectively.
- `scripts/start-mobile.mjs` and `package.json`: local production entry point that includes static and public assets.
- Camera previews, draft retention, follow-up routing, session isolation, notification timing and the
  chat input's clearance above bottom navigation were corrected during browser verification.

**Initial shared-layer edits**

| File | Change |
|---|---|
| `src/lib/api/agents.ts` | added `askAgent()` over the existing `POST /api/agents/{id}/chat` |
| `src/lib/api/index.ts` | export it |
| `src/styles/app.css` | appended the `.nc-mobile` scope and its component classes |

## APIs reused — nothing new on the backend

| Endpoint | Used for |
|---|---|
| `POST /api/projects` | start an investigation (the same call the laptop app makes) |
| `GET /api/projects`, `/api/projects/{id}` | history, continuing research |
| `GET /api/runs/{id}` | the evaluator's final package |
| `GET /api/events`, `WS /api/events` | live agent progress |
| `POST /api/agents/{id}/chat` | follow-up questions, grounded in the run |
| `GET /health`, `/retrosynthesis/health`, `/retrosynthesis/evidence/status`, `/molecules/stats` | service status |

The spec asked for a `/lib/vesyn/` adapter layer. That already exists as `src/lib/api/` — same job, same
`ApiResult` contract, never throws, offline-aware. A second copy would have been two things to keep right.

Likewise most of the requested data model already exists: `ResearchSession` → `Project`, `ResearchJob` →
`RunRecord`, `Route`/`RouteStep` → `RankedRoute`/`RouteNode`, `ResearchResult` → `RunResult`,
`AgentStatus` → `Stage`, `MemoryRecall` → `MemoryPanelView`. Genuinely new and defined in
`lib/mobile/assistant.ts`: `ChatMessage`, `AssistantReply`, `SeenMemory`, `JobState`, `Ask`.

## Running it

```bash
npm run dev --prefix frontend        # http://localhost:3100/assistant
```

Needs the usual stack for anything live (`.\start-vesyn.ps1`). Environment: **none new** —
`NEXT_PUBLIC_API_URL` is the single existing variable, defaulting to `http://localhost:8436`. No
secrets reach the browser; every key stays in the backend's environment.

For a production/PWA check:

```bash
npm run build --prefix frontend
npm run start:mobile --prefix frontend
```

This serves the standalone build at `http://localhost:3100/assistant`, including its public and static
assets. The service worker is registered only in production, scoped to `/assistant`; it precaches all
five screens, their initial JavaScript/CSS, and both recordings. API responses bypass it. Optional
`PORT` changes port 3100; `VESYN_HOST=0.0.0.0` binds the production server for LAN testing.

Testing on a phone, same Wi-Fi:

```bash
npx next dev -p 3100 -H 0.0.0.0
```

Then `http://<laptop-ip>:3100/assistant`. That is enough to use every screen, but **installing a PWA
needs https or localhost**, so the install flow and the service worker have to be tested through the
Tailscale Funnel URL (or any https host).

For **live research from another device**, set `NEXT_PUBLIC_API_URL` to a backend URL reachable from
that device and allow the frontend origin in backend CORS. `localhost:8436` on a phone points to the
phone, not the laptop. HTTPS frontend hosting also requires an HTTPS backend. The repository's existing
Tailscale configuration publishes the API; the frontend must also have its own HTTPS hosting.

## Guided demo

Home → **Explore the guided memory demo** → **Start guided demo** → **Recall experiences & compare**.
The controls work independently of backend availability and do not launch a pipeline or call an LLM.

| Recording | Source | Outcome |
|---|---|---|
| `before.json` | `run_6596ab312928` | Five routes, recommended 3-step route at **0.7946** |
| `run.json` | `run_46079a25cd34` | Previous chemistry at **0.4946**; 2-step route recommended at **0.7791** |

The after run recalled **26 records**. **Three distinct simulated experiences** affected ranking;
these are not interchangeable counts. The UI states both accurately. Recordings and seeded lessons
are marked **DEMO DATA / SIMULATED RESEARCH OUTCOME**. Scores are ranking heuristics, not measured yields.

To record again from existing runs (database and API only):

```bash
node frontend/scripts/record-demo.mjs run_6596ab312928 http://localhost:8436 before.json
node frontend/scripts/record-demo.mjs run_46079a25cd34
```

## Verification

- `npm run build`: successful production build, TypeScript and lint; no warnings.
- `npm test`: 205 passing tests across 53 suites. Added coverage for chemistry-based demo comparison,
  corrupt/blocked offline storage, service-worker precaching and cache boundaries, and follow-up routing.
- Browser at 390 × 844: all five screens, live research progress/completion, History reopening,
  camera/file preview and vision fallback, route cards, decision sheet, and both demo phases.
- With **both web server and API stopped**, a cold reload restored the app, saved results and drafts;
  history and the complete guided demo remained usable. Selecting another offline investigation also
  survives reload. Offline send remains disabled.
- Profile reports the active offline worker. Physical Android installation and speech/camera hardware
  remain device checks, not claims of this desktop-browser verification.
- Screenshot: [offline memory demonstration](screenshots/mobile-memory-demo.jpg).

**Contrast, measured rather than asserted.** Every rendered text node on each screen, checked against
the colour actually painted behind it - compositing each translucent layer, since a tint like the chat
bubble's reads as a false failure when its alpha is ignored:

| Screen | Text nodes | Below WCAG AA | Lowest ratio |
|---|---|---|---|
| Home | 23 | 0 | 4.87:1 |
| Research, guided demo | 26 | 0 | 4.87:1 |
| Memory | 157 | 0 | 4.87:1 |
| History | 66 | 0 | 4.87:1 |
| Profile | 42 | 0 | 4.87:1 |

AA asks 4.5:1 for body text and 3:1 for large text. The floor across the whole app is 4.87:1.

**Two bugs found and fixed in this pass:**

- *The recall count under-reported.* The card read "12 previous experiences recalled" where the run
  reported **16**. It counted the memory objects the event ships rather than the count the event
  carries (`count: 16`, 12 items). It now shows the reported figure, and the disclosure reads
  "Recalled (12 of 16 shown)" so the gap is stated instead of quietly rounded away.
- *A follow-up was launched as a new investigation.* "Explain the limitations of this profile." matched
  "profile" as a task to run, resolved the word "this" as a molecule, and failed with `ResolutionError`.
  The ask router now reads a noun that names part of the run on screen as a reference to it; the case is
  kept as a regression test in `tests/mobile.test.ts`.

In a desktop browser: DevTools → device toolbar → **390 × 844**.

## Decisions worth knowing

**Light assistant theme (requested redesign).** Porcelain backgrounds, white surfaces, slate text and
deep teal actions make the assistant lighter and easier to read. Green, amber and red retain their
status meanings with darker shades suitable for white backgrounds. The theme is scoped to the mobile
root and shell; shared components inherit it. Browser chrome, PWA launch colours, focus rings, cards,
navigation and dialog sheets all use the light palette. Headings and buttons use clearer sentence-case
typography, and content is bounded on larger screens. The service-worker cache version was advanced so
installed copies receive the new shell.

**The desktop site was not touched.** `/` still serves the laptop app on every device; no user-agent
redirect was added, because that would hijack the desktop site on tablets mid-demo. The PWA's
`start_url` is `/assistant`.

## What is left

1. **Hardware verification:** actual Android installation, native camera capture, speech recognition
   and notification permission still need a physical device. The browser file picker/preview path is verified.
2. **Vision and background push** require backend endpoints. Notifications currently work only while
   the app is open; no delivery while closed is promised.
3. **The Memory screen spans this device, not the whole bank.** The API exposes Hindsight only through a
   run; browsing the bank would need a read-only `/api/memory` endpoint.
4. **Follow-ups are not streamed.** The backend's `llm.generate` is one-shot, so a follow-up shows
   "Thinking…" rather than incremental text. Agent *progress* is genuinely live over the WebSocket.
   The live follow-up endpoint was verified; this machine's Ollama timed out, so generated prose could
   not be verified. The assistant labels that fallback and retains the question for retry.
5. **No account or new authentication system:** the assistant uses the existing API's access model.
   No backend, engine, Hindsight or agent implementation was replaced.
