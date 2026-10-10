"use client";

// SOURCES: the documents the answers rest on - what is indexed, how to add more, and a direct passage search.
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Search, Upload } from "lucide-react";
import { BASE, day, get, type Passage, post, type Project, type Source, where } from "./api";
import { Badge, button, buttonQuiet, Card, ErrorNote, field, input, label } from "./ui";

const TYPES = ["route_proposal", "batch_record", "deviation", "known_issues", "process_change", "repeat_batch", "supply_register", "lab_note"];

export default function Sources({ project }: { project: Project }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [service, setService] = useState("");
  const [type, setType] = useState("");
  const [owner, setOwner] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adding, setAdding] = useState(false);
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
      setAdding(false);
    } catch (e) {
      setError((e as Error).message);
    }
    await load();
    setBusy(false);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get("q"));
    const query = new URLSearchParams({ q, service, type, owner, date_from: from, date_to: to });
    try {
      setHits(await get<Passage[]>(`/projects/${project.id}/search?${query}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const types = [...new Set(sources.map((s) => s.type))].sort();
  const owners = [...new Set(sources.map((s) => s.owner ?? "").filter(Boolean))].sort();
  const shown = sources.filter((s) => {
    const date = s.date?.slice(0, 10) ?? "";
    return (
      (!service || s.service === service) &&
      (!type || s.type === type) &&
      (!owner || s.owner === owner) &&
      (!from || date >= from) &&
      (!to || (date !== "" && date <= to))
    );
  });

  return (
    <div className="space-y-5">
      <Card
        title={`Sources (${shown.length} of ${sources.length})`}
        aside={
          <>
            <button type="button" className={buttonQuiet} onClick={load}>
              Refresh
            </button>
            <button type="button" className={button} onClick={() => setAdding(!adding)}>
              <Upload className="h-3.5 w-3.5" aria-hidden /> Add documents
            </button>
          </>
        }
      >
        <ErrorNote message={error} />

        {adding && (
          <form onSubmit={upload} className="mb-4 rounded-lg border border-nc-line bg-nc-panel-2 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className={field}>
                Files (PDF, Markdown, TXT, JSON)
                <input type="file" name="files" multiple required accept=".pdf,.md,.markdown,.txt,.json" className="text-[12px] normal-case tracking-normal text-nc-mid" />
              </label>
              <label className={field}>
                Type
                <select name="type" className={input}>
                  <option value="">from file</option>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{label(t)}</option>
                  ))}
                </select>
              </label>
              <label className={field}>
                Compound
                <select name="service" className={input}>
                  <option value="">from file</option>
                  {project.services.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className={field}>
                Document date
                <input type="date" name="date" className={input} />
              </label>
              <label className={field}>
                Owner
                <input name="owner" placeholder="from file" className={`${input} w-36`} />
              </label>
              <button className={button} disabled={busy}>
                {busy ? "Indexing" : "Upload"}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-nc-lo">
              Markdown and TXT files may start with a front-matter block (title, type, service, date, owner); fields set here override it. A file with the same name becomes a new version, and earlier versions are kept.
            </p>
          </form>
        )}

        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className={field}>
            Compound
            <select className={input} value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">all</option>
              {project.services.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className={field}>
            Type
            <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">all</option>
              {types.map((t) => (
                <option key={t} value={t}>{label(t)}</option>
              ))}
            </select>
          </label>
          <label className={field}>
            Owner
            <select className={input} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">all</option>
              {owners.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className={field}>
            From
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className={field}>
            To
            <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        {shown.length === 0 ? (
          <p className="text-[12px] text-nc-lo">{sources.length ? "No source matches these filters." : "No documents yet. Add some to begin."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px] text-nc-mid">
              <thead>
                <tr>
                  {["Source", "Version", "Type", "Compound", "Date", "Owner", "Status", "Passages", "SHA-256"].map((h) => (
                    <th key={h} scope="col" className="nc-label whitespace-nowrap py-1.5 pr-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className={`border-t border-nc-line align-top ${s.latest ? "" : "opacity-60"}`}>
                    <td className="py-2 pr-3">
                      <a className="nc-focus text-nc-hi underline decoration-nc-line-strong underline-offset-2 hover:text-nc-cyan" href={`${BASE}/sources/${s.id}/file`}>
                        {s.title}
                      </a>
                      {s.error && <div className="font-data text-[10.5px] text-nc-bad">{s.error}</div>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 font-data text-[11px]">
                      v{s.version}
                      {!s.latest && s.status === "ready" && " (superseded)"}
                    </td>
                    <td className="py-2 pr-3">{label(s.type)}</td>
                    <td className="py-2 pr-3">{s.service ?? "—"}</td>
                    <td className="whitespace-nowrap py-2 pr-3 font-data text-[11px]">{day(s.date)}</td>
                    <td className="py-2 pr-3">{s.owner ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge value={s.status} />
                    </td>
                    <td className="py-2 pr-3 font-data text-[11px]">{s.chunk_count}</td>
                    <td className="py-2 pr-3 font-data text-[10.5px] text-nc-lo">{s.checksum.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Passage search">
        <form onSubmit={search} className="flex items-center gap-2 rounded-lg border border-nc-line-strong bg-nc-raised p-1 pl-3">
          <Search className="h-4 w-4 shrink-0 text-nc-cyan" aria-hidden />
          <input name="q" required aria-label="Search the passages" placeholder="e.g. gefitinib coupling GEF-0142" className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-nc-hi outline-none placeholder:text-nc-lo" />
          <button className={button}>Search</button>
        </form>
        <p className="mt-2 text-[11px] leading-snug text-nc-lo">
          Searches by meaning and by exact words, within the compound, type, owner and date filters above. Only the latest version of each source is searched. Order is retrieval rank, not confidence.
        </p>
        {hits && (
          <ol className="mt-3 space-y-2">
            {hits.length === 0 && <li className="text-[12px] text-nc-lo">No passages found.</li>}
            {hits.map((p, i) => (
              <li key={p.id} className="rounded-lg border border-nc-line p-3">
                <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-[12.5px] font-medium text-nc-hi">
                    {i + 1}. {p.title}
                  </span>
                  <span className="font-data text-[10.5px] text-nc-lo">
                    v{p.version} · {label(p.source_type)} · {day(p.date)} · {where(p)}
                  </span>
                  <span className="ml-auto font-data text-[10.5px] text-nc-cyan">found by {p.retrievers.join(" + ")}</span>
                </div>
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-nc-mid">{p.text}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
