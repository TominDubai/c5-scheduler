"use client";
import { useWheelSideways } from "@/lib/useWheelSideways";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QUOTE_STAGES, WAITING_ON, DORMANT_AFTER_DAYS, aedS, fmtDShort, title, ini, dueTone, type Project, type QuoteStage } from "@/lib/model";
import { saveWaitingOn } from "@/app/actions";
import { setQuoteStage, setQuoteDormant, markWon, markLost, createQualifying, qualify } from "@/app/actions";

/** a board column: the four pricing stages, with Submitted split into active and dormant (Jinky, 30 Oct) */
type Col = { key: string; stage: QuoteStage; dormant: boolean; label: string; sub?: string };
const COLS: Col[] = QUOTE_STAGES.flatMap(([k, l]): Col[] => k === "SUBMITTED"
  ? [{ key: "SUBMITTED", stage: k, dormant: false, label: "Submitted · active", sub: "chasing, expect a decision" }, { key: "DORMANT", stage: k, dormant: true, label: "Submitted · dormant", sub: "too small or client gone quiet" }]
  : [{ key: k, stage: k, dormant: false, label: l }]);
const daysSince = (d: string | null) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;

/** The Estimation tab: Rev 3 stage 0 (Qualifying, decision 3) on the left, then the four pricing columns of stages 1–2. */
export default function EstimationBoard({ projects, canEdit, canQualify, qualifying }: { projects: Project[]; canEdit: boolean; canQualify: boolean; qualifying: Project[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(projects);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function drop(col: Col) {
    if (!dragId || !canEdit) return;
    const p = rows.find((r) => r.id === dragId);
    setOver(null); setDragId(null);
    if (!p || (p.quote_stage === col.stage && !!p.quote_dormant === col.dormant)) return;
    const prev = rows;
    setRows(rows.map((r) => (r.id === dragId ? { ...r, quote_stage: col.stage, quote_dormant: col.dormant } : r)));
    start(async () => {
      // stage first (the DB clears the dormant flag whenever a quote leaves Submitted), then the flag
      const res = p.quote_stage !== col.stage ? await setQuoteStage(p.id, col.stage) : null;
      const res2 = !res?.error && !!p.quote_dormant !== col.dormant ? await setQuoteDormant(p.id, col.dormant) : null;
      const e = res?.error ?? res2?.error;
      if (e) { setRows(prev); setErr(e); } else { setErr(null); router.refresh(); }
    });
  }
  function toggleDormant(p: Project) {
    const prev = rows; const next = !p.quote_dormant;
    setRows(rows.map((r) => (r.id === p.id ? { ...r, quote_dormant: next } : r)));
    start(async () => {
      const res = await setQuoteDormant(p.id, next);
      if (res?.error) { setRows(prev); setErr(res.error); } else { setErr(null); router.refresh(); }
    });
  }
  function decide(p: Project, won: boolean) {
    const prev = rows;
    setRows(rows.filter((r) => r.id !== p.id));
    start(async () => {
      const res = won ? await markWon(p.id) : await markLost(p.id);
      if (res?.error) { setRows(prev); setErr(res.error); } else { setErr(null); router.refresh(); }
    });
  }

  const boardRef = useWheelSideways<HTMLDivElement>();
  return (
    <>
      {err && <div className="msg err" style={{ padding: "0 24px" }}>Couldn’t save that change: {err}</div>}
      <div className="board" aria-busy={pending} ref={boardRef}>
        <QualifyingColumn projects={qualifying} canQualify={canQualify} canAdd={canQualify || canEdit} onDecide={(p, ok) => {
          start(async () => { const res = await qualify(p.id, ok); if (res?.error) setErr(res.error); else { setErr(null); router.refresh(); } });
        }} />
        {COLS.map((col) => {
          const k = col.stage;
          const items = rows.filter((p) => p.quote_stage === k && !!p.quote_dormant === col.dormant).sort((a, b) => (b.days_since_enquiry ?? 0) - (a.days_since_enquiry ?? 0));
          return (
            <section key={col.key} className={`col${over === col.key ? " over" : ""}${col.dormant ? " dormant" : ""}`}
              onDragOver={(e) => { e.preventDefault(); if (over !== col.key) setOver(col.key); }} onDragLeave={() => setOver(null)} onDrop={() => drop(col)}>
              <header><h2>{col.label}{col.sub && <small className="colsub">{col.sub}</small>}</h2><span className="count">{items.length}</span></header>
              <div className="cards">
                {items.length === 0 && <div className="empty">{canEdit ? "Drop an enquiry here" : "Nothing here"}</div>}
                {items.map((p) => {
                  const age = p.days_since_enquiry ?? 0;
                  const t = col.dormant ? "dormant" : k === "SUBMITTED" ? "done" : age > 21 ? "crit" : age > 10 ? "warn" : "ok";
                  const dd = dueTone(p.quote_due_date); const due = dd?.d ?? null;
                  const quiet = k === "SUBMITTED" ? daysSince(p.quote_submitted_date) : null; // days since it went to the client
                  const nudge = k === "SUBMITTED" && !col.dormant && quiet != null && quiet >= DORMANT_AFTER_DAYS;
                  return (
                    <article key={p.id} className={`card ${t}${dragId === p.id ? " dragging" : ""}`} draggable={canEdit}
                      onDragStart={() => setDragId(p.id)} onDragEnd={() => { setDragId(null); setOver(null); }}
                      tabIndex={0} role="link" onClick={() => router.push(`/projects/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/projects/${p.id}`)}>
                      <div className="card-top"><span className="enq">{p.enquiry_no ?? "—"}{p.parent_project_id && <span className="votag">VO</span>}</span>
                        <span className={`pill ${t}`}>{col.dormant ? `Dormant${p.quote_dormant_since ? ` since ${fmtDShort(p.quote_dormant_since)}` : ""}` : k === "SUBMITTED" ? `Sent ${fmtDShort(p.quote_submitted_date)}` : `${age}d in`}</span></div>
                      <h3>{title(p.name)}{p.quote_type && <span className="qtype">{p.quote_type}</span>}</h3>
                      {p.parent_name && <div className="vofor">VO for <b>{title(p.parent_name)}</b>{p.parent_enquiry_no ? ` (${p.parent_enquiry_no})` : ""}{p.charged_to ? <span className="charged"> · charged to {title(p.charged_to)}</span> : null}</div>}
                      <div className="client">{title(p.client)}{p.contractor ? ` · ${p.contractor}` : ""}</div>
                      <div className="card-foot">
                        <span className="who"><b className="av">{ini(p.estimator)}</b>{p.estimator ? title(p.estimator) : "No estimator"}</span>
                        <span className="val">{p.quoted_value ? aedS(p.quoted_value) : "—"}</span>
                      </div>
                      <div className="dates"><span>{p.received_date ? `Received ${fmtDShort(p.received_date)}` : p.raised_by ? `From ${title(p.raised_by)}` : ""}</span>
                        <span className={dd ? `due ${dd.tone}` : ""}>{due == null ? (k === "SUBMITTED" ? "" : "No due date") : due < 0 ? `Due ${-due}d ago` : due === 0 ? "Due today" : `Due in ${due}d`}</span></div>
                      {k === "AWAITING_SUPPLIER" && (canEdit
                        ? <select className="waiting" value={p.waiting_on ?? ""} onClick={(e) => e.stopPropagation()} onChange={(e) => { const w = e.target.value || null; setRows((rs) => rs.map((r) => r.id === p.id ? { ...r, waiting_on: w } : r)); start(async () => { await saveWaitingOn(p.id, w); }); }}>
                            <option value="">Waiting on…</option>{WAITING_ON.map((w) => <option key={w} value={w}>{w}</option>)}</select>
                        : <div className="waiting-ro">{p.waiting_on ? `Waiting on ${p.waiting_on.toLowerCase()}` : "Waiting on…"}</div>)}
                      {nudge && <div className={`quiet${canEdit ? " act" : ""}`} onClick={(e) => { e.stopPropagation(); if (canEdit) toggleDormant(p); }}>
                        {quiet}d with no answer{canEdit ? " — mark dormant?" : ""}</div>}
                      {k === "SUBMITTED" && canEdit && (
                        <div className="decide" onClick={(e) => e.stopPropagation()}>
                          <button className="btn sm" onClick={() => decide(p, true)}>{p.parent_project_id ? "Won → add VO" : "Won → Award / contract"}</button>
                          <button className="btn sm danger" onClick={() => decide(p, false)}>Lost</button>
                          <button type="button" className="linkbtn park" onClick={() => toggleDormant(p)}>{col.dormant ? "Reactivate" : "Dormant"}</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/** Stage 0 — Enquiry qualification. Anyone with estimation rights can put an opportunity here; only Tom and Aftab (Sales) decide. */
function QualifyingColumn({ projects, canQualify, canAdd, onDecide }: { projects: Project[]; canQualify: boolean; canAdd: boolean; onDecide: (p: Project, proceed: boolean) => void }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => { const r = await createQualifying(prev, fd); if (r.ok) { setAdding(false); router.refresh(); } return r; }, null as { error?: string; ok?: boolean } | null);
  return (
    <section className="col qualifying">
      <header><b className="stage-no">0</b><h2>Qualifying</h2><span className="count">{projects.length}</span>
        {canAdd && <button type="button" className="linkbtn" style={{ marginLeft: "auto" }} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Opportunity"}</button>}</header>
      <div className="cards">
        {adding && (
          <form action={action} className="card addq" onClick={(e) => e.stopPropagation()}>
            <input name="name" required placeholder="Location / address" autoFocus />
            <input name="client" placeholder="Client" />
            <input name="raised_by" placeholder="Who sent it in" />
            <textarea name="notes" rows={2} placeholder="Outline scope, constraints, anything known" />
            {state?.error && <div className="msg err">{state.error}</div>}
            <div className="actions"><button className="btn sm" disabled={pending}>Add to qualifying</button><small className="note">Tom or Aftab say proceed; Ramus then registers it.</small></div>
          </form>
        )}
        {projects.length === 0 && !adding && <div className="empty">Nothing waiting for a proceed / decline</div>}
        {projects.map((p) => (
          <article key={p.id} className="card ok" tabIndex={0} role="link" onClick={() => router.push(`/projects/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/projects/${p.id}`)}>
            <div className="card-top"><span className="enq">no number yet</span><span className="pill">{p.days_since_enquiry ?? 0}d waiting</span></div>
            <h3>{title(p.name)}</h3>
            <div className="client">{title(p.client)}{p.raised_by ? ` · from ${title(p.raised_by)}` : ""}</div>
            {p.notes && <p className="qnotes">{p.notes}</p>}
            <div className="card-foot"><span className="who"><b className="av">{ini(p.ball_holder)}</b>{p.ball_holder ? title(p.ball_holder) : "Sales"}</span><span className="ball-pos">decides</span></div>
            {canQualify && (
              <div className="decide" onClick={(e) => e.stopPropagation()}>
                <button className="btn sm" onClick={() => onDecide(p, true)}>Proceed → Ramus</button>
                <button className="btn sm danger" onClick={() => onDecide(p, false)}>Decline</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
