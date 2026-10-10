"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  type Answer,
  BASE,
  day,
  type Diff,
  type Finding,
  get,
  type Investigation,
  minute,
  post,
  type Project,
  where,
} from "./api";
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
    <li className="border-t border-slate-100 py-2 first:border-t-0">
      <div className="flex flex-wrap items-start gap-2">
        <button className="mr-auto text-left font-medium underline-offset-2 hover:underline" onClick={() => onOpen(f.id)}>
          {f.claim}
        </button>
        <span className="text-xs text-slate-500">{f.service}</span>
        <Badge value={f.severity} prefix="severity: " />
        <Badge value={f.evidence_status} prefix="evidence: " />
      </div>
      {f.changes?.map((c) => (
        <p key={c.field} className="text-xs text-slate-600">
          {label(c.field)}: {label(c.from)} → {label(c.to)}
        </p>
      ))}
      {f.change_reason && <p className="mt-1 text-sm text-slate-600">Changed: {f.change_reason}</p>}
    </li>
  );
}

export default function Register({ project, onOpen }: { project: Project; onOpen: (id: string) => void }) {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [invId, setInvId] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [running, setRunning] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const [model, setModel] = useState("");

  const fail = (e: unknown) => setError((e as Error).message);

  useEffect(() => {
    get<{ default: string; models: string[] }>("/models")
      .then((m) => {
        setModels(m.models);
        setModel(m.models.includes(m.default) ? m.default : (m.models[0] ?? ""));
      })
      .catch(fail);
  }, []);
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
      if (created.status === "failed") setError(`Investigation failed: ${created.error}`);
      await loadInvestigations(created.status === "complete" ? created.id : undefined);
    } catch (e) {
      fail(e);
    }
    setRunning(false);
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = String(new FormData(event.currentTarget).get("question"));
    setAsking(true);
    setError("");
    try {
      setAnswer(await post<Answer>(`/projects/${project.id}/ask`, { question, model: model || null }));
    } catch (e) {
      fail(e);
    }
    setAsking(false);
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
    <div className="space-y-4">
      <ErrorNote message={error} />

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <button className={button} onClick={run} disabled={running}>
            {running ? "Investigating…" : "Run investigation"}
          </button>
          <label className="text-sm">
            Model{" "}
            <select className={input} value={model} onChange={(e) => setModel(e.target.value)} disabled={running}>
              {models.length === 0 && <option value="">default from .env</option>}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m.replace(":", " · ")}
                  {m.startsWith("ollama:") ? " (local)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Investigation{" "}
            <select className={input} value={invId} onChange={(e) => setInvId(e.target.value)}>
              {investigations.length === 0 && <option value="">none yet</option>}
              {investigations.map((i) => (
                <option key={i.id} value={i.id}>
                  {minute(i.created_at)} ({i.status})
                </option>
              ))}
            </select>
          </label>
          <button className={buttonQuiet} onClick={showBrief} disabled={inv?.status !== "complete"}>
            Generate brief
          </button>
          <button className={buttonQuiet} onClick={showDiff} disabled={!inv?.previous_id || inv.status !== "complete"}>
            Compare with previous investigation
          </button>
          <label className="ml-auto text-sm">
            Group by{" "}
            <select className={input} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
              <option value="category">category</option>
              <option value="severity">severity</option>
              <option value="evidence_status">evidence status</option>
            </select>
          </label>
        </div>
        {running && (
          <p className="mt-2 text-xs text-slate-500">
            One model call per risk area. Hosted models take a minute or two (longer when a free tier rate-limits);
            local models can take several minutes per area.
          </p>
        )}
        {inv && (
          <p className="mt-2 text-xs text-slate-500">
            {inv.source_snapshot.length} sources in snapshot · model {inv.model} · prompt {inv.prompt_version}
            {inv.error && ` · ${inv.error}`}
          </p>
        )}
      </Card>

      <Card title="Ask the documents">
        <form onSubmit={ask} className="flex gap-2">
          <input
            name="question"
            required
            minLength={3}
            maxLength={500}
            aria-label="Question for the documents"
            placeholder="e.g. Can this route run at 10 kg scale?"
            className={`${input} flex-1`}
          />
          <button className={button} disabled={asking}>
            {asking ? "Reading the documents…" : "Ask"}
          </button>
        </form>
        {answer && (
          <div className="mt-3 space-y-3">
            {answer.findings.map((f, i) => (
              <div key={i} className="rounded border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-start gap-2">
                  <p className="mr-auto font-medium">{f.claim}</p>
                  <Badge value={f.severity} prefix="severity: " />
                  <Badge value={f.evidence_status} prefix="evidence: " />
                </div>
                {[...f.supporting, ...f.contradicting].map((c, j) => (
                  <p key={j} className="mt-2 text-slate-600">
                    “{c.quote}”{" "}
                    <span className="text-xs text-slate-500">
                      {c.title} · {day(c.date)} · {where(c)}
                    </span>
                  </p>
                ))}
                <p className="mt-2">
                  <span className="font-medium">Next step:</span> {f.next_step}
                </p>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              {answer.retrieved_chunk_ids.length} passages read ·{" "}
              {answer.citations_emitted - answer.citations_rejected} of {answer.citations_emitted} quotes verified ·{" "}
              {answer.model_version}. The answer is not saved.
            </p>
          </div>
        )}
      </Card>

      {panel?.kind === "brief" && (
        <Card title="Brief (Markdown)">
          <a className={`${buttonQuiet} inline-block`} href={`${BASE}/investigations/${invId}/brief`} download={`brief-${invId}.md`}>
            Download .md
          </a>
          <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{panel.text}</pre>
        </Card>
      )}

      {panel?.kind === "diff" && (
        <Card title="Changes since the previous investigation">
          {(["resolved", "updated", "added", "removed"] as const).map((bucket) => (
            <div key={bucket} className="mb-3">
              <h3 className="text-sm font-semibold capitalize">
                {bucket} ({panel.diff[bucket].length})
              </h3>
              <ul>
                {panel.diff[bucket].map((f) => (
                  <FindingRow key={f.id} f={f} onOpen={onOpen} />
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-slate-500">{panel.diff.unchanged.length} findings unchanged.</p>
        </Card>
      )}

      {groups.map((g) => (
        <Card key={g.value} title={`${label(g.value)} (${g.items.length})`}>
          <ul>
            {g.items.map((f) => (
              <FindingRow key={f.id} f={f} onOpen={onOpen} />
            ))}
          </ul>
        </Card>
      ))}
      {invId && findings.length === 0 && <p className="text-sm text-slate-500">This investigation has no findings.</p>}
      {!invId && <p className="text-sm text-slate-500">Upload evidence, then run an investigation.</p>}

      <p className="text-xs text-slate-500">
        Severity is the potential impact if the risk is real. Evidence status says what the sources establish; “not
        established” means not established from the available evidence.
      </p>
    </div>
  );
}
