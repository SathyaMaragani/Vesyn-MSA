"use client";

import { type FormEvent, useEffect, useState } from "react";
import { get, post, type Project } from "./api";
import Evidence from "./Evidence";
import FindingDetail from "./FindingDetail";
import Register from "./Register";
import { button, buttonQuiet, Card, ErrorNote, input } from "./ui";

type View = "evidence" | "register";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [view, setView] = useState<View>("evidence");
  const [findingId, setFindingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    get<Project[]>("/projects")
      .then((list) => {
        setProjects(list);
        setProjectId(list[0]?.id ?? "");
        setCreating(list.length === 0);
      })
      .catch((e) => setError(e.message));
  }, []);

  const project = projects.find((p) => p.id === projectId);

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
      setView("evidence");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-6xl py-2">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Lab documents</h1>
        <label className="text-sm text-slate-600">
          Project{" "}
          <select
            className={input}
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setFindingId(null);
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonQuiet} onClick={() => setCreating(!creating)}>
          New project
        </button>
      </header>

      <ErrorNote message={error} />

      {creating && (
        <Card title="Create project" className="mb-6">
          <form onSubmit={createProject} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Name
              <input name="name" required className={`${input} mt-1 block w-full`} />
            </label>
            <label className="text-sm">
              Compounds (comma separated)
              <input
                name="services"
                required
                placeholder="gefitinib, erlotinib"
                className={`${input} mt-1 block w-full`}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Open questions to investigate (one per line, optional)
              <textarea name="questions" rows={2} className={`${input} mt-1 block w-full`} />
            </label>
            <p className="text-sm text-slate-600 sm:col-span-2">
              Every project is reviewed for scalability, recurring failures, and supply and safety.
            </p>
            <div>
              <button className={button}>Create project</button>
            </div>
          </form>
        </Card>
      )}

      {project && (
        <>
          <nav className="mb-4 flex gap-1 border-b border-slate-200" aria-label="Screens">
            {(["evidence", "register"] as const).map((v) => (
              <button
                key={v}
                aria-current={view === v && !findingId ? "page" : undefined}
                onClick={() => {
                  setView(v);
                  setFindingId(null);
                }}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  view === v ? "border-emerald-800" : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                {v === "evidence" ? "Evidence workspace" : "Risk register"}
              </button>
            ))}
          </nav>

          {/* Screens stay mounted (hidden) so the selected investigation survives a visit to a finding. */}
          <div hidden={view !== "evidence" || !!findingId}>
            <Evidence key={project.id} project={project} />
          </div>
          <div hidden={view !== "register" || !!findingId}>
            <Register key={project.id} project={project} onOpen={setFindingId} />
          </div>
          {findingId && <FindingDetail id={findingId} onOpen={setFindingId} onBack={() => setFindingId(null)} />}
        </>
      )}
    </div>
  );
}
