"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QUOTE_STAGES, WAITING_ON, aedS, fmtDShort, title, ini, dueTone, type Project, type QuoteStage } from "@/lib/model";
import { saveWaitingOn } from "@/app/actions";
import { setQuoteStage, markWon, markLost } from "@/app/actions";

export default function EstimationBoard({ projects, canEdit }: { projects: Project[]; canEdit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(projects);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<QuoteStage | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function drop(stage: QuoteStage) {
    if (!dragId || !canEdit) return;
    const p = rows.find((r) => r.id === dragId);
    setOver(null); setDragId(null);
    if (!p || p.quote_stage === stage) return;
    const prev = rows;
    setRows(rows.map((r) => (r.id === dragId ? { ...r, quote_stage: stage } : r)));
    start(async () => {
      const res = await setQuoteStage(p.id, stage);
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

  return (
    <>
      {err && <div className="msg err" style={{ padding: "0 24px" }}>Couldn’t save that change: {err}</div>}
      <div className="board" aria-busy={pending}>
        {QUOTE_STAGES.map(([k, l]) => {
          const items = rows.filter((p) => p.quote_stage === k).sort((a, b) => (b.days_since_enquiry ?? 0) - (a.days_since_enquiry ?? 0));
          const val = items.reduce((s, p) => s + (p.quoted_value || 0), 0);
          return (
            <section key={k} className={`col${over === k ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); if (over !== k) setOver(k); }} onDragLeave={() => setOver(null)} onDrop={() => drop(k)}>
              <header><h2>{l}</h2><span className="count">{items.length}</span><span className="colval">{val ? aedS(val) : ""}</span></header>
              <div className="cards">
                {items.length === 0 && <div className="empty">{canEdit ? "Drop an enquiry here" : "Nothing here"}</div>}
                {items.map((p) => {
                  const age = p.days_since_enquiry ?? 0;
                  const t = k === "SUBMITTED" ? "done" : age > 21 ? "crit" : age > 10 ? "warn" : "ok";
                  const dd = dueTone(p.quote_due_date); const due = dd?.d ?? null;
                  return (
                    <article key={p.id} className={`card ${t}${dragId === p.id ? " dragging" : ""}`} draggable={canEdit}
                      onDragStart={() => setDragId(p.id)} onDragEnd={() => { setDragId(null); setOver(null); }}
                      tabIndex={0} role="link" onClick={() => router.push(`/projects/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/projects/${p.id}`)}>
                      <div className="card-top"><span className="enq">{p.enquiry_no ?? "—"}</span>
                        <span className={`pill ${t}`}>{k === "SUBMITTED" ? `Sent ${fmtDShort(p.quote_submitted_date)}` : `${age}d in`}</span></div>
                      <h3>{title(p.name)}{p.quote_type && <span className="qtype">{p.quote_type}</span>}</h3>
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
                      {k === "SUBMITTED" && canEdit && (
                        <div className="decide" onClick={(e) => e.stopPropagation()}>
                          <button className="btn sm" onClick={() => decide(p, true)}>Won → Design</button>
                          <button className="btn sm danger" onClick={() => decide(p, false)}>Lost</button>
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
