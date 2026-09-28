# The demo: three memories apart

Three minutes. The same question asked twice, with three lab outcomes arriving in between, and the
recommendation changes from a three-step route to a two-step one for a reason you can point at. Then a run that
refuses to recommend anything.

## Before recording

```powershell
.\start-vesyn.ps1                                              # database, Hindsight, Ollama, ReactionT5, API
python scripts/seed_memories.py --restore                      # the bank without the lab report, in seconds
npm run dev --prefix frontend                                  # http://localhost:3100
```

`--restore` puts back `demo/bank-before.zip`, the seeded "before" bank kept in the repo. Seeding it from
scratch (`--reset --phase before`) costs one LLM call per memory - around 4 minutes on Groq, longer on a local
model - which is why the rehearsal path is a restore. After changing the seed, reseed once and `--save` again.

**The baseline carries no lesson about this target.** It holds both recorded investigations and the team's
process notes, but not the recorded runs' flagged steps, so the "before" ranking is the agents' own judgement and
the memory panel reads *0 applied*. That is deliberate, and `from_runs()` says why: a flagged step is a step
ReactionT5 disputed, and ReactionT5 runs again on the new target, so live validation reaches the same verdict
without any memory at all. Probing five relatives of gefitinib found no target whose recommendation a recalled
computational flag changed.

Also run **"Find a synthesis route for erlotinib"** once beforehand: it takes three search attempts (~8 minutes),
too long to wait for on camera. Scene 4 reopens it from the Search tab.

**Do not leave Ollama loaded while recording.** ReactionT5 and a resident 10 GB model compete for the same
machine: one forward check measured 2.3 s alone and 6.5-7.8 s with `qwen3:14b` resident, and that is the
difference between a gefitinib run taking ~90 s and taking ~5 minutes. For a recording, point both Hindsight
(`.env`) and Vesyn (`VESYN_LLM`) at a hosted model, e.g. Groq:

```powershell
$env:VESYN_LLM = "openai:openai/gpt-oss-20b"        # Vesyn's prose
$env:OPENAI_BASE_URL = "https://api.groq.com/openai/v1"
$env:OPENAI_API_KEY = "<your Groq key>"
ollama stop qwen3:14b                                # free the RAM ReactionT5 needs
```

Measured end to end on this machine, with Ollama doing both jobs: erlotinib 7.8 min, a gefitinib question
5.1-5.3 min, `--phase after` 5.3 min, `--restore` 22 s. Every one of those is minutes, not the seconds the
timings below imply, so **record the question and cut the wait** rather than filming a progress bar.

Rules for the whole video:

- **Name routes by their chemistry, never by number.** AiZynthFinder numbers routes per run; two runs of the same
  molecule have returned the same five routes under different numbers.
- **Say "simulated" when the lab report is on screen.** It is invented demo history; the UI marks it, and so should
  the voice-over.
- `--restore` between rehearsals: every run retains its own outcome, so the bank grows as you rehearse. The
  recalled count climbs (16 before, 34 after two takes); the lessons and the scores do not, because a gefitinib
  run has no step for the tools to flag.
- **Wait for `recall check: ... 3 flagged transformation(s)` before asking the second question.** If extraction
  is still queued behind a rate limit the seeder keeps polling and says so; asking early gives a smaller drop
  (one take landed 2 of 3 memories and the old favourite fell to 0.6446 instead of 0.4946). The flip still
  happens - the magnitude does not.

## The flow

| Time | Screen | Say |
|---|---|---|
| 0:00–0:20 | Overview, nothing selected | Drug discovery is iterative. Teams investigate a compound, reject routes, learn on scale-up which steps fail — then meet the same chemistry again. Most AI agents start every question from zero. |
| 0:20–0:40 | Search tab → *Find a synthesis route for gefitinib* | Vesyn is seven agents that plan and validate synthesis routes with real chemistry tools — and remember what they learned, in Hindsight. |
| 0:40–1:05 | Result: **Why this route?**, memory card | It recommends a three-step route that couples the aniline onto the quinazolinone, scoring 0.79. The memory card says sixteen memories recalled and **none of them applied** — nothing it has ever seen bears on these transformations. This is the system's own judgement. |
| 1:05–1:25 | Terminal: `python scripts/seed_memories.py --phase after` (~60 s) | Now process chemistry reports back — three *simulated* records for this demo. The coupling collapsed at 120 g, 68% to 31%. The acetate protecting group took the morpholine chain with it. The demethylation cleaved the side chain too. |
| 1:25–1:50 | Search → the same question again | Same question. Same five routes, same tools. |
| 1:50–2:25 | Result: route cards, memory card | The three-step route has gone from **0.79 to 0.49** and carries a red mark: *reuses a transformation flagged in an earlier investigation*, labelled SIMULATED. Four of the five routes are ranked down. The one that survives is the **two-step** route — two tiles instead of four — because it never touches any of them. It reaches the same bond by displacing the 4-chloroquinazoline, which is the route industry actually uses. |
| 2:25–2:40 | Memory card, **Why this route?** | Nothing about the chemistry changed. The tools validated these same five routes both times. What changed is that the team's experience is now in the bank, and it moved the answer. |
| 2:40–2:50 | Search tab → Recent → the erlotinib run | And when every route fails validation, it says so. Three search attempts, fifteen routes, no recommendation — instead of a confident wrong answer. |

## The verified numbers

Measured over two clean cycles (`--restore` → ask → `--phase after` → ask). Route *numbers* are assigned per
run, so name routes by their chemistry on camera; the scores and the ranking are what repeat.

| Route | Steps | Before | After | Why |
|---|---|---|---|---|
| quinazolinone coupling + acetate | 3 | **0.7946** ← recommended | **0.4946** | two flagged steps |
| the same, other O-alkylation | 3 | 0.7946 | 0.4946 | two flagged steps |
| **4-chloroquinazoline displacement** | **2** | 0.7791 | **0.7791** ← recommended | flagged by none |
| demethylation route | 3 | 0.7613 | 0.6113 | one flagged step |
| demethylation route, variant | 3 | 0.7613 | 0.6113 | one flagged step |

Memory panel: **16 recalled · 0 applied** before, **34 recalled · 6 applied, all SIMULATED** after.

The erlotinib run also recalls the flags it recorded the *last* time it was investigated, so every route there carries a memory mark and the scores sit near 0.16. That is the mechanism working, not a fault — say so if it is on screen, or stay on the refusal.
| 2:50–3:00 | Overview | Investigate, remember, recall, adapt. |

## What each screen should show

**First gefitinib run (before):** Research memory — 16 recalled, **0 applied**, "Nothing recalled applied to these
routes". Why this route? — the coupling route selected at 0.7946, with the two-step route visible just below it.

**Second gefitinib run (after):** Candidate routes — the former leader at 0.4946 carries *"Reuses a transformation
flagged in an earlier investigation"* with a **SIMULATED** badge, and so do three others. Research memory — the
ranked-down routes, each **SIMULATED**, with the scale-up text. Why this route? — *"Avoids a transformation flagged
in an earlier investigation."* Decision timeline — *"Critiqued 5 routes: no critical issues, 6 steps flagged by
earlier investigations."*

**Erlotinib:** Why this route? — "None recommended", with the evaluator's own reason.

## If something is off

| Symptom | Cause | Fix |
|---|---|---|
| The recommendation does not change | the lab report is not stored, or a re-recorded run changed the routes | `seed_memories.py` checks both and says which; rerun it and read its flip check |
| A run takes ~5 minutes instead of ~90 s | a local model is resident, starving ReactionT5 | `ollama stop qwen3:14b`, or point `VESYN_LLM` and `.env` at a hosted model |
| The dashboard shows an older project | the browser remembers the last project you chose (`sessionStorage`) | pick the run in the header, or ask the question from the UI, which follows the new run |
| Memory panel: "Unreachable" | Hindsight is down | `docker compose up -d hindsight`; `docker logs vesyn_hindsight` |
| Seeding stalls at *n*/13 | Groq's per-minute or daily token limit | it resumes by itself on the per-minute limit; for the daily one, switch `HINDSIGHT_API_LLM_MODEL` in `.env` (see `.env.example`) and restart Hindsight |
| Steps read "not forward-checked" | ReactionT5 is down | start it (`start-vesyn.ps1` does); scores change without it |
| The site shows **SIMULATED** in a banner | the API is not reachable from the browser | the offline recording is playing; start the backend, or use it deliberately for an offline demo |
