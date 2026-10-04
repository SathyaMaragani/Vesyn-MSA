# Shot list for NotebookLM

The recommended order, one beat per screenshot. All files are in [`screenshots/`](screenshots/). The
notes in [README.md](README.md) explain what is live, what is recorded and what is simulated. Read them
before writing narration.

| # | Beat | File | Show / say |
|---|---|---|---|
| 1 | **Home** | `01-home.png`, `01b-home-continue-and-memory.png` | VESYN on a phone: *"Your AI research assistant"*. One field to ask in, plus a mic and a camera. Earlier research and recent memory sit underneath. |
| 2 | **Research input** | `02-research-input.png` | The user types a question in plain words: *"Find a synthesis route for gefitinib."* |
| 3 | **LLM chat** | `03-llm-chat.png` | VESYN answers: *"5 routes found. I recommend the 2-step route."*, with its reasons. The LLM read the request and wrote the report. The headline and reasons come from the agents' own checks. |
| 4 | **Agent workflow** | `04-agent-workflow.png` | Behind the conversation, a team: Orchestrator, Researcher, Memory, Retrosynthesis, Validator, Critic, Replanner, Evaluator, each with its own job. |
| 5 | **Research in progress** | `05-research-progress.png` | Live work: *"24 experiences recalled"*, *"Generating candidate routes…"*. The run took about a minute. |
| 6 | **Memory recall** | `06-memory-recall.png` | *"3 previous experiences changed the ranking."* Each one is labelled **SIMULATED**, the demo's invented lab history. |
| 7 | **Memory detail** | `07-memory-detail.png` | One experience in full: the 120 g scale-up whose yield fell from 68 % to 31 % (**simulated**), the routes it ranked down, where it came from, and when it was recalled. Quote "3" from beat 6, not this screen's tiles. |
| 8 | **Route results** | `08-route-results.png`, `08b-route-results-ranked-down.png` | The recommended 2-step route at **0.7791**, which no past experience affects, then the 3-step routes ranked down to **0.4946** because they reuse the flagged transformation. |
| 9 | **Before memory** | `09-before-memory.png` | Recorded demo, labelled DEMO DATA. Before the experiences, the same question recommended the **3-step route at 0.7946**. 16 memories recalled, none applied. |
| 10 | **After memory** | `10-after-memory.png` | Same question, after the experiences: **0.7946 → 0.4946**, and the **2-step route at 0.7791** takes over. *"The question didn't change. VESYN's experience did."* |
| 11 | **Decision explanation** | `11-decision-explanation.png` | *Why this decision?*: the checks that decided it, *"Avoids a transformation flagged in an earlier investigation"* (**SIMULATED**), and each agent's verdict. Say "the 2-step route", not "route 0". |
| 12 | **History** | `12-history.png` | Every investigation is kept, grouped by day: today's, and one from six days ago. |
| 13 | **Continue research** | `13-continue-research.png` | Reopen the erlotinib investigation from six days ago and carry it on: *"Continue my erlotinib research."* The question is shown typed, not sent. |
| 14 | **Voice** | `14-voice.png` | Tap the mic: VESYN is **LISTENING…**. The capture had no real microphone, so no words appear. |
| 15 | **Camera** | `15-camera.png`, `15b-camera-reply.png` | Photograph a structure. The image attaches and previews. **Reading the structure from the image is NOT IMPLEMENTED**: VESYN says it has no vision endpoint and sends nothing. Show the honest reply, not a recognised structure. |
| 16 | **Notification** | `16-notification.png` | The run finishes while you are elsewhere in the app: *"Find a synthesis route for gefitinib — complete."* The in-app notice is implemented. **Push notifications to a closed app are NOT IMPLEMENTED.** |

**Not implemented, and not shown as if it were:**

- reading chemistry from a photo (15);
- push notifications while the app is closed (16);
- a reliable follow-up chat about memory (README note 3).

## The narrative

THE USER:

Opens VESYN on a smartphone.

THE LLM:

Understands a natural-language research request.

THE AGENTS:

Perform specialized research, retrosynthesis, validation and evaluation.

THE MEMORY:

Hindsight recalls relevant previous research experiences.

THE REASONING:

The LLM incorporates those experiences into the current decision.

THE RESULT:

The user receives an understandable route recommendation on mobile.

THE CONTINUITY:

The research session can be revisited later.

Core message:

"VESYN puts a persistent AI research assistant in your pocket."

### Accuracy notes on the narrative

Most beats match what the app does. Two need care, or the video will claim something the product does
not do:

- **THE REASONING is not the LLM.** The experiences change the decision through the **Critic agent**. It
  attaches each recalled lesson to the step that reuses the flagged transformation, and the score drops
  by 0.15 for each such step. The LLM explains the outcome; it does not make it. More accurate wording:
  *"The Critic weighs those experiences against every route, and the recommendation changes — then VESYN
  explains why."*
- **THE MEMORY recalls simulated experiences in this demo.** Hindsight and the recall are real. The three
  experiences that change the decision are invented demo history, labelled SIMULATED in the app. Say
  "simulated" when they are on screen.

The other beats match what the app does:

- THE LLM is accurate: it read this request (`prompt.interpret`, `llm:openai:openai/gpt-oss-120b`).
- THE AGENTS is accurate: seven named agents, shown in 04.
- THE RESULT and THE CONTINUITY are accurate: 03, 08, 11, 12 and 13.
