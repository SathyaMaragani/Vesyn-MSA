"use client";

import { useEffect, useState } from "react";
import { type Citation, day, type Finding, get, minute, where } from "./api";
import { Badge, buttonQuiet, Card, ErrorNote, label } from "./ui";

/** The stored passage with the cited quote highlighted (whitespace-insensitive match). */
function Passage({ c }: { c: Citation }) {
  if (!c.resolved || !c.text) return <p className="text-sm text-red-700">Passage {c.chunk_id} is no longer stored.</p>;
  const pattern = c.quote
    .trim()
    .replace(/[.…\s]+$/, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const m = c.text.match(new RegExp(pattern, "i"));
  return (
    <article className="rounded border border-slate-200 p-3 text-sm">
      <header className="mb-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-900">{c.title}</span> · v{c.version}
        {c.latest === false && " (superseded)"} · {label(c.source_type ?? "")} · {day(c.date)} · {where(c)}
      </header>
      <p className="whitespace-pre-wrap">
        {m && m.index !== undefined ? (
          <>
            {c.text.slice(0, m.index)}
            <mark className="bg-yellow-200">{m[0]}</mark>
            {c.text.slice(m.index + m[0].length)}
          </>
        ) : (
          c.text
        )}
      </p>
      <footer className="mt-2 font-mono text-[11px] text-slate-400">{c.chunk_id}</footer>
    </article>
  );
}

function Column({ title, citations }: { title: string; citations: Citation[] }) {
  return (
    <Card title={`${title} (${citations.length})`}>
      <div className="space-y-3">
        {citations.length === 0 && <p className="text-sm text-slate-500">None in the available evidence.</p>}
        {citations.map((c, i) => (
          <Passage key={i} c={c} />
        ))}
      </div>
    </Card>
  );
}

export default function FindingDetail(props: { id: string; onOpen: (id: string) => void; onBack: () => void }) {
  const [f, setF] = useState<Finding | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setF(null);
    get<Finding>(`/findings/${props.id}`)
      .then(setF)
      .catch((e) => setError(e.message));
  }, [props.id]);

  if (!f) return error ? <ErrorNote message={error} /> : <p className="text-sm text-slate-500">Loading…</p>;

  const timeline = [
    ...f.supporting.map((c) => ({ ...c, role: "supports the finding" })),
    ...f.contradicting.map((c) => ({ ...c, role: "contradicts the finding" })),
  ].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  return (
    <div className="space-y-4">
      <button className={buttonQuiet} onClick={props.onBack}>
        ← Back to risk register
      </button>

      <Card>
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {label(f.category)} · {f.service} · {f.question}
        </p>
        <h2 className="mt-1 text-lg font-semibold">{f.claim}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge value={f.severity} prefix="potential severity: " />
          <Badge value={f.evidence_status} prefix="evidence: " />
        </div>
        <p className="mt-2 text-sm">
          <span className="font-medium">Severity rationale:</span> {f.severity_rationale}
        </p>
        {f.change_reason && (
          <p className="mt-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm">
            <span className="font-medium">Changed since the previous investigation:</span> {f.change_reason}
          </p>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Column title="Supporting evidence" citations={f.supporting} />
        <Column title="Contradicting evidence" citations={f.contradicting} />
      </div>

      <Card title="Evidence timeline">
        {timeline.length === 0 && <p className="text-sm text-slate-500">No dated evidence is cited.</p>}
        <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
          {timeline.map((c, i) => (
            <li key={i} className="text-sm">
              <span className="font-mono text-xs">{day(c.date)}</span> · <span className="font-medium">{c.title}</span>{" "}
              <span className="text-slate-500">
                ({label(c.source_type ?? "")}, {c.role})
              </span>
              <div className="text-slate-600">“{c.quote}”</div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Limitation">
          <p className="text-sm">{f.limitation || "None stated."}</p>
        </Card>
        <Card title="Next verification step">
          <p className="text-sm">{f.next_step || "None stated."}</p>
        </Card>
      </div>

      <Card title="History across investigations">
        <ol className="space-y-1">
          {f.history?.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs">{minute(h.created_at)}</span>
              <Badge value={h.severity} />
              <Badge value={h.evidence_status} />
              {h.id === f.id ? (
                <span className="text-xs text-slate-500">this version</span>
              ) : (
                <button className="text-xs underline" onClick={() => props.onOpen(h.id)}>
                  open
                </button>
              )}
              {h.change_reason && <span className="basis-full text-slate-600">{h.change_reason}</span>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
