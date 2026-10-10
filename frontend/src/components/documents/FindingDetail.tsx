"use client";

// ONE FINDING: the claim, the passages for and against it side by side, when each was written, and its history.
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { type Citation, day, type Finding, get, minute, where } from "./api";
import { Badge, buttonQuiet, Card, ErrorNote, label } from "./ui";

/** The stored passage with the cited quote highlighted (whitespace-insensitive match). */
function Passage({ c }: { c: Citation }) {
  if (!c.resolved || !c.text) return <p className="font-data text-[11px] text-nc-bad">Passage {c.chunk_id} is no longer stored.</p>;
  const pattern = c.quote
    .trim()
    .replace(/[.…\s]+$/, "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const m = c.text.match(new RegExp(pattern, "i"));
  return (
    <article className="rounded-lg border border-nc-line p-3">
      <header className="mb-2">
        <div className="text-[12.5px] font-medium text-nc-hi">{c.title}</div>
        <div className="font-data text-[10.5px] text-nc-lo">
          v{c.version}
          {c.latest === false && " (superseded)"} · {label(c.source_type ?? "")} · {day(c.date)} · {where(c)}
        </div>
      </header>
      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-nc-mid">
        {m && m.index !== undefined ? (
          <>
            {c.text.slice(0, m.index)}
            <mark className="rounded-sm bg-nc-cyan/[0.16] px-0.5 text-nc-hi">{m[0]}</mark>
            {c.text.slice(m.index + m[0].length)}
          </>
        ) : (
          c.text
        )}
      </p>
      <footer className="mt-2 font-data text-[10px] text-nc-lo">{c.chunk_id}</footer>
    </article>
  );
}

function Column({ title, citations }: { title: string; citations: Citation[] }) {
  return (
    <Card title={`${title} (${citations.length})`}>
      <div className="space-y-3">
        {citations.length === 0 && <p className="text-[12px] text-nc-lo">None in the available documents.</p>}
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

  if (!f) return error ? <ErrorNote message={error} /> : <p className="text-[12px] text-nc-lo">Loading…</p>;

  const timeline = [
    ...f.supporting.map((c) => ({ ...c, role: "supports the finding" })),
    ...f.contradicting.map((c) => ({ ...c, role: "contradicts the finding" })),
  ].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  return (
    <div className="space-y-5">
      <button type="button" className={buttonQuiet} onClick={props.onBack}>
        <ArrowLeft className="h-3 w-3" aria-hidden /> Back to findings
      </button>

      <section className="nc-card nc-card-lit p-5">
        <div className="font-data text-[11px] uppercase tracking-[0.2em] text-nc-cyan">
          {label(f.category)} · {f.service}
        </div>
        <h2 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-nc-hi">{f.claim}</h2>
        <p className="mt-1 text-[12px] text-nc-lo">{f.question}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge value={f.severity} prefix="potential severity: " />
          <Badge value={f.evidence_status} prefix="evidence: " />
        </div>
        <p className="mt-3 text-[12.5px] leading-snug text-nc-mid">
          <span className="font-medium text-nc-hi">Severity rationale:</span> {f.severity_rationale}
        </p>
        {f.change_reason && (
          <p className="mt-3 rounded-lg border border-nc-ok/40 bg-nc-ok/[0.06] px-3 py-2 text-[12.5px] leading-snug text-nc-mid">
            <span className="font-medium text-nc-hi">Changed since the previous review:</span> {f.change_reason}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Column title="Supporting evidence" citations={f.supporting} />
        <Column title="Contradicting evidence" citations={f.contradicting} />
      </div>

      <Card title="Evidence timeline">
        {timeline.length === 0 && <p className="text-[12px] text-nc-lo">No dated evidence is cited.</p>}
        <ol className="space-y-2.5">
          {timeline.map((c, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-nc-cyan" aria-hidden />
              <div>
                <div className="text-[12.5px] text-nc-hi">
                  <span className="font-data text-[11px] text-nc-lo">{day(c.date)}</span> · <span className="font-medium">{c.title}</span>{" "}
                  <span className="text-[11.5px] text-nc-lo">
                    ({label(c.source_type ?? "")}, {c.role})
                  </span>
                </div>
                <div className="text-[11.5px] leading-snug text-nc-mid">“{c.quote}”</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card title="Limitation">
          <p className="text-[12.5px] leading-snug text-nc-mid">{f.limitation || "None stated."}</p>
        </Card>
        <Card title="Next verification step">
          <p className="text-[12.5px] leading-snug text-nc-mid">{f.next_step || "None stated."}</p>
        </Card>
      </div>

      <Card title="History across reviews">
        <ol className="space-y-1.5">
          {f.history?.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2">
              <span className="font-data text-[11px] text-nc-lo">{minute(h.created_at)}</span>
              <Badge value={h.severity} />
              <Badge value={h.evidence_status} />
              {h.id === f.id ? (
                <span className="font-data text-[10.5px] text-nc-lo">this version</span>
              ) : (
                <button type="button" className={buttonQuiet} onClick={() => props.onOpen(h.id)}>
                  open
                </button>
              )}
              {h.change_reason && <span className="basis-full text-[11.5px] leading-snug text-nc-mid">{h.change_reason}</span>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
