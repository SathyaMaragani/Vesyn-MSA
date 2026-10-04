# VESYN mobile: screenshot pack for NotebookLM

Screenshots of the **real VESYN mobile assistant**, for NotebookLM to use as visual references for a
product demo video. Nothing here is a mockup. Every image is the running production build, either during
a live research run against the real backend or replaying a recorded run in the app's own guided demo.

For the order to use them in, see [SHOTLIST.md](SHOTLIST.md).

## How they were captured

| | |
|---|---|
| App | VESYN assistant at `http://127.0.0.1:3100/assistant`, a production build (`npm run build` then `npm run start:mobile`) |
| Viewport | **390 × 844** CSS px at 3× density, so every PNG is **1170 × 2532**. Mobile and touch emulation, an Android Chrome user agent |
| Browser | Headless Microsoft Edge 154 driven over the DevTools protocol, with a fresh, empty profile. There is no browser chrome, cursor, address bar or devtools in any image |
| Backend | Real: API, LangGraph agents, AiZynthFinder, ReactionT5, RDKit, Hindsight memory, and the LLM `openai/gpt-oss-120b` on Groq |
| Memory | Hindsight set to the demo's documented state first (`docs/DEMO.md`: `--restore`, then `--phase after`) |
| Date | 2026-10-04 |

Taps go through the app's own handlers and text is typed through the browser's input system. No page
content was edited. [`capture.py`](capture.py) is the script that took them.

## The pack

| File | Screen | What it demonstrates | Available |
|------|--------|----------------------|-----------|
| `01-home.png` | Home | VESYN branding and positioning, the ask bar with mic and camera, example questions, Continue research, bottom navigation | Yes |
| `01b-home-continue-and-memory.png` | Home, scrolled | Recent sessions with their recalled-memory counts, and Recent memory | Yes |
| `02-research-input.png` | Home | A natural-language question typed in: *"Find a synthesis route for gefitinib"* (the app's own example) | Yes |
| `03-llm-chat.png` | Research | The request and VESYN's answer: *"5 routes found. I recommend the 2-step route."*, with its reasons and *report by openai:openai/gpt-oss-120b* | Yes, see note 3 |
| `04-agent-workflow.png` | Research, live | Seven agents and memory in one view, six finished and the Evaluator *choosing the best route* | Yes |
| `05-research-progress.png` | Research, live | Mid-run: memory has recalled 24 experiences and Retrosynthesis is *generating candidate routes* | Yes |
| `06-memory-recall.png` | Research | *"3 previous experiences changed the ranking"*, opened: each experience, marked **SIMULATED**, and the routes it ranked down | Yes |
| `07-memory-detail.png` | Memory | *What VESYN remembers*: an experience with its impact, source and when it was recalled | Yes, see note 5 |
| `08-route-results.png` | Research | Route cards: the recommended 2-step route at **0.7791** with no memory impact, then the alternatives | Yes |
| `08b-route-results-ranked-down.png` | Research | The two 3-step routes at **0.4946**, each marked *reuses a transformation flagged in an earlier investigation* · **SIMULATED** | Yes |
| `09-before-memory.png` | Research, guided demo | **Before**: the 3-step route recommended at **0.7946**, 16 memories recalled, none applied. Labelled **DEMO DATA** and **SIMULATED RESEARCH OUTCOME** | Yes, recorded run |
| `10-after-memory.png` | Research, guided demo | **After**: *"Recommendation changed"*, **0.7946 → 0.4946**, the 2-step route at **0.7791**, 3 simulated experiences | Yes, recorded run |
| `11-decision-explanation.png` | Research, sheet | *Why this decision?*: what decided it, and each agent's verdict, memory included | Yes |
| `12-history.png` | History | Investigations grouped by day (*Today*, *6 days ago*) with status and recalled-memory counts | Yes |
| `13-continue-research.png` | Research | An investigation from 6 days ago (erlotinib) reopened, with *"Continue my erlotinib research"* typed in | Yes, typed, not sent |
| `14-voice.png` | Home | The mic tapped: the button turns to *stop* and the bar shows **LISTENING…** | Yes, see note 6 |
| `15-camera.png` | Research | A structure image attached through the camera button, with its preview in the ask bar | Partial, see note 7 |
| `15b-camera-reply.png` | Research | VESYN's real reply to that image: it has no vision endpoint yet, so the photo was not sent | Partial, see note 7 |
| `16-notification.png` | Research | The in-app completion notice: *"Find a synthesis route for gefitinib — complete."* | Partial, see note 8 |

## Read this before generating the video

**1. Two sources of data, both real.**

- **Live:** 02–08b, 11, 16 and 03 come from one live research run (`run_a22d592ccd53`, 65 s, 0 failed
  tool calls).
- **Recorded:** 09 and 10 replay two earlier recorded runs (`run_6596ab312928` before,
  `run_46079a25cd34` after), through the app's guided demo, which is labelled DEMO DATA.

The live run reproduced the demo's headline numbers: 2-step route **0.7791** recommended, 3-step routes
**0.4946**, every applied lesson simulated. One alternative route differs. It scored **0.7613** live,
against **0.6113** in the recording, because AiZynthFinder returned a variant of it that the
demethylation lesson did not match.

**2. The lab results are simulated.** The three experiences that change the decision are invented demo
history: a 120 g scale-up whose yield fell from 68 % to 31 %, an acetate protecting group that took the
side chain with it, and a demethylation that cleaved it. They were seeded by `scripts/seed_memories.py`
and are tagged in the memory bank. The app marks them **SIMULATED** wherever they appear, and the video
should say so too. No laboratory measurement is shown anywhere.

**3. What the LLM does and does not do.** In the live run, the LLM (`openai/gpt-oss-120b`):

- read the request and identified the task and the molecule. The audit log records
  `prompt.interpret → {"task": "retrosynthesis", "molecule": "gefitinib", "method": "llm:openai:openai/gpt-oss-120b"}`;
- wrote the run's report.

The short answer in 03 is not LLM prose. Its headline and reasons are assembled from the agents' own
checks, so they cannot drift from the evidence. **The decision change itself is not made by the LLM
either.** The Critic agent attaches each recalled lesson to the matching step, and scoring takes 0.10
plus 0.05 off the route for each flagged step.

**A follow-up chat exists but is not in this pack.** We asked the Critic, *"Why did memory change the
recommendation?"*. It answered fluently and wrongly. It described components VESYN does not have and
said nothing about the run. The cause is a backend bug: the chat endpoint shows an agent only the first
30 events of a run, which for the Critic are just task placeholders. It is filed for fixing. Do not
present the follow-up chat as working until that fix lands.

**4. The look is light, not black and gold.** VESYN's mobile app now uses a light theme: porcelain
background, white surfaces, slate text and deep teal actions. That was a deliberate redesign, and these
screenshots show the app as it really is. If the video prompt describes "black, graphite and metallic
gold", it will not match these images. Describe the light theme, or ask for the old palette to be
restored first. The laptop dashboard is still dark.

**5. 07's counts are partial.** The run recalled 24 memories but sent only 12 of them to the device.
The Memory screen lists and counts only what the device received. It shows 2 experiences that
*changed a ranking*, both about the coupling, where the run itself (06) says **3**. Use 06's figure.

**6. Voice is real; the words are not shown.** The capture browser had no microphone, so speech
recognition really started (LISTENING…) on a simulated audio device and transcribed nothing. On a phone,
what you say fills the field. Voice uses the browser's Web Speech API; where that is missing, the mic
button does not appear.

**7. Camera: capture works; image understanding is NOT IMPLEMENTED.** The camera button opens the
device camera or photo picker and previews the image. The backend has no vision endpoint, so VESYN says
so and sends nothing (15b). The image in 15 is an RDKit drawing of gefitinib, attached through the app's
real file input, because the capture browser has no camera. Do not show VESYN reading a structure from
a photo.

**8. Notifications: in-app only.** 16 is the real completion notice, shown on whichever screen you are
on for 8 seconds. A system notification also fires if the user allows it, but it is outside the page,
so it is not captured here. **Push notifications to a closed app are NOT IMPLEMENTED.**

**9. Route numbers appear on screen.** For example *"Route 0: 2 step(s)…"* in 11. These come from
AiZynthFinder and change between runs. Narrate routes by their chemistry ("the 2-step route"), never
by number.

**10. History holds other real runs from the same day.** That includes one made before the memory reset
(*45 memories recalled*) and one made while memory was offline. Nothing was removed from History for
these shots.

## Reproducing

```powershell
docker compose up -d db hindsight
.\venv-t5\Scripts\python.exe -m uvicorn --app-dir backend/forward_model_service main:app --host 127.0.0.1 --port 8435
# API on a hosted LLM, as docs/DEMO.md advises for recordings (key from your .env; never commit it)
$env:VESYN_LLM = "openai:openai/gpt-oss-120b"; $env:OPENAI_BASE_URL = "https://api.groq.com/openai/v1"; $env:OPENAI_API_KEY = "<Groq key>"
& "$env:USERPROFILE\.conda\envs\retrosynth\python.exe" -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8436
python scripts/seed_memories.py --restore; python scripts/seed_memories.py --phase after
npm run build --prefix frontend; npm run start:mobile --prefix frontend
```

Then follow the header of [`capture.py`](capture.py). The memory bank as it stood before the reset is
backed up at `logs/bank-backup-2026-10-04.zip`, and `seed_memories.py --restore <that file>` puts it back.
