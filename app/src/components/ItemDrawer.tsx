"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveItem, setItemCancelled, submitRevision, returnRevision, saveStage } from "@/app/actions";
import { DRAWING_STATUS, DRAWING_LABEL, PRODUCTION_STAGES, STAGE_STATUS, STAGE_STATUS_LABEL, fmtD, fmtDShort, title, itemFlags, itemRights, type Item, type ItemType, type ItemRevision, type ItemProductionStage, type Me, type Person, type DrawingStatus } from "@/lib/model";
import { StageChip } from "@/components/StageStrip";

type State = { error?: string; ok?: boolean; at?: string } | null;
type Props = { item: Item; revisions: ItemRevision[]; stages: ItemProductionStage[]; types: ItemType[]; designers: Person[]; me: Me; locked: boolean; onClose: () => void };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });

/** One item: details, the R0–Rn drawing timeline, pre-production ticks, and the six production stages. */
export default function ItemDrawer({ item, revisions, stages, types, designers, me, locked, onClose }: Props) {
  const router = useRouter();
  const r = itemRights(me);
  const can = { items: r.items && !locked && !item.cancelled, drawing: r.drawing && !locked && !item.cancelled, pre: r.preProduction && !locked && !item.cancelled, factory: r.factory && !locked && !item.cancelled, site: r.site && !locked && !item.cancelled };
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const flags = itemFlags(item);
  const lastRev = revisions[revisions.length - 1];
  const awaiting = lastRev && lastRev.status == null;
  const approved = item.current_status === "A" || item.current_status === "B";
  const [, start] = useTransition();
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  return (
    <div className="ddim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-label={`Item ${item.drawing_code}`}>
        <header className="drawer-head">
          <div>
            <div className="code-big">{item.drawing_code}<span className="rev-big">-R{item.current_revision ?? 0}</span></div>
            <h2>{item.name}</h2>
            <div className="client">{item.type_name}{item.area ? ` · ${item.area}` : ""} · {item.designer ? title(item.designer) : "no designer"}</div>
          </div>
          <div className="drawer-tools"><StageChip i={item} /><button className="x" aria-label="Close" onClick={onClose}>×</button></div>
        </header>
        {flags.length > 0 && <div className="drawer-flags">{flags.map((f) => <span key={f.text} className={`pill ${f.tone}`}>{f.text}</span>)}</div>}
        {item.cancelled && <div className="vobanner removed"><b>Cancelled.</b> This item keeps its code ({item.item_code}) so nothing else renumbers.{r.items && !locked && <button className="btn sm ghost" style={{ marginLeft: 12 }} onClick={() => start(async () => { const res = await setItemCancelled(item.project_id, item.id, false); if (res?.error) setCancelErr(res.error); else router.refresh(); })}>Restore</button>}{cancelErr && <span className="msg err"> {cancelErr}</span>}</div>}

        <section className="dsec">
          <h3>Shop drawing <small>{item.designer ? `· ${title(item.designer)}` : ""}</small></h3>
          <ol className="timeline">
            {revisions.length === 0 && <li className="tl empty"><span className="dot" /><div>Nothing submitted yet{item.planned_submission ? ` — R0 planned ${fmtD(item.planned_submission)}` : ""}.</div></li>}
            {revisions.map((rv) => <Revision key={rv.id} rv={rv} item={item} canEdit={can.drawing} isLast={rv.id === lastRev?.id} />)}
          </ol>
          {can.drawing && !awaiting && !approved && item.current_status !== "D" && <SubmitForm item={item} next={(lastRev?.rev_no ?? -1) + 1} />}
          {can.drawing && approved && <p className="note">Approved{item.current_status === "B" ? " with comments" : ""} at R{item.current_revision}. If the client asks for another revision, record a C on R{item.current_revision} first.</p>}
        </section>

        <section className="dsec">
          <h3>Pre-production <small>· material, measurements, issue to factory</small></h3>
          <PreProdForm item={item} canEdit={can.pre} approved={approved} />
        </section>

        <section className="dsec">
          <h3>Production <small>· Joinery · Paint · Delivery = Gajanand · Install · Stone · Snagging = PM</small></h3>
          {!item.issued_date ? <p className="note">The six stages appear the moment the item is issued to production.</p> : (
            <div className="stages">
              {PRODUCTION_STAGES.map(([k, l, side]) => { const s = stages.find((x) => x.stage === k); return s ? <StageRow key={k} s={s} label={l} item={item} canEdit={side === "factory" ? can.factory : can.site} /> : null; })}
            </div>
          )}
        </section>

        <section className="dsec">
          <h3>Details</h3>
          <DetailsForm item={item} types={types} designers={designers} canEdit={can.items} canDrawing={can.drawing} />
          {can.items && <button className="btn sm danger" style={{ alignSelf: "flex-start" }} onClick={() => { if (confirm(`Cancel ${item.drawing_code} ${item.name}? It keeps its code and can be restored.`)) start(async () => { const res = await setItemCancelled(item.project_id, item.id, true); if (res?.error) setCancelErr(res.error); else router.refresh(); }); }}>Cancel item</button>}
          <p className="note">Created {fmtD(item.created_at)} · last change {fmtD(item.updated_at)}</p>
        </section>
      </aside>
    </div>
  );
}

function useRefresh(state: State) {
  const router = useRouter();
  useEffect(() => { if (state?.ok) router.refresh(); }, [state?.at]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Revision({ rv, item, canEdit, isLast }: { rv: ItemRevision; item: Item; canEdit: boolean; isLast: boolean }) {
  const [state, action, pending] = useActionState(returnRevision.bind(null, item.project_id, rv.id), null as State);
  const [editing, setEditing] = useState(false);
  useRefresh(state);
  useEffect(() => { if (state?.ok) setEditing(false); }, [state?.at]);
  const out = rv.status == null;
  const days = rv.submitted_date ? Math.round((new Date((rv.returned_date ?? today()) + "T00:00:00").getTime() - new Date(rv.submitted_date + "T00:00:00").getTime()) / 86400000) : null;
  return (
    <li className={`tl ${out ? "out" : `ds-${rv.status}`}`}>
      <span className="dot" />
      <div className="tl-body">
        <div className="tl-line"><b>R{rv.rev_no}</b> submitted {fmtD(rv.submitted_date)}
          {out ? <span className="pill soon">with client{days != null ? ` · ${days}d` : ""}</span> : <><span className="arrow">→</span><span className={`ds ds-${rv.status}`}>{rv.status}</span> {DRAWING_LABEL[rv.status as DrawingStatus]} {rv.returned_date ? fmtD(rv.returned_date) : ""}{days != null && rv.returned_date ? <small> · {days}d</small> : null}</>}
          {canEdit && !editing && <button className="linkbtn" onClick={() => setEditing(true)}>{out ? "Record response" : "Edit"}</button>}
        </div>
        {rv.comments && !editing && <div className="tl-comments">{rv.comments}</div>}
        {editing && (
          <form action={action} className="tl-form">
            <div className="segs">{DRAWING_STATUS.map(([k, l]) => <label key={k} className={`seg2 ds-seg`} title={l}><input type="radio" name="status" value={k} defaultChecked={rv.status === k} required />{k}</label>)}</div>
            <div className="tl-form-row"><input name="returned_date" type="date" defaultValue={rv.returned_date ?? today()} aria-label="Returned on" /><input name="comments" defaultValue={rv.comments ?? ""} placeholder="Client comments" aria-label="Comments" /></div>
            <div className="actions"><button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button><button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>{state?.error && <span className="msg err">{state.error}</span>}</div>
            {isLast && <small className="note">UR = still under review (no return date). C sends it back for R{rv.rev_no + 1}; A or B approves it for production.</small>}
          </form>
        )}
      </div>
    </li>
  );
}

function SubmitForm({ item, next }: { item: Item; next: number }) {
  const [state, action, pending] = useActionState(submitRevision.bind(null, item.project_id, item.id), null as State);
  const [open, setOpen] = useState(false);
  useRefresh(state);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state?.at]);
  if (!open) return <button className="btn sm bronze" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(true)}>Submit R{next} to client</button>;
  return (
    <form action={action} className="tl-form">
      <div className="tl-form-row"><label className="inline">Submitted on <input name="submitted_date" type="date" defaultValue={today()} /></label><input name="comments" placeholder={next === 0 ? "Note (optional)" : `What changed in R${next}`} /></div>
      <div className="actions"><button className="btn sm" disabled={pending}>{pending ? "Saving…" : `Submit R${next}`}</button><button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>{state?.error && <span className="msg err">{state.error}</span>}</div>
      <small className="note">File name for the PDF: <b className="enq">{item.drawing_code}-R{next}.pdf</b></small>
    </form>
  );
}

function PreProdForm({ item, canEdit, approved }: { item: Item; canEdit: boolean; approved: boolean }) {
  const [state, action, pending] = useActionState(saveItem.bind(null, item.project_id, item.id), null as State);
  const [issued, setIssued] = useState(item.issued_date ?? "");
  useRefresh(state);
  const d = !canEdit;
  return (
    <form action={action} className="form pre">
      <div className="field"><label htmlFor="pp-mat">Material approval</label>
        <select id="pp-mat" name="material_approval" defaultValue={item.material_approval} disabled={d}><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="NA">N/A</option></select></div>
      <div className="field"><label htmlFor="pp-meas">Final measurements taken</label><input id="pp-meas" name="measurements_date" type="date" defaultValue={item.measurements_date ?? ""} disabled={d} /></div>
      <div className="field"><label htmlFor="pp-iss">Issued to production</label><input id="pp-iss" name="issued_date" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} disabled={d} /></div>
      {!item.issued_date && issued && !approved && <div className="field wide"><span className="msg err">Drawing isn’t approved yet (currently {item.current_revision == null ? "not submitted" : `R${item.current_revision} ${item.current_status ?? "with client"}`}). You can still issue it, but it will show as a problem.</span></div>}
      {canEdit && <div className="actions"><button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>{state?.error && <span className="msg err">{state.error}</span>}{state?.ok && <span className="msg">Saved</span>}</div>}
    </form>
  );
}

function StageRow({ s, label, item, canEdit }: { s: ItemProductionStage; label: string; item: Item; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveStage.bind(null, item.project_id, s.id), null as State);
  const [na, setNa] = useState(s.na);
  const [status, setStatus] = useState(s.status);
  const [dirty, setDirty] = useState(false);
  useRefresh(state);
  useEffect(() => { if (state?.ok) setDirty(false); }, [state?.at]);
  const late = !na && status !== "COMPLETE" && !!s.planned_end && s.planned_end < today();
  const cls = na ? "na" : late ? "late" : status.toLowerCase();
  const d = !canEdit;
  return (
    <form action={action} className={`stage ${cls}${dirty ? " dirty" : ""}`} onChange={() => setDirty(true)}>
      <div className="stage-name"><i className={cls} /><b>{s.stage_no}</b> {label}</div>
      <label className="check"><input type="checkbox" name="na" checked={na} onChange={(e) => setNa(e.target.checked)} disabled={d} /> N/A</label>
      <select name="status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} disabled={d || na} aria-label={`${label} status`}>{STAGE_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <label className="dates"><span>Plan</span><input type="date" name="planned_start" defaultValue={s.planned_start ?? ""} disabled={d || na} aria-label={`${label} planned start`} /><span>→</span><input type="date" name="planned_end" defaultValue={s.planned_end ?? ""} disabled={d || na} aria-label={`${label} planned end`} /></label>
      <label className="dates"><span>Actual</span><input type="date" name="actual_start" defaultValue={s.actual_start ?? ""} disabled={d || na} aria-label={`${label} actual start`} /><span>→</span><input type="date" name="actual_end" defaultValue={s.actual_end ?? ""} disabled={d || na} aria-label={`${label} actual end`} /></label>
      <input name="notes" defaultValue={s.notes ?? ""} placeholder="Note" disabled={d} aria-label={`${label} note`} />
      <div className="stage-save">{canEdit ? <button className={"btn sm" + (dirty ? " bronze" : " ghost")} disabled={pending || !dirty}>{pending ? "…" : "Save"}</button> : <span className="pill">{na ? "N/A" : STAGE_STATUS_LABEL[status]}</span>}{state?.error && <span className="msg err">{state.error}</span>}</div>
      {late && <small className="stage-late">Planned end {fmtDShort(s.planned_end)} has passed</small>}
    </form>
  );
}

function DetailsForm({ item, types, designers, canEdit, canDrawing }: { item: Item; types: ItemType[]; designers: Person[]; canEdit: boolean; canDrawing: boolean }) {
  const [state, action, pending] = useActionState(saveItem.bind(null, item.project_id, item.id), null as State);
  useRefresh(state);
  const d = !canEdit; const dd = !canDrawing && !canEdit;
  return (
    <form action={action} className="form">
      <div className="field wide"><label htmlFor="d-name">Item</label><input id="d-name" name="name" defaultValue={item.name} disabled={d} required /></div>
      <div className="field"><label htmlFor="d-type">Type <small>(code stays {item.item_code})</small></label>
        <select id="d-type" name="type_id" defaultValue={item.type_id} disabled={d}>{types.map((t) => <option key={t.id} value={t.id}>{t.code_letter} · {t.name}</option>)}</select></div>
      <div className="field"><label htmlFor="d-area">Area / room</label><input id="d-area" name="area" defaultValue={item.area ?? ""} disabled={d} /></div>
      <div className="field"><label htmlFor="d-designer">Designer</label>
        <select id="d-designer" name="designer_id" defaultValue={item.designer_id ?? ""} disabled={d}><option value="">—</option>{designers.map((p) => <option key={p.id} value={p.id}>{title(p.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="d-start">Drawing started</label><input id="d-start" name="drawing_started_date" type="date" defaultValue={item.drawing_started_date ?? ""} disabled={dd} /></div>
      <div className="field"><label htmlFor="d-sub">Planned R0 submission</label><input id="d-sub" name="planned_submission" type="date" defaultValue={item.planned_submission ?? ""} disabled={dd} /></div>
      <div className="field wide"><label htmlFor="d-notes">Notes</label><textarea id="d-notes" name="notes" rows={2} defaultValue={item.notes ?? ""} disabled={d && dd} /></div>
      {(canEdit || canDrawing) && <div className="actions"><button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save details"}</button>{state?.error && <span className="msg err">{state.error}</span>}{state?.ok && <span className="msg">Saved</span>}</div>}
    </form>
  );
}

