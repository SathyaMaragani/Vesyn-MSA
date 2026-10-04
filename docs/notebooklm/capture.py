"""Capture the real VESYN assistant in a headless Edge over the DevTools protocol.

How docs/notebooklm/screenshots/ was made. Start the backend and the production frontend, start a
headless Edge with DevTools on port 9333, then run the phases in this order:

    msedge --headless=new --remote-debugging-port=9333 --remote-allow-origins=* ^
           --user-data-dir=<a fresh, empty folder> --window-size=390,844 --force-device-scale-factor=3 ^
           --hide-scrollbars --no-first-run --disable-extensions --use-fake-ui-for-media-stream ^
           --use-fake-device-for-media-stream about:blank
    python capture.py run        # 02, live progress frames, completion banner (one real research run)
    python capture.py results    # 06 08 08b 11 (and a follow-up question: see README, not used)
    python capture.py camera     # 15 15b
    python capture.py screens    # 07 12 01 01b
    python capture.py voice      # 14
    python capture.py continue   # 13
    python capture.py demo       # 09 10 (the recorded guided demo; needs no backend)

Every screenshot is the live app at http://127.0.0.1:3100 (the production build), 390x844 CSS px
at 3x density, mobile + touch emulation, a fresh browser profile. Nothing on the page is altered:
taps go through the app's own handlers, text arrives through Input.insertText.
"""
import base64
import json
import pathlib
import sys
import tempfile
import time
import urllib.request

import websocket

PORT = 9333
BASE = "http://127.0.0.1:3100"
OUT = pathlib.Path(__file__).parent / "screenshots"
# frames that are not final shots (progress, the banner) land here; pick from them by hand
SCRATCH = pathlib.Path(tempfile.gettempdir()) / "vesyn-capture"
UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"
LOG = SCRATCH / "log.jsonl"


def log(**kw):
    SCRATCH.mkdir(parents=True, exist_ok=True)
    kw["t"] = time.strftime("%H:%M:%S")
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(kw, ensure_ascii=False) + "\n")
    print(json.dumps(kw, ensure_ascii=False))


class Tab:
    def __init__(self):
        targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
        page = next(t for t in targets if t["type"] == "page")
        self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=180, suppress_origin=True)
        self.n = 0
        # emulation lives as long as this connection, so every phase sets it again
        self.send("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
        self.send("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=5)
        self.send("Emulation.setUserAgentOverride", userAgent=UA, platform="Android")
        self.send("Page.enable")

    def send(self, method, **params):
        self.n += 1
        mid = self.n
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def js(self, expr):
        r = self.send("Runtime.evaluate", expression=expr, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", r["exceptionDetails"]))
        return r.get("result", {}).get("value")

    def wait(self, cond, timeout=30.0, every=0.25):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.js(f"!!({cond})"):
                    return True
            except Exception:
                pass
            time.sleep(every)
        return False

    def has(self, text, timeout=30.0):
        return self.wait(f"document.body && document.body.innerText.includes({json.dumps(text)})", timeout)

    def go(self, path, ready=None, timeout=40.0):
        self.send("Page.navigate", url=BASE + path)
        self.wait(f"location.pathname === {json.dumps(path)} && document.readyState === 'complete'", timeout)
        if ready and not self.has(ready, timeout):
            raise RuntimeError(f"{path}: never showed {ready!r}")

    def click(self, label):
        """The visible button/link whose text or aria-label contains `label`."""
        ok = self.js(
            f"""(() => {{
              const want = {json.dumps(label)};
              const els = [...document.querySelectorAll('button, a, summary, [role=button]')]
                .filter(e => e.offsetParent !== null && !e.disabled);
              const el = els.find(e => (e.innerText || '').includes(want)) || els.find(e => (e.getAttribute('aria-label') || '').includes(want));
              if (!el) return false;
              el.click();
              return true;
            }})()"""
        )
        if not ok:
            raise RuntimeError(f"nothing clickable labelled {label!r}")

    def type(self, selector, text):
        self.js(f"document.querySelector({json.dumps(selector)}).focus()")
        self.send("Input.insertText", text=text)

    def top_of(self, expr, gap=10):
        """Scroll so the element `expr` sits just under the sticky top bar."""
        self.js(
            f"""(() => {{
              const el = {expr}; if (!el) return;
              const bar = document.querySelector('.m-top');
              const h = bar ? bar.getBoundingClientRect().height : 0;
              window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - h - {gap});
            }})()"""
        )
        time.sleep(0.5)

    def shot(self, name, dest=OUT):
        dest.mkdir(parents=True, exist_ok=True)
        time.sleep(0.4)  # let any transition settle
        data = self.send("Page.captureScreenshot", format="png", captureBeyondViewport=False)["data"]
        path = dest / name
        path.write_bytes(base64.b64decode(data))
        log(shot=str(path))
        return path

    def rows(self):
        return self.js(
            "[...document.querySelectorAll('section[aria-label=\"Investigation\"] li')].map(li => li.innerText.replace(/\\s*\\n\\s*/g, ' | '))"
        ) or []


LAST_USER = "[...document.querySelectorAll('main .justify-end')].pop()"


# --- phases ---------------------------------------------------------------------------------------


def phase_run():
    """Ask from Home, then watch the live run: progress frames, the completion banner, the result."""
    t = Tab()
    t.go("/assistant", ready="Connected", timeout=60)
    t.has("Continue research", 30)
    t.type("#m-ask", "Find a synthesis route for gefitinib")
    t.js("window.scrollTo(0, 0)")
    t.shot("02-research-input.png")

    t.click("Send")
    t.wait("location.pathname === '/assistant/research'", 20)
    # the run has begun once this screen shows the new thread working
    t.has("· working", 90)
    start = time.time()
    seen_banner = False
    frame = 0
    while time.time() - start < 900:
        rows = t.rows()
        banner = t.js("[...document.querySelectorAll('[role=status]')].map(e => e.innerText).find(s => s.includes('— complete.') || s.includes('— the run failed.')) || null")
        done = t.js("document.body.innerText.includes('routes found') || document.body.innerText.includes('This run failed')")
        if banner and not seen_banner:
            seen_banner = True
            t.js("window.scrollTo(0, 0)")
            t.shot(f"notification-{frame:02d}.png", SCRATCH)
            log(event="banner", text=banner, elapsed=round(time.time() - start))
        if not done:
            t.top_of(LAST_USER)
            t.shot(f"progress-{frame:02d}.png", SCRATCH)
            log(event="progress", frame=frame, elapsed=round(time.time() - start), rows=rows)
            frame += 1
        if done and seen_banner:
            break
        time.sleep(2.0)
    time.sleep(1.5)
    t.top_of(LAST_USER)
    t.shot("result.png", SCRATCH)
    log(event="done", elapsed=round(time.time() - start), headline=t.js("(document.querySelector('section[aria-label=\"Investigation\"] .m-card p') || {}).innerText || null"))


def phase_results():
    """On the finished live run: memory recall, routes, the decision, and a follow-up to the LLM."""
    t = Tab()
    t.go("/assistant/research", ready="routes found", timeout=60)

    t.click("previous experience")  # the memory recall card opens
    t.has("Experience 1", 10)
    t.top_of("[...document.querySelectorAll('main .m-card')].find(c => c.innerText.includes('Experience 1'))")
    t.shot("06-memory-recall.png")
    t.click("previous experience")  # fold it again

    t.click("View routes")
    t.wait("document.querySelector('article.m-card-lit')", 10)
    t.top_of("document.querySelector('article.m-card-lit')")
    t.shot("08-route-results.png")
    t.top_of("[...document.querySelectorAll('article')].find(a => a.innerText.includes('0.4946'))")
    t.shot("08b-route-results-ranked-down.png")
    t.click("Hide routes")

    t.click("Why this decision?")
    t.has("What decided it", 10)
    t.shot("11-decision-explanation.png")
    t.js("(() => { const d = document.querySelector('dialog[open] .overflow-y-auto'); if (d) d.scrollTop = d.scrollHeight; })()")
    t.shot("11b-decision-agent-verdicts.png")
    t.click("Close")
    time.sleep(0.6)

    question = "Why did memory change the recommendation?"
    t.type("#m-ask", question)
    t.click("Send")
    t.has(question, 10)
    t.wait("!document.body.innerText.includes('Thinking…')", 150)
    time.sleep(1.0)
    t.top_of(LAST_USER)
    t.shot("03-llm-chat.png")
    reply = t.js("(() => { const b = [...document.querySelectorAll('main .justify-start')].pop(); return b ? b.innerText : null; })()")
    log(event="follow-up", question=question, reply=reply)


def phase_screens():
    t = Tab()
    t.go("/assistant/memory", ready="What VESYN remembers")
    t.js("window.scrollTo(0, 0)")
    t.shot("07-memory-detail.png")
    t.go("/assistant/history", ready="Research history")
    t.js("window.scrollTo(0, 0)")
    t.shot("12-history.png")
    t.go("/assistant", ready="Connected", timeout=60)
    t.has("Recent memory", 20)
    t.js("window.scrollTo(0, 0)")
    t.shot("01-home.png")
    t.js("window.scrollTo(0, document.body.scrollHeight)")
    t.shot("01b-home-continue-and-memory.png")


def phase_continue():
    """Reopen an earlier investigation from History and start carrying it on."""
    t = Tab()
    t.go("/assistant/history", ready="Research history")
    t.click("Find a synthesis route for erlotinib")
    t.wait("location.pathname === '/assistant/research'", 20)
    t.has("erlotinib", 30)
    t.wait("document.querySelector('section[aria-label=\"Investigation\"] .m-card')", 30)
    time.sleep(1.5)
    t.type("#m-ask", "Continue my erlotinib research")
    t.top_of(LAST_USER)
    t.shot("13-continue-research.png")
    t.js("(() => { const i = document.querySelector('#m-ask'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); })()")


def phase_demo():
    t = Tab()
    t.go("/assistant/research", ready="Start guided demo", timeout=60)
    t.click("Start guided demo")
    t.has("Before memory", 20)
    t.has("routes found", 20)
    t.js("window.scrollTo(0, 0)")
    t.shot("09-before-memory.png")
    t.click("Recall experiences & compare")
    t.has("0.4946", 20)
    t.js("window.scrollTo(0, 0)")
    t.shot("10-after-memory.png")
    t.click("Exit demo")
    time.sleep(1.0)


def phase_voice():
    t = Tab()
    t.go("/assistant", ready="Connected", timeout=60)
    supported = t.js("!!(window.SpeechRecognition || window.webkitSpeechRecognition)")
    log(event="voice", speech_api=supported)
    if not supported:
        return
    t.js("window.scrollTo(0, 0)")
    t.click("Ask by voice")
    # the label is CSS-uppercased, and innerText reports what is rendered
    listening = t.wait("document.body.innerText.toUpperCase().includes('LISTENING')", 3)
    log(event="voice", listening=listening)
    t.shot("14-voice.png" if listening else "voice-attempt.png", OUT if listening else SCRATCH)
    msg = t.js("(() => { const f = document.querySelector('form'); return f ? f.innerText : null; })()")
    log(event="voice", form_text=msg)
    try:
        t.click("Stop listening")
    except RuntimeError:
        pass


def phase_camera():
    t = Tab()
    t.go("/assistant/research", ready="routes found", timeout=60)
    image = SCRATCH / "gefitinib-structure.png"
    if not image.exists():  # a real structure to photograph: gefitinib, drawn by RDKit
        from rdkit import Chem
        from rdkit.Chem import Draw
        SCRATCH.mkdir(parents=True, exist_ok=True)
        Draw.MolToFile(Chem.MolFromSmiles("COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1"), str(image), size=(720, 480))
    image = str(image)
    root = t.send("DOM.getDocument", depth=1)["root"]["nodeId"]
    node = t.send("DOM.querySelector", nodeId=root, selector="input[type=file]")["nodeId"]
    t.send("DOM.setFileInputFiles", files=[image], nodeId=node)
    t.wait("document.querySelector('form img')", 10)
    t.js("window.scrollTo(0, document.body.scrollHeight)")
    t.shot("15-camera.png")
    t.type("#m-ask", "What is this structure?")
    t.click("Send")
    t.has("no vision endpoint", 15)
    time.sleep(0.8)
    t.top_of(LAST_USER)
    t.shot("15b-camera-reply.png")


if __name__ == "__main__":
    {"run": phase_run, "results": phase_results, "screens": phase_screens, "continue": phase_continue,
     "demo": phase_demo, "voice": phase_voice, "camera": phase_camera}[sys.argv[1]]()
