# Laptop frontend

_Last updated: 2026-09-21. This describes the code as it is; it replaces an earlier version that described files that did not exist._

Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind · three.js. No state or data-fetching library: the app is a client of the backend and nothing else.

```bash
npm install --prefix frontend
npm run dev --prefix frontend      # http://localhost:3100
```

Port 3100, not 3000 (3000 is in a Windows excluded range on the dev machine). The API is `NEXT_PUBLIC_API_URL` (default `http://localhost:8436`).

| script | what |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `next lint` |
| `npm test` | Node's built-in test runner over `tests/` (no test dependency) |
| `npm run build` | production build |

## The two stages

| Route | What | Talks to the backend? |
| --- | --- | --- |
| `/` | **The hero** (`components/hero/`): a full-screen, scroll-driven molecular world that ends on VESYN and **ENTER VESYN**, which leads to the dashboard. See below. | Only `GET /health`, for the status line |
| `/dashboard` | **The scientific command dashboard** (`components/dashboard/`): a separate, 2D-first page that answers "what is happening across Vesyn right now?". See *The dashboard* below. It renders none of the lab. | Yes — REST + `WS /ws/events`, and a few health endpoints |
| `/lab` | **The live lab: the research facility.** One persistent 3D world (`components/facility/`) with a secondary overlay HUD. See *The lab* below. | Yes — REST + `WS /ws/events`. |
| `/lab/chemistry` `/routes` `/evidence` `/intelligence` `/audit` | Workspaces that open as sheets *over* the lab (the layout persists, so the 3D scene never remounts). | Yes |

`components/airlock/` (a 3D scroll-through airlock) and `components/ui/airlock-spaceship-hero.tsx` (a 21st.dev scroll-locked video hero, MIT, by Yura Oak) are built and tested but currently unused. Their scene graph is `components/world/labWorld.ts` (the old pedestal lab), which `/lab` no longer uses. `moleculeMesh.ts` and `useThreeStage.ts` in `components/world/` are shared with the facility.

## The hero: THE SCAFFOLD

One oversized molecule (the cholesterol constitution, `HERO_SMILES`; a layout of the bond graph, not a conformer) is the environment and the primary physical object. Copper bonds, stone / sage atoms, warm key light with real shadows, a mineral rim from behind, copper fill from below. Palette tokens are in `styles/app.css` and used by the whole app (`nc-cyan` is the historical name of the accent; it is sage).

**The headline lives IN the scene** (`typeWorld.ts`). *Chemistry,* / *reasoned* / *by machines.* are three planes at three depths (behind the structure, through it, in front of it), textured from a canvas in solid and outline versions that a shader crossfades. They are depth-tested and depth-writing, so atoms in front hide letters and atoms behind are hidden by them, and depth of field blurs them by their distance from the focus like everything else. Opening: CHEMISTRY resolves from outline to solid, *reasoned* slides into place, *by machines.* settles. On scroll: CHEMISTRY falls back, *reasoned* comes forward, *by machines.* drifts past the lens; all gone by 90%.

**Real depth.** Extremely close atoms ride with the lens (heavily out of focus), the structure is the midground, six real molecules (caffeine, aspirin, ibuprofen, naphthalene, paracetamol, inositol) recede into haze. `dof.ts` renders the scene into a target with a depth texture and blurs each pixel by its own circle of confusion (8 taps; edge-aware smoothing instead of MSAA in the sharp region; it also applies tone mapping). Focus follows what the camera is looking at.

**Journey** (`journey.ts`, pure and tested): far view -> approach -> the camera crosses the headline -> it RIDES the molecule's longest bond path with large atoms passing the lens -> it arrives at the mouth of a ring and looks THROUGH it. The keys are searched, not hand-placed (a ring of candidate positions per point, clearance from every atom, most structure in view, then a relaxation pass); `tests/hero.test.ts` asserts on the real molecule that the camera never enters an atom and always has at least 3 atoms in view, from the first frame to the last. The camera rides in the molecule's own frame, so the molecule can drift and turn (a slow sway) while the camera stays on its rail.

**Identity.** The molecular world reveals the name; it does not give way to a title card. Order (`brandAlpha` / `brandSolid` / `taglineOpacity` / `portalOpacity` in `journey.ts`, asserted in `tests/hero.test.ts`): the last atoms sweep past, *Vesyn* begins as an amber hairline outline (the same outline-to-solid language as the headline), resolves into ivory type, then the descriptor, then the way in.
- **In the scene, off-centre.** The name is a plane 12 units ahead of the arrival camera, left of centre (`placeBrand`), depth-tested with a soft shadow plane behind it. The descriptor hangs under its left edge and the ACCESS 01 / ENTER VESYN marker sits lower and to its right (both follow `bus.brand`, the ink's projected position), so it reads as a diagonal, not a centred stack.
- **Nothing is replaced.** The six distant molecules from the opening drift to `ARRIVAL_SLOTS` behind and around the name, dim a little, and lose focus (the depth-of-field focus moves onto the name). Three foreground atoms sweep back in from beyond the frame and rest across its edges.
- **Warmer arrival.** Key light and ambient warm toward amber, the mineral rim steps back, the shafts strengthen (`warmthAt`).
- **Never dead.** From 80% the camera slowly orbits what it looks at and creeps (`settleK`); the field of view widens 4 degrees. Hovering the marker leans the camera forward before the click.
- **Hierarchy.** Metadata (left readout, mark tagline) steps back with `identityOpacity`; the instrument stays at ~60% and reads `STATE 03 · IDENTITY`.
- **Depth of field notes.** The target is transparent, so the composite un-premultiplies before tone mapping; and each blur tap is weighted by whether its own blur reaches the pixel, which stops sharp silhouettes bleeding a pale halo into the blurred background.

**Instrument** (`Instrument.tsx`): a plan view of the molecule, turned with the molecule's own rotation, with the bond path the camera rides in amber, the atom nearest the camera ringed, and an amber marker that IS the camera (its real position in the molecule's frame and where it is looking; clamped to the rim while still outside). The scale ring turns with the scroll. Readouts: camera position in bond lengths, nearest atom and its distance in bond lengths, the molecule's turn.

**HUD** (`HeroFrame.tsx`): every row reads real state. NODE = `GET /health`; MOLECULE = the scene is running; ORIGIN = chapter 00-03; CAMERA = station along the rail; SCROLL = progress; during the STRUCTURE chapter WEIGHT / RINGS / HEAVY ATOMS from the SMILES. Nav: SYSTEM / LAB / ABOUT, top right.

**Cursor**: a small crosshair when idle; INSPECT over an atom (with the atom's readout beside it), EXPLORE over technical markers, ENTER over the marker. **ENTER VESYN** is a hairline marker: as the pointer approaches, the structure draws taut; on hover the hairline fills with amber light; on click the camera moves forward, the field of view widens, and the wipe opens `/dashboard`.

```
Hero
├── HeroBackdrop   graphite ground + light pools + grain (one layer)
├── ScaffoldScene  ONE WebGL scene: scaffold, headline, brand, close atoms, distant molecules, light shafts, dust; DOF pass
│                  (heroWorld.ts, scaffold.ts, typeWorld.ts, dof.ts, journey.ts)
├── HeroNotes      leader lines pinned to atoms, atom readout, the seven stages
├── Instrument     plan-view analysis instrument
├── HeroFrame      mark, live readout, nav, chapter ticks, scroll cue
├── EnterPortal    the hairline marker
├── HeroLoader     real-check loading sequence (once per session)
└── useScrollProgress the ScrollController (4400 px of wheel travel; keys exact: PageDown = 12%)
```

Dev-only profiling flags: `/?perf=noshadow,nodistant,nodof,msaa2,msaa4`.

## Hero loading, hover and performance

- **Loader** (`HeroLoader`, rules in `loaderLogic.ts`): plays once per browser session. Each line is a real check: molecular engine (world built), scientific environment (WebGL drew a frame), research node (`GET /health`), agent registry (`GET /api/agents`; the agents listed are the ones returned). Unreachable → `OFFLINE`; no answer within 7 s → `NO RESPONSE`. The opening starts (`bus.ready`) as the loader's shells open.
- **Atom hover**: decided from each atom's *rest* position (the pointer pushes atoms off its own ray, so testing the displaced position loses the atom the moment you reach it), with a generous radius. The atom lights, a readout describes it from the graph, and the cursor names it.
- **Cursor states**: EXPLORE over the hero, the atom's own name over an atom, ENTER over the portal, DRAG over the lab world, caret over text fields.
- **Frame rate** (Intel HD 530, the weakest hardware to hand): ~55 fps across the whole journey with the headline in 3D, depth of field, shadows and distant molecules. What cost frames, so it is not reintroduced: a 4x multisampled depth-of-field target (~12 fps; edge smoothing in the DOF pass replaces MSAA), PBR shading on far, blurred molecules (Lambert is indistinguishable), a `mix-blend-mode` layer over the WebGL canvas (~15 fps), rotating a large SVG by attribute (repaints it every frame; rotate compositor layers with a CSS transform instead), an `opacity` on a group of layers (forces an offscreen surface), and stacking several full-screen translucent layers (fill rate on integrated graphics: the grain is a background of the base gradient layer, not its own layer).

## Motion system

`components/motion/`, mounted once by `MotionRoot` in the `(app)` layout.

- **Page transitions** (`TransitionProvider`, `wipeShader.ts`): a noise-dissolve wipe in a fragment shader on a bare WebGL canvas, sweeping out from the clicked point. It is created lazily and costs nothing while idle. Every link click that crosses sections (`/` ↔ `/lab`) gets it; moves inside the lab (`/lab` ↔ `/lab/chemistry` …) are left to Next, since sheets slide over one persistent world. Opt a link out with `data-transition="manual"`; code can call `useTransition().go(href, origin)`. If the destination never reports in, the wipe lifts itself after 4 s. No WebGL → a plain fade; reduced motion → no wipe.
- **Cursor** (`SiteCursor`): a dot plus a trailing ring that stretches with speed, swells over links, opens over `[data-cta]`, becomes a caret over text fields and tightens on press. Override per element with `data-cursor="link|cta|text|drag"` and `data-cursor-label`. Fine pointers only; the system cursor is hidden only after the first real mouse move.
- **Inertial scroll** (`SmoothScroll`): opt in per container with `data-smooth-scroll` (the lab sheets have it). Never the window (the hero spends the wheel on its own progress), never with Ctrl, and nested scrollers keep the wheel until they hit an end.
- All timing and navigation rules are pure and unit-tested in `motionLogic.ts` / `tests/motion.test.ts`.

## Data flow

```
WS /ws/events ──► EventSocket ──► parseEvent ──► batch ──► fold ──► RunView ──► NeoProvider ──► views
                  (reconnect,      (rejects       (40 ms)   (pure)                (context)
                   resume)          bad frames)
GET /api/events ──► reconcile (every 3 s while running, full once at the end) ──┘
GET /api/{projects,runs,agents,tools,graph,audit} ──► lib/api (never throws: ok | offline | error)
```

* `lib/events/fold.ts` is the **only** place events become state. It is pure and idempotent: out-of-order and duplicate delivery converge to the same view as folding the sorted stream.
* **The REST reconcile is required, not optional.** The backend WebSocket can drop an event when concurrent agents commit out of order (`ws_events` filters on `seq > last`, but `seq` is assigned at INSERT). Reproduced with a raw client: 2 of 5 runs lost one `research` event. `GET /api/events` is authoritative; the fold dedupes by `seq`.
* Agent status shown in the UI: API offline → *unknown*; run selected with events → the fold (an agent with no events did nothing: idle); run selected, no events yet → *unknown*; no run → the `/api/agents` snapshot. An agent whose task failed stays flagged after the backend resets it to IDLE.
* Events the backend actually emits are used as-is (21 types, `types/events.ts`). There is no `VALIDATION_FAILED`: a failed validation is `VALIDATION_COMPLETED` with assessment `REVIEW_REQUIRED`, followed by `REPLAN_STARTED`.

## Layout

```
src/
  app/(app)/          root layout for / and /lab (dark design system)
  components/entry/ world/ lab/ chemistry/ routes/ evidence/ intelligence/ audit/ layout/ ui/  (airlock/ unused)
  lib/api/  lib/ws/  lib/events/  lib/chem/  lib/store/
  types/              agents events evidence routes chemistry runs audit api
  styles/app.css      design tokens
tests/                fold, parser, socket, views, decisions, brief/provenance, SMILES, layout, route graph, timeline
```

## The dashboard

The product has four modes, and each is its own page: `/` is the cinematic entry, **`/dashboard` is the overview** ("what is happening?"), `/lab` is the immersive 3D facility ("show me"), and `/lab/*` are the detailed analytical views. The journey is entry -> dashboard -> lab -> detail. The dashboard shares only the data layer with the lab (`NeoProvider`: REST, `WS /ws/events`, the event fold); it has its own layout, frame and components, and embeds no 3D facility.

`lib/dashboard/model.ts` is one pure function, `buildDashboard`, of the folded events, the evaluator's package, the agent views and the service probes. Components only render it, so nothing on the page can be invented in the view layer (`tests/dashboard.test.ts`). A value the run does not support is `null` and reads NOT REPORTED; a zero is only ever a real zero.

| Section | Source (all real) |
| --- | --- |
| **Current research** | Target name from the events, else the molecular formula computed from the resolved SMILES (labelled as such); the target's molecule (`MoleculeStage`, a small self-contained WebGL viewer; drag to turn); project, run, status, current agent. **Progress is the share of workflow stages that have reported completion**, and the page says so: the backend reports no percentage. |
| **Agent workflow** | The seven stages from each agent's tasks and activity. The replan loop (critic -> replanner -> an alternative route -> validation) is drawn as a branch: dashed and dim until the backend triggers it (the validator routes to the replanner only when no route is usable, up to 3 attempts), then amber, and travelling while a replan is running. |
| **Live research** | The run's real events, newest first (housekeeping events dropped), each linking to the page that shows it best. |
| **Agents** | All seven: status, current task, last event, from the roster and the folded events. |
| **Lab status** | A live 2D plan of the facility, with the departments where they stand in the 3D lab, coloured by agent state. A schematic, not an embedded scene. |
| **Synthesis intelligence** | Routes generated / validated / rejected / alternatives, and a bar of the validator's verdicts. |
| **Route preview** | The displayed route's first step from the evaluator's package: real precursors (with the stock check) and the target, drawn from SMILES, on a specimen sheet. Before the package exists it says so and draws nothing. |
| **Evidence** | Tool calls, distinct sources, the route's precedent coverage, and the backend's own statement that it produces no confidence score. |
| **System health** | What each service answered: API, event stream, database (the agent store), AiZynthFinder (`/retrosynthesis/health`), evidence index (`/retrosynthesis/evidence/status`), chemical library (`/molecules/stats`). A failure shows the backend's reason; INSPECT shows the endpoint and the full message. |
| **Alerts** | Failed run, flagged validation, replanning, failed tools, incomplete evidence, no recommendation, unavailable services. Restrained; nothing is a banner. |

States: **no run** (`NO ACTIVE RESEARCH RUN`, with a start form; no fake activity), **API offline** (every dependent service reads OFFLINE), **failed run** (the backend's error, the failed stage, no route drawn). A dependent request that fails while the API answers `/health` reads UNAVAILABLE, not offline: an unhandled server error carries no CORS headers, so the browser hides the status.

**ENTER LAB** (header, lab status, quick access) is a wipe that grows out of the pointer in the lab's own darkness and hands over to the lab's arrival. The chosen project is kept (`sessionStorage`) so the dashboard and the lab agree on which run is current; the lab's tab bar has a Dashboard link back.

## The lab: the research facility

`/lab` is one physical place, not a dashboard: a computational chemistry research facility you look into from above, fly through, and read spatially. The plan (`facility/layout.ts`, tested) puts the **molecular core** at the centre, ringed one level up by the planner's **orchestration gallery**, with the departments around it in workflow order:

```
                      01 RESEARCH
                           |
  02 RETROSYNTHESIS --- MOLECULAR CORE --- 03 VALIDATION      (00 ORCHESTRATION: the gallery deck above the core)
                           |
        05 REPLANNER -- 04 CRITIC -- 06 EVALUATOR
```

Every department's open side faces the core; walkways run between; overhead cable runs carry the LangGraph edges. Multi-level: the gallery deck (with stair and glass balustrade), a research mezzanine, a validation glass observation room, a raised route table, a tiered review amphitheatre, a switching monorail, a ranking gallery.

**The rest of the building** (`facility/precinct.ts`, `architecture.ts`): the departments stand inside a working facility, not an empty hall. Four support buildings fill the corners of the plan, each with its own silhouette: a **compute hall** (rows of racks under a glass roof), a **sample archive** (tall cold storage with frosted doors and a sample island), an **instrument bay** (three large analytical instruments on isolation plinths) and an **analytical bay** (fume hoods and chromatography benches); a **plaza** of pale polished stone with inlaid rings and a dial around the core; an upper-level **mezzanine walkway** with a glass balustrade on three sides; suspended light bars; an entrance hall; and, beyond the glazing, the rest of the campus in the fog. Each department has its own floor material (slate, warm stone, pale ceramic for the validation clean room, graphite, copper-graphite, ivory stone). These support buildings are architecture and ambient equipment only: their rack indicators, turning rings and fan are environmental motion, not agent activity, and carry no data. Agent and task activity exists only in the departments and is driven by the backend.

**The core** is the largest structure: a ten-metre glass analysis chamber on a dialled platform, the target molecule held on its stage in a scanning field, a crown ring, a rotating gantry, four consoles and **four projection stations**. The stations hold real molecules at a smaller scale: the displayed route's starting materials (with the validator's stock check, `not in stock` shown as reported), or, before a route exists, the research agent's ChEMBL analogues (with their Tanimoto similarity). Once a route exists an arc runs from each starting material to the target. With neither, the stations are empty (`projectionsOf`, tested).

**Active departments** carry a soft column of light while they are working, warning or failed; idle ones have none and recede. Labels show a state word only when the state means something.

**Nothing is decoration pretending to be data.** Everything that changes is a function of `FacilityState` (`facilityState.ts`, pure, tested), derived from the folded events and the evaluator's package:

| Department | What it shows (all real) | Failure / warning |
| --- | --- | --- |
| **Core** | The target molecule (the SMILES graph the backend resolved), scanning field while the run is live, four console screens (target, composition and MW computed from the SMILES, structure counts, the backend's RDKit profile or "not reported"). Empty chamber and "no target" when there is none. | run failed -> copper |
| **00 Orchestration** | One token per real task, coloured by task status; search budget, task counts, replans, current task. | planner failed -> its error |
| **01 Research** | Target profile (backend RDKit values, else values computed from the SMILES, labelled so), analogues (ChEMBL hits and the top hit's structure), tool log. The rack LEDs move only while a research tool call is in flight; the document drum lights one card per completed research tool call. | tool errors in the log |
| **02 Retrosynthesis** | A cassette per candidate route of the newest attempt (height = steps, colour = validator verdict); once the evaluator's package exists, the displayed route's REAL tree as a 3D graph over the table (molecules stock / not stock, reactions), structures on the wall, vials lit for its real starting materials. | **RETROSYNTHESIS FAILED** with the backend's own error text; the hall washes copper |
| **03 Validation** | A glass observation room with one cell per candidate route: amber scan while validating, then the validator's verdict. | a `REVIEW_REQUIRED` route turns the room copper and pulses it |
| **04 Critic** | Route plates and stacked findings (high / medium / low counts from `CRITIQUE_CREATED`), the critique headline. | |
| **05 Replanner** | A monorail through FAILED ROUTE, ANALYSIS, ALTERNATIVE ROUTE, NEW PLAN; it moves only while the backend says a replan is running; wall shows the real reason and previous -> next budgets. Parked and "not needed" when the run had no replan. | the room's key light turns amber while it runs |
| **06 Evaluator** | Pillars in the evaluator's ranking order, capped in verdict colour, a light column on the recommended route; **NO ROUTE RECOMMENDED** burns a copper beacon and quotes the refusal. Before the package exists the pillars are the routes seen so far, level and unranked. | |

**States** use the palette only (`TONE_LOOK`): idle warm grey, active mineral green / sage, processing soft amber, warning muted copper, failed restrained red-copper, complete warm ivory-green. Active departments brighten; idle ones recede.

**Live events** arrive as impulses (`FacilityCanvas` reads new events while the lab is open and live; history and replay never flash): `MESSAGE_SENT` sends a packet along the conduit between the two departments, other events flash their department. Conduits come from `GET /api/graph`; each lights while its source works.

**Camera** (`cameraTravel.ts`, tested): FREE VIEW (drag / right-drag / wheel), OVERVIEW, FLOW (straight down on the conduits), FOLLOW WORKFLOW (goes to the working department, with a dwell so it never flickers), FOCUS AGENT (click a department, or keys 1-7), FOCUS MOLECULE (`M`; then atoms and bonds are pickable and open in the molecule panel), FOCUS ROUTE (`R`). Every change of view is an eased arc that rises with distance, and the gaze turns a beat after the body. Arrival: through the south portal at eye level, to the chamber, then back and up to the overview while the interface fades in (frame-delta driven, so a slow first frame cannot swallow it; skipped by any input and under reduced motion; `?skip` for tests).

**Flight recorder** has two views: a timeline (a lane per department, a tick per event) and a **log** (time, agent, event, tool, status, detail for every real event). Choosing an event in either replays the facility to that moment and flies the camera to the department that produced it.

**Interface** is secondary: a small station panel (STATUS, TASK, CURRENT STEP, TOOLS, EVENTS, the backend's error), the agent rail, and a bottom dock with the camera controls and the **flight recorder** (chapters, a lane per department, a tick per event; choosing one replays the facility as it stood after that event, "return to live" comes back). `H` hides everything.

**Performance** (measured on the weakest hardware to hand, an Intel HD 530): the static building is a handful of merged, vertex-coloured meshes (~125 draw calls, ~100k triangles); matte surfaces use Lambert; the shadow map is rendered once and refreshed every 20 frames; only the core has light shafts; the only real lights are the hemisphere, the key and the core lamp. Screens redraw only when their data changes. **Adaptive resolution** steps the render scale between 1.0 and 0.7 to hold ~30 fps. Measured: ~35 fps at full resolution on the overview, 26-47 fps across views at the adaptive scale. Dev-only switches: `/lab?skip&perf=pr1,noaa,noshadow,nopool,nolamps,noscale`.

**Verification** used a test-only harness (kept outside the repo, `facfix.mjs`) that serves a scripted event stream and evaluator package through the app's own REST reconcile path, so populated departments could be seen. It ships nothing and says nothing about real chemistry.

## What the lab shows

* **The real molecule.** `lib/chem/smiles.ts` parses the backend's SMILES into its bond graph (atoms, bond orders, charges, implied hydrogens); `lib/chem/layout.ts` arranges it. The target is drawn in the molecular core as ball-and-stick and in 2D wherever a molecule appears. Click an atom or a bond in 3D, or an atom in the 2D drawing, to inspect it. The formula from the parsed graph is checked against the backend's own RDKit formula when the research agent reported one. **Positions are a layout of the graph, not a computed conformer; the UI says so.** Until a target exists the chamber is empty and its screens say so.
* **Routes as a picture.** `routes/RouteGraph.tsx` draws target → reaction → precursors with each structure, verdict-coloured reaction nodes and three signal pips (structural check, forward model, literature). Step numbering matches the backend's critique numbering. The first flagged step opens automatically.
* **Departments alive.** Tone, glow, lit equipment and the packets along the LangGraph edges are all functions of folded events. A failed task keeps its department flagged after the backend resets it to IDLE.
* **Camera.** See *The lab* above; choosing an event in the flight recorder also flies to the department that produced it. Easing is time-based, so it feels the same at any frame rate.
* **Flight recorder.** The bottom dock's timeline, and the `/lab/audit` swimlane with the full event list and per-call audit records. **Replay** re-folds only the events up to a cursor, so the entire lab shows what the system knew at that moment; a banner marks it, and the outcome never leaks into an earlier moment.
* **Intelligence** is a situation brief (objective, current agent, route, validation status, key issue, alternatives, uncertainty, evidence, final evaluation) plus decisions with trigger / action / evidence / uncertainty. **Evidence** starts with a provenance chain: which tool produced what, for which agent, and whether it ran at all ("NOT REPORTED" if it made no call).
* **The interface gets out of the way:** the agent rail collapses to a slim column; **H** hides everything.

## Rules the UI enforces

* A value the backend did not return renders **not reported**; never a dash, default or placeholder.
* API unreachable → **API OFFLINE**; agents show *unknown*. The one exception: when the API has not answered since the page loaded, a recorded run (`public/demo/run.json`) is shown, labelled **SIMULATED**.
* Evidence keeps its level (direct / similar / AI-predicted / no verified evidence) and its source fields; a similar precedent is never labelled direct. A DOI is shown with a note that it may belong to the dataset's curating paper.
* The route score is labelled a ranking heuristic, not a feasibility or yield probability.
* The evaluator refusing to recommend a route is a finding, shown as such.
* Decision summaries (Intelligence) are built only from event payloads and the backend's own limitation text. No model reasoning is displayed or invented.

## Known gaps

* **Structures are layouts, not conformers.** The backend returns SMILES only. The parser covers the organic subset, bracket atoms, rings, branches, charges and aromaticity; stereochemistry is ignored and the drawing does not show it. An unparseable SMILES is reported as unreadable, never guessed.
* **The entry is the 3D molecular hero, not a video.** Nothing references `public/entry.mp4` any more. `components/airlock/` and `components/ui/airlock-spaceship-hero.tsx` are an earlier entry sequence that no route imports; they are kept (with their tests) and can be removed if nobody wants them.
* **Facility performance is bounded, not free.** ~35 fps at full resolution on an Intel HD 530 (overview); the render scale adapts down to 0.7 on weak GPUs, which softens the image. Faster GPUs stay at full resolution. There is no post-processing bloom (glow is emissive and additive layers only).
* **Route trees appear at the end.** The backend puts route trees in the evaluator's final package, so during a run the retrosynthesis hall shows candidate routes (count, steps, verdict), and the 3D route tree appears when the package exists.
* No frontend cancel: the backend has no cancel endpoint.
* The scientific views render whatever the backend returns and nothing else. AiZynthFinder's model data was absent when the lab was first built and has since been downloaded on the dev machine (`GET /retrosynthesis/health` reported `model_loaded: true` at handoff), but the ReactionT5, QSAR solubility and evidence-index paths were not seen populated: the QSAR model file is missing, `GET /molecules/stats` returns 500, and the evidence index is not configured. The UI reports each of those as the backend states them.
