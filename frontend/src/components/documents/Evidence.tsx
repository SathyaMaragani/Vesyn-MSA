"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { BASE, day, get, type Passage, post, type Project, type Source, where } from "./api";
import { Badge, button, buttonQuiet, Card, ErrorNote, input, label } from "./ui";

const TYPES = ["route_proposal", "batch_record", "deviation", "known_issues", "process_change", "repeat_batch", "supply_register", "lab_note"];

export default function Evidence({ project }: { project: Project }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [service, setService] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hits, setHits] = useState<Passage[] | null>(null);

  const load = useCallback(
    () =>
      get<Source[]>(`/projects/${project.id}/sources`)
        .then(setSources)
        .catch((e) => setError(e.message)),
    [project.id],
  );
  useEffect(() => void load(), [load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    try {
      await post(`/projects/${project.id}/sources`, new FormData(form));
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    }
    await load();
    setBusy(false);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams({ q: String(new FormData(event.currentTarget).get("q")), service, type });
    try {
      setHits(await get<Passage[]>(`/projects/${project.id}/search?${query}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const types = [...new Set(sources.map((s) => s.type))].sort();
  const shown = sources.filter((s) => (!service || s.service === service) && (!type || s.type === type));

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />

      <Card title="Upload evidence">
        <form onSubmit={upload} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Files (PDF, Markdown, TXT, repository-summary JSON)
            <input
              type="file"
              name="files"
              multiple
              required
              accept=".pdf,.md,.markdown,.txt,.json"
              className="mt-1 block text-sm"
            />
          </label>
          <label className="text-sm">
            Type
            <select name="type" className={`${input} mt-1 block`}>
              <option value="">from file</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Compound
            <select name="service" className={`${input} mt-1 block`}>
              <option value="">from file</option>
              {project.services.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Document date
            <input type="date" name="date" className={`${input} mt-1 block`} />
          </label>
          <label className="text-sm">
            Owner
            <input name="owner" placeholder="from file" className={`${input} mt-1 block w-36`} />
          </label>
          <button className={button} disabled={busy}>
            {busy ? "Indexing…" : "Upload"}
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Markdown and TXT files may start with a front-matter block (title, type, service, date, owner). Fields set
          here override it. Uploading a file with the same name creates a new version; earlier versions are kept.
        </p>
      </Card>

      <Card title={`Sources (${shown.length} of ${sources.length})`}>
        <div className="mb-3 flex flex-wrap gap-3">
          <label className="text-sm">
            Compound{" "}
            <select className={input} value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">all</option>
              {project.services.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Source type{" "}
            <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">all</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </label>
          <button className={buttonQuiet} onClick={load}>
            Refresh
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-slate-500">No sources yet. Upload evidence to begin.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  {["Source", "Version", "Type", "Compound", "Date", "Owner", "Status", "Chunks", "SHA-256"].map((h) => (
                    <th key={h} scope="col" className="py-1 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className={`border-t border-slate-100 align-top ${s.latest ? "" : "text-slate-400"}`}>
                    <td className="py-1.5 pr-3">
                      <a className="underline" href={`${BASE}/sources/${s.id}/file`}>
                        {s.title}
                      </a>
                      {s.error && <div className="text-xs text-red-700">{s.error}</div>}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      v{s.version}
                      {!s.latest && s.status === "ready" && " (superseded)"}
                    </td>
                    <td className="py-1.5 pr-3">{label(s.type)}</td>
                    <td className="py-1.5 pr-3">{s.service ?? "—"}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{day(s.date)}</td>
                    <td className="py-1.5 pr-3">{s.owner ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      <Badge value={s.status} />
                    </td>
                    <td className="py-1.5 pr-3">{s.chunk_count}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">{s.checksum.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Retrieval check">
        <form onSubmit={search} className="flex gap-2">
          <input
            name="q"
            required
            aria-label="Search the evidence"
            placeholder="e.g. gefitinib coupling GEF-0142"
            className={`${input} flex-1`}
          />
          <button className={buttonQuiet}>Search</button>
        </form>
        {hits && (
          <ol className="mt-3 space-y-3">
            {hits.length === 0 && <li className="text-sm text-slate-500">No passages found.</li>}
            {hits.map((p, i) => (
              <li key={p.id} className="rounded border border-slate-200 p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {i + 1}. {p.title}
                  </span>
                  <span>
                    v{p.version} · {label(p.source_type)} · {day(p.date)} · {where(p)}
                  </span>
                  <span className="ml-auto">found by {p.retrievers.join(" + ")} search</span>
                </div>
                <p className="whitespace-pre-wrap">{p.text}</p>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Searches the latest version of each source, within the service and source-type filters above. Order is
          retrieval rank, not confidence.
        </p>
      </Card>
    </div>
  );
}
