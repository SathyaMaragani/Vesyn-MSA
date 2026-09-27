# The demo: one memory apart

Three minutes. The same question asked twice, with one memory added in between, and the recommendation changes
for a reason you can point at. Then a run that refuses to recommend anything.

## Before recording

```powershell
.\start-vesyn.ps1                                              # database, Hindsight, Ollama, ReactionT5, API
python scripts/seed_memories.py --reset --phase before         # the bank without the lab report (~7 min on Groq)
npm run dev --prefix frontend                                  # http://localhost:3100
```

Also run **"Find a synthesis route for erlotinib"** once beforehand: it takes three search attempts (~6 minutes),
too long to wait for on camera. Scene 4 reopens it from the Search tab.

Rules for the whole video:

- **Name routes by their chemistry, never by number.** AiZynthFinder numbers routes per run; two runs of the same
  molecule have returned the same five routes under different numbers.
- **Say "simulated" when the lab report is on screen.** It is invented demo history; the UI marks it, and so should
  the voice-over.
- Reseed with `--reset` between rehearsals: every run retains its own outcome, so the bank grows.

## The flow

| Time | Screen | Say |
|---|---|---|
| 0:00–0:20 | Overview, nothing selected | Drug discovery is iterative. Teams investigate a compound, reject routes, learn on scale-up which steps fail — then meet the same chemistry again. Most AI agents start every question from zero. |
| 0:20–0:40 | Search tab → *Find a synthesis route for gefitinib* | Vesyn is seven agents that plan and validate synthesis routes with real chemistry tools — and remember what they learned, in Hindsight. |
| 0:40–1:10 | Overview while it runs: engine, timeline | The Orchestrator recalls earlier findings before anyone starts. It already knows two transformations ReactionT5 disputed when we investigated erlotinib, a related EGFR inhibitor. |
| 1:10–1:30 | Result: the recommended route, **Why this route?** | It recommends a three-step route that couples the aniline directly onto the quinazolinone. Every step validated. |
| 1:30–1:50 | Terminal: `python scripts/seed_memories.py --phase after` (~20 s) | Now the lab reports back — a *simulated* record for this demo: that coupling collapsed on scale-up, 68% to 31%, the aniline adding twice. We retain it. |
| 1:50–2:20 | Search → the same question again | Same question. Same routes, same tools. |
| 2:20–2:40 | Result: route cards, memory card, timeline | The coupling route is ranked down, 0.79 to 0.64, and the memory card says why — flagged in an earlier investigation, marked simulated. A route that avoids that step now leads. The agent didn't retrieve a conversation; an earlier outcome changed this decision. |
| 2:40–2:50 | Search tab → Recent → the erlotinib run | And when every route fails validation, it says so. Three search attempts, fifteen routes, no recommendation — instead of a confident wrong answer. |
| 2:50–3:00 | Overview | Investigate, remember, recall, adapt. |

## What each screen should show

**First gefitinib run (before):** Research memory — lessons recalled, two routes ranked down by the erlotinib
disagreements, *not* the leader. Why this route? — the coupling route selected.

**Second gefitinib run (after):** Candidate routes — the former leader carries *"Reuses a transformation flagged in
an earlier investigation"* with a **SIMULATED** badge. Research memory — "Routes … ranked down · SIMULATED" with the
scale-up text. Why this route? — *"Avoids a transformation flagged in an earlier investigation."* Decision timeline —
*"Critiqued 5 routes: no critical issues, N steps flagged by earlier investigations."*

**Erlotinib:** Why this route? — "None recommended", with the evaluator's own reason.

## If something is off

| Symptom | Cause | Fix |
|---|---|---|
| The recommendation does not change | the lab report is not stored, or a re-recorded run changed the routes | `seed_memories.py` checks both and says which; rerun it and read its flip check |
| Memory panel: "Unreachable" | Hindsight is down | `docker compose up -d hindsight`; `docker logs vesyn_hindsight` |
| Seeding stalls at *n*/13 | Groq's per-minute or daily token limit | it resumes by itself on the per-minute limit; for the daily one, switch `HINDSIGHT_API_LLM_MODEL` in `.env` (see `.env.example`) and restart Hindsight |
| Steps read "not forward-checked" | ReactionT5 is down | start it (`start-vesyn.ps1` does); scores change without it |
| The site shows **SIMULATED** in a banner | the API is not reachable from the browser | the offline recording is playing; start the backend, or use it deliberately for an offline demo |
