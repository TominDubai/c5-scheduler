"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PHASES, COMPLETED_STAGE, aedS, fmtDShort, title, ini, tone, delayText, stageAge, type Project, type Stage, type Phase } from "@/lib/model";
import { overrideMove } from "@/app/actions";
import type { ItemCounts } from "@/lib/model";
import Progress from "@/components/Progress";

/**
 * The Board, Workflow Rev 3: one column per phase (decision 2), each card carrying its stage number and who
 * holds the ball. A phase opens into its stages on click. Completed cards sit at the end for 30 days; cards with
 * no stage yet (the old "Site on hold" column) wait in a reconciliation column for Anne and Jinky.
 *
 * The ball moves through handovers on the project page. Dragging is only for admins (Tom, Aftab, Darren, Jinky):
 * it is the recorded override from decision 4 and asks for a reason.
 */
export default function Board({ projects, stages, isAdmin, myId }: { projects: Project[]; stages: Stage[]; isAdmin: boolean; myId: string | null }) {
  const router = useRouter();
  const [rows, setRows] = useState(projects);
  const [open, setOpen] = useState<Set<Phase>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [ask, setAsk] = useState<{ p: Project; stage: number } | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const byNo = new Map(stages.map((s) => [s.stage_no, s]));

  useEffect(() => {
    try { const v = localStorage.getItem("board.open"); if (v) setOpen(new Set(JSON.parse(v))); } catch {}
  }, []);
  function toggle(ph: Phase) {
    setOpen((o) => { const n = new Set(o); if (n.has(ph)) n.delete(ph); else n.add(ph); try { localStorage.setItem("board.open", JSON.stringify([...n])); } catch {} return n; });
  }

  function drop(stage: number) {
    const id = dragId;
    setOver(null); setDragId(null);
    if (!id || !isAdmin) return;
    const p = rows.find((r) => r.id === id);
    if (!p || p.stage === stage) return;
    setAsk({ p, stage });
  }
  function confirmMove(reason: string) {
    if (!ask) return;
    const { p, stage } = ask;
    setAsk(null);
    const prev = rows;
    const s = byNo.get(stage);
    setRows(rows.map((r) => (r.id === p.id ? { ...r, stage, stage_short: s?.short_name ?? r.stage_short, phase: s?.phase ?? r.phase, flow_status: r.flow_status === "ON_HOLD" ? "ON_HOLD" : "ACTIVE", stage_age_days: 0 } : r)));
    start(async () => {
      const res = await overrideMove(p.id, stage, reason);
      if (res?.error) { setRows(prev); setErr(res.error); } else { setErr(null); router.refresh(); }
    });
  }

  const sortCards = (a: Project, b: Project) => (a.stage ?? 99) - (b.stage ?? 99) || (b.stage_age_days ?? 0) - (a.stage_age_days ?? 0);
  const mine = myId ? rows.filter((p) => p.stage !== COMPLETED_STAGE && (p.ball_holder_id === myId || p.pending_to_person_id === myId)).sort(sortCards) : [];
  const completed = rows.filter((p) => p.stage === COMPLETED_STAGE).sort((a, b) => (b.completed_date ?? "") < (a.completed_date ?? "") ? -1 : 1);
  const unstaged = rows.filter((p) => p.stage == null).sort((a, b) => a.name.localeCompare(b.name));

  const card = (p: Project) => (
    <Card key={p.id} p={p} canDrag={isAdmin} dragging={dragId === p.id} mine={!!myId && (p.ball_holder_id === myId || p.pending_to_person_id === myId)}
      onDragStart={() => setDragId(p.id)} onDragEnd={() => { setDragId(null); setOver(null); }} />
  );
  const zone = (stageNo: number) => ({
    onDragOver: (e: React.DragEvent) => { if (!isAdmin) return; e.preventDefault(); if (over !== stageNo) setOver(stageNo); },
    onDragLeave: () => setOver(null),
    onDrop: () => drop(stageNo),
  });

  return (
    <div className="boardwrap">
      {err && <div className="msg err" style={{ padding: "0 24px" }}>Couldn’t move that project: {err}</div>}
      {mine.length > 0 && (
        <section className="myball">
          <h2>My ball <span className="count">{mine.length}</span></h2>
          <div className="myball-cards">{mine.map(card)}</div>
        </section>
      )}
      <div className="board phases" aria-busy={pending}>
        {PHASES.map((ph) => {
          const items = rows.filter((p) => p.stage != null && ph.stages.includes(p.stage)).sort(sortCards);
          const expanded = open.has(ph.key);
          const head = (
            <header className="phasehead">
              <div><span className="phase-k">Phase {PHASES.indexOf(ph) + 1}</span><h2>{ph.label}</h2></div>
              <span className="count">{items.length}</span>
              <button type="button" className="expand" onClick={() => toggle(ph.key)} title={expanded ? "Show as one column" : "Open into stages"} aria-expanded={expanded}>{expanded ? "Fold" : "Stages"}</button>
            </header>
          );
          if (expanded) {
            return (
              <section key={ph.key} className="phase open">
                {head}
                <div className="stagecols">
                  {ph.stages.map((no) => { const s = byNo.get(no); const sub = items.filter((p) => p.stage === no); return (
                    <section key={no} className={`col stagecol${over === no ? " over" : ""}`} {...zone(no)}>
                      <header><b className="stage-no">{no}</b><h3>{s?.short_name ?? no}</h3><span className="count">{sub.length}</span></header>
                      <div className="cards">
                        {sub.length === 0 && <div className="empty">{isAdmin ? "Drop a card here to move it (recorded)" : "Nothing here"}</div>}
                        {sub.map(card)}
                      </div>
                    </section>
                  ); })}
                </div>
              </section>
            );
          }
          return (
            <section key={ph.key} className={`phase col${items.length === 0 ? " emptyphase" : ""}`}>
              {head}
              <div className="cards">
                {items.length === 0 && <div className="empty">Nothing in this phase</div>}
                {ph.stages.map((no) => { const s = byNo.get(no); const sub = items.filter((p) => p.stage === no); if (sub.length === 0 && !isAdmin) return null; return (
                  <div key={no} className={`stagegroup${over === no ? " over" : ""}`} {...zone(no)}>
                    <div className="stagehead"><b className="stage-no">{no}</b><span>{s?.short_name ?? no}</span><span className="count">{sub.length}</span></div>
                    {sub.map(card)}
                  </div>
                ); })}
              </div>
            </section>
          );
        })}
        {(completed.length > 0 || isAdmin) && (
          <section className={`phase col side${over === COMPLETED_STAGE ? " over" : ""}`} {...zone(COMPLETED_STAGE)}>
            <header className="phasehead"><div><span className="phase-k">After stage 16</span><h2>Completed</h2></div><span className="count">{completed.length}</span></header>
            <div className="cards">
              {completed.length === 0 && <div className="empty">Nothing completed in the last 30 days</div>}
              {completed.map(card)}
            </div>
          </section>
        )}
        {unstaged.length > 0 && (
          <section className="phase col side">
            <header className="phasehead"><div><span className="phase-k">Needs reconciliation</span><h2>Stage unknown</h2></div><span className="count">{unstaged.length}</span></header>
            <div className="cards">
              <p className="note" style={{ padding: "0 4px" }}>Carried over from the old “Site on hold” column. Anne or Jinky set the true stage on each card.</p>
              {unstaged.map(card)}
            </div>
          </section>
        )}
      </div>
      {ask && <OverrideDialog p={ask.p} stage={byNo.get(ask.stage)} onCancel={() => setAsk(null)} onConfirm={confirmMove} />}
    </div>
  );
}

function Card({ p, canDrag, dragging, mine, onDragStart, onDragEnd }: { p: Project; canDrag: boolean; dragging: boolean; mine: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  const router = useRouter();
  const t = tone(p);
  const age = stageAge(p);
  const holder = p.ball_holder_full ?? (p.ball_holder ? title(p.ball_holder) : null);
  const awaiting = p.flow_status === "AWAITING_ACCEPTANCE";
  const held = p.flow_status === "ON_HOLD";
  return (
    <article className={`card ${t}${dragging ? " dragging" : ""}${mine ? " mine" : ""}${held ? " held" : ""}`} draggable={canDrag} onDragStart={onDragStart} onDragEnd={onDragEnd}
      tabIndex={0} role="link" onClick={() => router.push(`/projects/${p.id}`)} onKeyDown={(e) => e.key === "Enter" && router.push(`/projects/${p.id}`)}>
      <div className="card-top">
        <span className="enq">{p.enquiry_no ?? "—"}</span>
        {p.stage != null && <span className="stagechip"><b>{p.stage}</b>{p.stage_short}</span>}
        <span className={`pill ${t}`}>{delayText(p)}</span>
      </div>
      <h3>{title(p.name)}</h3>
      <div className="client">{title(p.client)}{p.contractor ? ` · ${p.contractor}` : ""}</div>
      {p.stage === COMPLETED_STAGE ? (
        <div className="ball none"><span className="ball-pos">Completed {fmtDShort(p.completed_date)} · Jean keeps the record</span></div>
      ) : holder ? (
        <div className={`ball${awaiting ? " awaiting" : ""}`}>
          <b className="av lg">{ini(p.ball_holder)}</b>
          <div className="ball-who">
            <span className="ball-name">{holder}{p.ball_holder_can_sign_in === false && <i title="WhatsApp only — Anne records for them"> · WA</i>}</span>
            <span className="ball-pos">{p.ball_holder_position ?? "holds the ball"}{p.stage_migrated ? <em title="Stage set by migration — the owner has not accepted it yet"> · to confirm</em> : null}</span>
          </div>
          {age.text && <span className={`age ${age.tone}`}>{age.text}</span>}
        </div>
      ) : (
        <div className="ball none"><b className="av lg">?</b><div className="ball-who"><span className="ball-name">Nobody holds the ball</span><span className="ball-pos">{p.stage == null ? "stage to be set" : "name an owner"}</span></div></div>
      )}
      {awaiting && <div className="flow bronze">Awaiting acceptance{p.pending_to_person ? <> → <b>{title(p.pending_to_person)}</b></> : null}{p.pending_since ? <small> since {fmtDShort(p.pending_since)}</small> : null}</div>}
      {held && <div className="flow grey">On hold{p.hold_waiting_on ? <> · waiting on <b>{title(p.hold_waiting_on)}</b></> : null}{p.hold_review_date ? <small> · review {fmtDShort(p.hold_review_date)}</small> : null}</div>}
      {p.next_action && <div className="next"><span className="arrow">→</span><span className="next-text">{p.next_action}</span>{p.next_action_owner ? <small>{title(p.next_action_owner)}</small> : null}{p.next_action_due ? <small className={p.next_action_due < new Date().toISOString().slice(0, 10) ? "crit" : ""}>{fmtDShort(p.next_action_due)}</small> : null}</div>}
      <div className="card-foot">
        <span className="who sm" title="Lead project manager">PM&nbsp;<b>{p.pm ? title(p.pm) : "—"}</b>{p.pm2 ? <small> + {title(p.pm2)}</small> : null}</span>
        <span className="val">{p.project_value ? aedS(p.project_value) : "—"}</span>
      </div>
      {p.items && p.items.items_total > 0 && <ItemsStrip c={p.items} />}
      <div className="dates"><span>Start {fmtDShort(p.start_date)}</span><span>Target {fmtDShort(p.target_date)}{p.target_rev ? <span className="rev" title={`Target revised ${p.target_rev} time${p.target_rev === 1 ? "" : "s"}`}>R{p.target_rev}</span> : null}</span></div>
    </article>
  );
}

function OverrideDialog({ p, stage, onCancel, onConfirm }: { p: Project; stage?: Stage; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="ddim" onClick={onCancel}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onConfirm(reason.trim()); }}>
        <h2>Move without acceptance</h2>
        <p><b>{title(p.name)}</b> goes from <b>{p.stage != null ? `${p.stage} ${p.stage_short}` : "no stage"}</b> to <b>{stage ? `${stage.stage_no} ${stage.short_name}` : "—"}</b>. The next owner is not asked to accept — this is recorded against your name as the authoriser.</p>
        <label>Why? <small>(required — Rev 3: a reassignment names who authorised it)</small>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Veronica confirmed on the phone, she's off sick until Monday" /></label>
        <div className="actions"><button className="btn" disabled={!reason.trim()}>Move and record</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
      </form>
    </div>
  );
}

/** Tiny progress strip on the card: items complete / on site / in production / approved / still in drawings. */
function ItemsStrip({ c }: { c: ItemCounts }) {
  const appr = c.items_approved - c.items_in_production - c.items_on_site;
  const todo = c.items_total - c.items_approved;
  return (
    <div className="card-items" title={`${c.items_total} items: ${c.items_complete} complete, ${c.items_on_site - c.items_complete} on site, ${c.items_in_production} in production, ${Math.max(appr, 0)} approved, ${todo} in drawings${c.items_attention ? ` · ${c.items_attention} need attention` : ""}`}>
      <Progress done={c.items_complete} site={c.items_on_site - c.items_complete} prod={c.items_in_production} appr={Math.max(appr, 0)} todo={todo} />
      <small>{c.items_approved}/{c.items_total} approved{c.items_in_production ? ` · ${c.items_in_production} in production` : ""}{c.items_attention ? <b className="crit"> · {c.items_attention} ⚠</b> : null}</small>
    </div>
  );
}
