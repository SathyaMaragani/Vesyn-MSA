"use client";

// FINDINGS: what a review of the documents concluded, grouped, with the brief and the comparison to the last review.
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { BASE, type Diff, type Finding, get, type Investigation, minute, post, type Project } from "./api";
import { Badge, button, buttonQuiet, Card, ErrorNote, input, label } from "./ui";

const ORDER = {
  category: ["scalability", "recurring_failures", "supply_safety", "open_question"],
  severity: ["high", "medium", "low"],
  evidence_status: ["conflicting", "supported", "fix_unverified", "not_established", "resolved"],
};
type GroupBy = keyof typeof ORDER;
type Panel = { kind: "brief"; text: string } | { kind: "diff"; diff: Diff } | null;

function FindingRow({ f, onOpen }: { f: Finding; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(f.id)} className="nc-focus group flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-2 text-left hover:bg-nc-cyan/[0.06]">
        <span className="min-w-0 flex-1 basis-[340px] text-[12.5px] leading-snug text-nc-hi">{f.claim}</span>
        <span className="font-data text-[10.5px] text-nc-lo">{f.service}</span>
        <Badge value={f.severity} prefix="severity: " />
        <Badge value={f.evidence_status} prefix="evidence: " />
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-nc-lo transition-transform group-hover:translate-x-0.5 group-hover:text-nc-cyan" aria-hidden />
      </button>
      {f.changes?.map((c) => (
        <p key={c.field} className="px-2 font-data text-[10.5px] text-nc-mid">
          {label(c.field)}: {label(c.from)} → {label(c.to)}
        </p>
      ))}
      {f.change_reason && <p className="px-2 pb-1.5 text-[11.5px] leading-snug text-nc-lo">Changed: {f.change_reason}</p>}
    </li>
  );
}

export default function Findings({ project, model, onOpen }: { project: Project; model: string; onOpen: (id: string) => void }) {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [invId, setInvId] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [running, setRunning] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState("");

  const fail = (e: unknown) => setError((e as Error).message);
  const inv = investigations.find((i) => i.id === invId);

  const loadInvestigations = useCallback(
    (select?: string) =>
      get<Investigation[]>(`/projects/${project.id}/investigations`)
        .then((list) => {
          setInvestigations(list);
          setInvId((current) => select ?? (current || list.find((i) => i.status === "complete")?.id || ""));
        })
        .catch(fail),
    [project.id],
  );
  useEffect(() => void loadInvestigations(), [loadInvestigations]);

  useEffect(() => {
    setPanel(null);
    if (!invId) return setFindings([]);
    get<Finding[]>(`/investigations/${invId}/findings`).then(setFindings).catch(fail);
  }, [invId]);

  async function run() {
    setRunning(true);
    setError("");
    try {
      const created = await post<Investigation>(`/projects/${project.id}/investigations`, { model: model || null });
      if (created.status === "failed") setError(`Review failed: ${created.error}`);
      await loadInvestigations(created.status === "complete" ? created.id : undefined);
    } catch (e) {
      fail(e);
    }
    setRunning(false);
  }

  const showBrief = () =>
    get<string>(`/investigations/${invId}/brief`)
      .then((text) => setPanel({ kind: "brief", text }))
      .catch(fail);
  const showDiff = () =>
    get<Diff>(`/investigations/${invId}/compare`)
      .then((diff) => setPanel({ kind: "diff", diff }))
      .catch(fail);

  const groups = ORDER[groupBy]
    .map((value) => ({ value, items: findings.filter((f) => f[groupBy] === value) }))
    .filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      <Card
        title={`Findings${findings.length ? ` (${findings.length})` : ""}`}
        aside={
          <>
            <select aria-label="Review" className={input} value={invId} onChange={(e) => setInvId(e.target.value)}>
              {investigations.length === 0 && <option value="">no review yet</option>}
              {investigations.map((i) => (
                <option key={i.id} value={i.id}>
                  {minute(i.created_at)} ({i.status})
                </option>
              ))}
            </select>
            <select aria-label="Group findings by" className={input} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
              <option value="category">by area</option>
              <option value="severity">by severity</option>
              <option value="evidence_status">by evidence</option>
            </select>
            <button type="button" className={button} onClick={run} disabled={running}>
              <Play className="h-3.5 w-3.5" aria-hidden /> {running ? "Reviewing" : "Run review"}
            </button>
          </>
        }
      >
        <ErrorNote message={error} />
        {running && <p className="text-[11.5px] leading-snug text-nc-lo">One model call per review area. Hosted models take a minute or two, longer when a free tier rate-limits; local models can take several minutes per area.</p>}
        {inv && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-data text-[10.5px] text-nc-lo">
              {inv.source_snapshot.length} sources · {inv.model} · prompt {inv.prompt_version}
              {inv.error && ` · ${inv.error}`}
            </span>
            <span className="ml-auto flex gap-2">
              <button type="button" className={buttonQuiet} onClick={showBrief} disabled={inv.status !== "complete"}>
                Generate brief
              </button>
              <button type="button" className={buttonQuiet} onClick={showDiff} disabled={!inv.previous_id || inv.status !== "complete"}>
                Compare with previous review
              </button>
            </span>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.value} className="mt-3">
            <div className="nc-label border-t border-nc-line pt-2">
              {label(g.value)} ({g.items.length})
            </div>
            <ul className="-mx-1 mt-1 space-y-0.5">
              {g.items.map((f) => (
                <FindingRow key={f.id} f={f} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        ))}
        {invId && findings.length === 0 && <p className="text-[12px] text-nc-lo">This review has no findings.</p>}
        {!invId && <p className="text-[12px] text-nc-lo">Nothing reviewed yet. Upload documents below, then run a review.</p>}
        <p className="mt-3 text-[11px] leading-snug text-nc-lo">
          Severity is the potential impact if the risk is real. Evidence says what the sources establish; “not established” means not established from the available documents.
        </p>
      </Card>

      {panel?.kind === "diff" && (
        <Card title="Changes since the previous review" lit>
          {(["resolved", "updated", "added", "removed"] as const).map((bucket) => (
            <div key={bucket} className="mt-2">
              <div className="nc-label border-t border-nc-line pt-2">
                {bucket} ({panel.diff[bucket].length})
              </div>
              <ul className="-mx-1 mt-1 space-y-0.5">
                {panel.diff[bucket].map((f) => (
                  <FindingRow key={f.id} f={f} onOpen={onOpen} />
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-3 font-data text-[10.5px] text-nc-lo">{panel.diff.unchanged.length} findings unchanged</p>
        </Card>
      )}

      {panel?.kind === "brief" && (
        <Card
          title="Brief (Markdown)"
          aside={
            <a className={buttonQuiet} href={`${BASE}/investigations/${invId}/brief`} download={`brief-${invId}.md`}>
              Download .md
            </a>
          }
        >
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-nc-panel-2 p-3 font-data text-[11px] leading-relaxed text-nc-mid">{panel.text}</pre>
        </Card>
      )}
    </div>
  );
}
