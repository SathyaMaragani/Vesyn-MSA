"use client";

import { useEffect, useState } from "react";
import { useNeo, type DemoSnapshot } from "@/lib/store/NeoProvider";
import { compareDemo } from "@/lib/mobile/demo";

export function DemoStory() {
  const { demoStage, demo, showDemo } = useNeo();
  const [comparison, setComparison] = useState<ReturnType<typeof compareDemo>>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (demoStage !== "after" || !demo?.run.result) return;
    let cancelled = false;
    void fetch("/demo/before.json").then((r) => r.json()).then((before: DemoSnapshot) => {
      if (!cancelled && before.run.result && demo.run.result) setComparison(compareDemo(before.run.result, demo.run.result));
    }).catch(() => { if (!cancelled) setError("The comparison could not load. Try restarting the demo."); });
    return () => { cancelled = true; };
  }, [demoStage, demo]);
  const open = async (stage: "before" | "after" | null) => {
    setBusy(true);
    setError("");
    try { await showDemo(stage); }
    catch { setError("The recorded demo could not load. Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <section aria-label="Memory demo" className="m-card m-demo-story mb-5 space-y-3 px-4 py-4">
      <div className="m-label text-nc-cyan">{demoStage ? "Demo data · Gefitinib" : "See memory change a decision"}</div>
      <p className="text-[13px] leading-relaxed text-nc-mid">
        {!demoStage ? "Replay the same research question before and after three simulated research experiences. No live run needed."
          : demoStage === "before" ? "Before memory: five routes evaluated. Based on the research information available at the time, the 3-step route received the highest evaluation."
          : "Recommendation changed. The question didn’t change. VESYN’s experience did."}
      </p>
      {demoStage === "after" && comparison && (
        <div role="status" className="space-y-2">
          <p className="font-data text-[24px] text-nc-hi">{comparison.previous.toFixed(4)} <span className="text-nc-lo">→</span> {comparison.changed.toFixed(4)}</p>
          <p className="text-[12px] text-nc-mid">Previous route ranked down. Recommended: {comparison.steps}-step route · {comparison.recommended.toFixed(4)}.</p>
          <p className="text-[12px] text-nc-cyan">{comparison.experiences} relevant simulated experiences affected the ranking.</p>
        </div>
      )}
      {demoStage && <p className="font-data text-[10px] text-nc-warn">SIMULATED RESEARCH OUTCOME · No laboratory measurements. Scores are ranking heuristics.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="m-primary" onClick={() => void open(demoStage === "before" ? "after" : "before")}>
          {busy ? "Loading recording…" : demoStage === "before" ? "Recall experiences & compare" : demoStage ? "Replay from the beginning" : "Start guided demo"}
        </button>
        {demoStage && <button type="button" disabled={busy} className="m-chip" onClick={() => void open(null)}>Exit demo</button>}
      </div>
      {error && <p role="alert" className="text-[12px] text-nc-warn">{error}</p>}
    </section>
  );
}
