"use client";

// RAG ENGINE: ask the lab's own documents. Laid out like Search: one question bar, questions that work,
// then what stands behind the answers - the findings of the last review and the indexed sources.
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Play, Search, Sparkles } from "lucide-react";
import { accessKey, type Answer, day, get, post, type Project, setAccessKey, where } from "./api";
import Sources from "./Evidence";
import FindingDetail from "./FindingDetail";
import Findings from "./Register";
import { Badge, button, buttonQuiet, Card, field, input } from "./ui";

const EXAMPLES = [
  "Has the gefitinib coupling fix been verified?",
  "Has this route been run at 10 kg scale?",
  "Which starting material has a single supplier?",
  "What caused the low yield in batch GEF-0142?",
];

export default function DocumentsApp() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [findingId, setFindingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const bar = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setKey(accessKey());
    get<Project[]>("/projects")
      .then((list) => {
        setProjects(list);
        setProjectId(list[0]?.id ?? "");
        setCreating(list.length === 0);
      })
      .catch((e) => setError(e.message));
    get<{ default: string; models: string[] }>("/models")
      .then((m) => {
        setModels(m.models);
        setModel(m.models.includes(m.default) ? m.default : (m.models[0] ?? ""));
      })
      .catch(() => undefined);
  }, []);

  const project = projects.find((p) => p.id === projectId);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setAsking(true);
    setError("");
    try {
      setAnswer(await post<Answer>(`/projects/${project.id}/ask`, { question, model: model || null }));
    } catch (e) {
      setError((e as Error).message);
    }
    setAsking(false);
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lines = (name: string, sep: RegExp) =>
      String(form.get(name)).split(sep).map((s) => s.trim()).filter(Boolean);
    try {
      const created = await post<Project>("/projects", {
        name: form.get("name"),
        services: lines("services", /,/),
        questions: lines("questions", /\n/),
      });
      setProjects([created, ...projects]);
      setProjectId(created.id);
      setCreating(false);
      setFindingId(null);
      setAnswer(null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] pt-6">
      <div className="text-center">
        <div className="font-data text-[11px] uppercase tracking-[0.3em] text-nc-cyan">RAG Engine</div>
        <h1 className="mt-3 text-[40px] font-semibold leading-tight tracking-tight text-nc-hi">What do the lab’s documents say?</h1>
        <p className="mt-2 text-[13px] text-nc-mid">Ask in plain words. Every answer quotes the passage it came from, or says it is not established.</p>
      </div>

      <form onSubmit={ask} className="nc-card nc-card-lit mt-8 flex items-center gap-3 p-2.5 pl-4">
        <Search className="h-5 w-5 shrink-0 text-nc-cyan" aria-hidden />
        <input
          ref={bar}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
          minLength={3}
          maxLength={500}
          disabled={!project}
          spellCheck={false}
          placeholder={project ? "Ask the documents: batch records, deviations, proposals, lab notes" : "Create a project first"}
          aria-label="Question for the lab documents"
          className="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-nc-hi outline-none placeholder:text-nc-lo disabled:opacity-50"
        />
        <button type="submit" disabled={asking || !project} className="nc-focus flex h-11 items-center gap-2 rounded-lg bg-nc-cyan px-5 font-data text-[12px] font-semibold uppercase tracking-wider text-nc-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-nc-line disabled:text-nc-lo">
          <Play className="h-3.5 w-3.5" aria-hidden /> {asking ? "Reading" : "Ask"}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-center font-data text-[12px] text-nc-bad">{error}</p>}

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => { setQuestion(ex); bar.current?.focus(); }} disabled={!project} className="nc-btn rounded-full px-3 py-1.5 text-[11.5px] disabled:opacity-50">
            <Sparkles className="h-3 w-3 text-nc-cyan" aria-hidden /> {ex}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-center gap-4">
        <label className={field}>
          Project
          <select className={input} value={projectId} onChange={(e) => { setProjectId(e.target.value); setFindingId(null); setAnswer(null); }}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className={field}>
          Model
          <select className={input} value={model} onChange={(e) => setModel(e.target.value)}>
            {models.length === 0 && <option value="">server default</option>}
            {models.map((m) => (
              <option key={m} value={m}>
                {m.replace(":", " · ")}
                {m.startsWith("ollama:") ? " (local)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Access key
          <input
            type="password"
            autoComplete="off"
            className={`${input} w-48`}
            value={key}
            placeholder="to ask, upload or review"
            onChange={(e) => {
              setKey(e.target.value);
              setAccessKey(e.target.value.trim());
            }}
          />
        </label>
        <button type="button" className={`${buttonQuiet} h-9`} onClick={() => setCreating(!creating)}>
          New project
        </button>
      </div>

      {creating && (
        <Card title="Create project" className="mt-6">
          <form onSubmit={createProject} className="grid gap-3 sm:grid-cols-2">
            <label className={field}>
              Name
              <input name="name" required className={input} />
            </label>
            <label className={field}>
              Compounds (comma separated)
              <input name="services" required placeholder="gefitinib, erlotinib" className={input} />
            </label>
            <label className={`${field} sm:col-span-2`}>
              Open questions to review (one per line, optional)
              <textarea name="questions" rows={2} className={`${input} h-auto py-2`} />
            </label>
            <p className="text-[11.5px] text-nc-lo sm:col-span-2">Every project is reviewed for scalability, recurring failures, and supply and safety.</p>
            <div>
              <button className={button}>Create project</button>
            </div>
          </form>
        </Card>
      )}

      {answer && (
        <Card title="Answer" lit className="mt-8">
          <div className="space-y-4">
            {answer.findings.map((f, i) => (
              <div key={i}>
                <div className="flex flex-wrap items-start gap-2">
                  <p className="mr-auto text-[14px] font-medium leading-snug text-nc-hi">{f.claim}</p>
                  <Badge value={f.severity} prefix="severity: " />
                  <Badge value={f.evidence_status} prefix="evidence: " />
                </div>
                <ul className="mt-2 space-y-2">
                  {[...f.supporting, ...f.contradicting].map((c, j) => (
                    <li key={j} className="flex gap-3">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-nc-cyan" aria-hidden />
                      <div>
                        <div className="text-[12.5px] leading-snug text-nc-hi">“{c.quote}”</div>
                        <div className="text-[11.5px] leading-snug text-nc-lo">{c.title} · {day(c.date)} · {where(c)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] leading-snug text-nc-mid"><span className="font-medium text-nc-hi">Next step:</span> {f.next_step}</p>
              </div>
            ))}
            <p className="font-data text-[10.5px] text-nc-lo">
              {answer.retrieved_chunk_ids.length} passages read · {answer.citations_emitted - answer.citations_rejected} of {answer.citations_emitted} quotes verified · {answer.model_version} · not saved
            </p>
          </div>
        </Card>
      )}

      {project && (
        <>
          {/* Both panels stay mounted (hidden) so the selected review survives a visit to a finding. */}
          <div hidden={!!findingId} className="mt-10 space-y-5">
            <Findings key={`f-${project.id}`} project={project} model={model} onOpen={setFindingId} />
            <Sources key={`s-${project.id}`} project={project} />
          </div>
          {findingId && (
            <div className="mt-10">
              <FindingDetail id={findingId} onOpen={setFindingId} onBack={() => setFindingId(null)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
