"use client";
import { useRef, useState } from "react";
import { previewItemsImport, commitItemsImport } from "@/app/actions";
import type { ImportParse, ImportRow } from "@/lib/importDrawingLog";
import { fmtDShort } from "@/lib/model";

type Result = { created: number; updated: number; skipped: { drawing_no: string; why: string }[] };

/**
 * Import items from the designer's own per-project Excel (decision C, 30 Oct; built 2 Nov against Jinky's 26-024 sample).
 * Shop Drawing Log → items, revisions, planned / measurement / release / delivery / install dates.
 * Material Log → the materials summary on each item. Matched on drawing number; re-upload updates, never duplicates.
 */
export default function ItemsImport({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [parse, setParse] = useState<ImportParse | null>(null);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Result | null>(null);

  async function preview(f: File | null) {
    if (!f) return;
    setBusy(true); setErr(null); setResult(null); setParse(null);
    const fd = new FormData(); fd.append("file", f);
    const r = await previewItemsImport(projectId, fd);
    setBusy(false);
    if (r.error || !r.parse) { setErr(r.error ?? "Couldn't read that file."); return; }
    setParse(r.parse); setExisting(new Set(r.existing ?? []));
  }
  async function commit() {
    if (!parse) return;
    setBusy(true); setErr(null);
    const rows: ImportRow[] = parse.rows;
    const r = await commitItemsImport(projectId, rows);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setResult({ created: r.created ?? 0, updated: r.updated ?? 0, skipped: r.skipped ?? [] });
  }
  const isNew = (r: ImportRow) => !existing.has(r.drawing_no);
  const nNew = parse ? parse.rows.filter(isNew).length : 0;
  const nUpd = parse ? parse.rows.length - nNew : 0;
  const nameOnly = parse?.mode === "materials";
  const lastRev = (r: ImportRow) => r.revisions.length ? r.revisions[r.revisions.length - 1] : null;

  return (
    <div className="importbox">
      <div className="importhead">
        <div><b>Import from Excel</b><small>Upload the project’s <b>Shop Drawing Log</b> (items, revisions, dates) or its <b>Material Log</b> (finishes per drawing). Rows are matched on the drawing number, so you can upload the same sheet again later to update.</small></div>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.xlsm,.xls" onChange={(e) => preview(e.target.files?.[0] ?? null)} />
        <button type="button" className="btn sm" disabled={busy} onClick={() => fileRef.current?.click()}>{busy && !parse ? "Reading…" : parse ? "Choose another file" : "Choose file"}</button>
      </div>
      {err && <div className="msg err">{err}</div>}
      {result ? (
        <div className="importresult">
          <p><b>Done.</b> {result.created} item{result.created === 1 ? "" : "s"} added, {result.updated} updated{result.skipped.length ? `, ${result.skipped.length} skipped` : ""}.</p>
          {result.skipped.length > 0 && <ul className="note">{result.skipped.map((s) => <li key={s.drawing_no}><b className="enq">{s.drawing_no}</b> — {s.why}</li>)}</ul>}
          <button type="button" className="btn sm" onClick={onDone}>Close</button>
        </div>
      ) : parse && (
        <>
          <div className="importsummary">
            <span><b>{parse.rows.length}</b> row{parse.rows.length === 1 ? "" : "s"} on sheet “{parse.sheet}”{parse.project_line ? <> · {parse.project_line}</> : null}</span>
            <span className="pill done">{nameOnly ? "Material Log" : "Shop Drawing Log"}</span>
            {!nameOnly && <span className="pill ok">{nNew} new</span>}
            <span className="pill soon">{nameOnly ? parse.rows.length - nNew : nUpd} update{(nameOnly ? parse.rows.length - nNew : nUpd) === 1 ? "" : "s"}</span>
            {nameOnly && nNew > 0 && <span className="pill warn">{nNew} not in the app yet — will be skipped (import the Drawing Log first)</span>}
          </div>
          {parse.warnings.map((w) => <div key={w} className="msg err">{w}</div>)}
          <div className="tablewrap importtable">
            <table>
              <thead><tr><th></th><th>Drawing no.</th><th>Type</th>{nameOnly ? <th>Materials</th> : <><th>Title</th><th>BOQ</th><th>Drawn by</th><th>Planned R0</th><th>Latest</th><th>Dates</th></>}</tr></thead>
              <tbody>
                {parse.rows.map((r) => { const lr = lastRev(r); const n = isNew(r); return (
                  <tr key={r.drawing_no} className={nameOnly && n ? "off" : ""}>
                    <td><span className={`pill ${nameOnly ? (n ? "none" : "soon") : n ? "ok" : "soon"}`}>{nameOnly ? (n ? "skip" : "update") : n ? "new" : "update"}</span></td>
                    <td className="enq code">{r.drawing_no}</td>
                    <td>{r.type ?? <i>—</i>}</td>
                    {nameOnly ? <td className="mat">{r.materials ? r.materials.split("\n").map((l) => <div key={l}>{l}</div>) : <i>—</i>}</td> : <>
                      <td className="name">{r.title ?? <i>—</i>}</td>
                      <td className="boq">{r.boq_ref ? r.boq_ref.replace(" / ", " ") : "—"}</td>
                      <td>{r.drawn_by ?? <i>—</i>}</td>
                      <td className="num">{fmtDShort(r.planned_submission)}</td>
                      <td>{lr ? <><b>R{lr.rev}</b> {fmtDShort(lr.submitted)} <span className={`ds ds-${lr.status ?? "UR"}`}>{lr.status ?? "UR"}</span></> : <i>—</i>}</td>
                      <td className="num small">{[r.measurements && `meas ${fmtDShort(r.measurements)}`, r.release && `rel ${fmtDShort(r.release)}`, r.delivery && `del ${fmtDShort(r.delivery)}`, r.installation && `inst ${fmtDShort(r.installation)}`].filter(Boolean).join(" · ") || "—"}</td>
                    </>}
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button type="button" className="btn" disabled={busy || parse.rows.length === 0} onClick={commit}>{busy ? "Importing…" : nameOnly ? `Update materials on ${parse.rows.length - nNew} item${parse.rows.length - nNew === 1 ? "" : "s"}` : `Import ${parse.rows.length} item${parse.rows.length === 1 ? "" : "s"}`}</button>
            <button type="button" className="linkbtn" onClick={onDone}>Cancel</button>
            <span className="note">Nothing is written until you press Import. Existing items keep anything the sheet leaves blank. One line goes in the update email, not one per item.</span>
          </div>
        </>
      )}
    </div>
  );
}
