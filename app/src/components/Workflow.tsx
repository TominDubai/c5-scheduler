"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FLOW_LABEL, COMPLETED_STAGE, fmtD, fmtDShort, title, ini, stageAge, type Project, type Stage, type Person, type Me, type Handover, type Hold, type StageEvidence, type ProjectTask, type StageOwner } from "@/lib/model";
import { requestHandover, acceptHandover, recordAcceptance, returnHandover, cancelHandover, overrideAccept, putOnHold, releaseHold, saveNextAction, tickChecklist, addEvidence, removeEvidence, evidenceUrl, addTask, setTaskDone, reassignBall } from "@/app/actions";

type Props = {
  project: Project; stages: Stage[]; owners: StageOwner[]; people: Person[]; me: Me;
  handovers: Handover[]; holds: Hold[]; evidence: StageEvidence[]; tasks: ProjectTask[]; locked?: boolean;
};
type S = { error?: string; ok?: boolean; at?: string } | null;
const fmtWhen = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * The project page's Rev 3 blocks: who has the ball, the stage checklist with evidence, the handover drawer
 * (request / accept / return / Anne's record-on-behalf), the hold panel, next action, supporting tasks and the
 * handover history. Rules live in the database triggers; this component only shows the buttons each person can use.
 */
export default function Workflow({ project: p, stages, owners, people, me, handovers, holds, evidence, tasks, locked }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "request" | "hold" | "reassign">(null);
  const stage = stages.find((s) => s.stage_no === p.stage) ?? null;
  const byId = new Map(people.map((x) => [x.id, x]));
  const name = (id: string | null | undefined) => (id && byId.get(id)) ? (byId.get(id)!.full_name ?? title(byId.get(id)!.name)) : "—";
  const iHold = !!me.id && p.ball_holder_id === me.id;
  const coord = me.role === "PROJECT_COORDINATOR" || me.canProjects;
  const canRequest = !locked && p.stage != null && p.stage !== COMPLETED_STAGE && (iHold || me.isAdmin || coord);
  const canHold = canRequest;
  const pending = handovers.find((h) => h.status === "PENDING") ?? null;
  const iAmNext = !!pending && pending.to_person_id === me.id;
  const openHold = holds.find((h) => !h.released_at) ?? null;
  const ticks = new Map(evidence.filter((e) => e.item_key && e.stage_no === p.stage).map((e) => [e.item_key!, e]));
  const files = evidence.filter((e) => !e.item_key && e.stage_no === p.stage);
  const checklist = stage?.checklist ?? [];
  const doneCount = checklist.filter((c) => ticks.get(c.key)?.done).length;
  const age = stageAge(p);
  const run = (fn: () => Promise<{ error?: string } | undefined>) => start(async () => { const r = await fn(); if (r?.error) setErr(r.error); else { setErr(null); router.refresh(); } });
  const loopList = stage?.loop ?? [];
  const supporting = stage?.supporting ?? [];

  return (
    <>
      {err && <div className="msg err">{err}</div>}
      {/* ---- who has the ball ---- */}
      <div className={`panel ballblock${p.flow_status === "AWAITING_ACCEPTANCE" ? " awaiting" : ""}${p.flow_status === "ON_HOLD" ? " held" : ""}`}>
        <div className="ball-main">
          <div className="ball-stage">
            <span className="phase-k">Stage {p.stage ?? "—"} · {p.department ?? ""}</span>
            <h2 className="ball-stagename">{p.stage_name ?? (p.status === "LOST" ? "Lost" : p.status === "MERGED" ? "Added as VO" : "Stage not set yet")}</h2>
            {age.text && <span className={`pill ${age.tone}`}>{age.text}{p.stage_entered_at ? ` · since ${fmtDShort(p.stage_entered_at)}` : ""}</span>}
          </div>
          {p.stage === COMPLETED_STAGE ? (
            <div className="ball-holder done"><div><b>No active ball</b><span>Completed {fmtD(p.completed_date)} · Jean keeps the record</span></div></div>
          ) : (
            <div className="ball-holder">
              <b className="av xl">{ini(p.ball_holder)}</b>
              <div>
                <span className="ball-label">Who has the ball</span>
                <b className="ball-big">{p.ball_holder ? (p.ball_holder_full ?? title(p.ball_holder)) : "Nobody"}</b>
                <span className="ball-sub">{p.ball_holder_position ?? (p.ball_holder ? "" : "name an owner on the Team page")}{p.ball_holder_can_sign_in === false ? " · WhatsApp only, Anne records for them" : ""}</span>
                {p.stage_migrated && <span className="ball-migrated">Stage set by migration — {p.ball_holder ? name(p.ball_holder_id) : "the owner"} has not accepted it yet.{(iHold || me.isAdmin) && <button type="button" className="linkbtn" onClick={() => run(async () => { const r = await overrideAcceptMigration(p.id); return r; })}> I confirm this stage</button>}</span>}
              </div>
            </div>
          )}
          <div className="ball-status">
            <span className={`flowtag big ${p.flow_status === "ON_HOLD" ? "grey" : p.flow_status === "AWAITING_ACCEPTANCE" ? "bronze" : "ok"}`}>{FLOW_LABEL[p.flow_status]}</span>
            {pending && <span className="ball-sub">→ {name(pending.to_person_id)} · stage {pending.to_stage} {stages.find((s) => s.stage_no === pending.to_stage)?.short_name} · asked {fmtWhen(pending.requested_at)}</span>}
            {openHold && <span className="ball-sub">Waiting on <b>{openHold.waiting_on_person_id ? name(openHold.waiting_on_person_id) : openHold.waiting_on ?? "—"}</b>{openHold.review_date ? ` · review ${fmtDShort(openHold.review_date)}` : ""}</span>}
          </div>
        </div>
        {/* pending handover: the next owner's buttons, Anne's record-on-behalf, the admin override, the requester's withdraw */}
        {pending && !locked && (
          <div className="pendingbox">
            <div><b>{name(pending.from_person_id)}</b> asked <b>{name(pending.to_person_id)}</b> to take <b>stage {pending.to_stage} — {stages.find((s) => s.stage_no === pending.to_stage)?.name}</b>{pending.note ? <> — “{pending.note}”</> : null}{pending.recorded_by ? <small> (recorded by {name(pending.recorded_by)})</small> : null}</div>
            {iAmNext && <AcceptReturn projectId={p.id} h={pending} />}
            {!iAmNext && coord && <RecordOnBehalf projectId={p.id} h={pending} who={name(pending.to_person_id)} />}
            {!iAmNext && me.isAdmin && <OverrideAccept projectId={p.id} h={pending} who={name(pending.to_person_id)} />}
            {(pending.requested_by === me.id || pending.from_person_id === me.id || me.isAdmin || coord) && <button type="button" className="btn ghost sm" onClick={() => run(() => cancelHandover(p.id, pending.id))}>Withdraw request</button>}
          </div>
        )}
        <div className="ball-actions">
          {canRequest && !pending && p.next_stage != null && <button type="button" className="btn bronze" onClick={() => setDrawer("request")}>{p.retains_ball ? "Record checkpoint →" : "Request handover →"} {stages.find((s) => s.stage_no === p.next_stage)?.short_name}</button>}
          {canRequest && !pending && <button type="button" className="btn ghost" onClick={() => setDrawer("request")}>Hand to another stage…</button>}
          {canHold && !openHold && <button type="button" className="btn ghost" onClick={() => setDrawer("hold")}>Put on hold</button>}
          {openHold && (me.isAdmin || coord || iHold || openHold.created_by === me.id) && <ReleaseHold projectId={p.id} hold={openHold} />}
          {(me.isAdmin || me.canTeam) && p.stage !== COMPLETED_STAGE && p.stage != null && <button type="button" className="btn ghost" onClick={() => setDrawer("reassign")}>Reassign ball…</button>}
        </div>
        {stage?.description && <p className="stage-desc">{stage.description}</p>}
        {(loopList.length > 0 || supporting.length > 0) && (
          <div className="loop">
            {supporting.length > 0 && <div><span className="loop-k">Supporting</span>{supporting.map((s, i) => <span key={i} className="loop-chip" title={s}>{s.split(" | ")[0]}</span>)}</div>}
            {loopList.length > 0 && <div><span className="loop-k">Keep in the loop</span>{loopList.map((s, i) => <span key={i} className="loop-chip" title={s}>{s.split(" | ")[0]}</span>)}<small className="note"> — shown, not emailed</small></div>}
            {stage?.attendance?.length ? <div><span className="loop-k">Must attend</span>{stage.attendance.map((s, i) => <span key={i} className="loop-chip" title={s}>{s.split(" | ")[0]}</span>)}</div> : null}
          </div>
        )}
      </div>

      {/* ---- hold ---- */}
      {openHold && (
        <div className="panel holdpanel">
          <h2>On hold</h2>
          <dl>
            <dt>Reason</dt><dd>{openHold.reason}</dd>
            <dt>Waiting on</dt><dd>{openHold.waiting_on_person_id ? name(openHold.waiting_on_person_id) : openHold.waiting_on ?? "—"}</dd>
            <dt>Required action</dt><dd>{openHold.required_action ?? "—"}{openHold.action_due ? <small> · due {fmtD(openHold.action_due)}</small> : null}</dd>
            <dt>Blocked since</dt><dd>{fmtWhen(openHold.blocked_since)} <small>by {name(openHold.created_by)}</small></dd>
            <dt>Next review</dt><dd>{fmtD(openHold.review_date)}</dd>
          </dl>
          <p className="note">The stage and owner stay as they are — holding the card means responsibility for the follow-up, not fault.</p>
        </div>
      )}

      <div className="grid2">
        {/* ---- next action ---- */}
        <div className="panel">
          <h2>Next action</h2>
          <NextAction project={p} people={people} canEdit={!locked && (iHold || me.isAdmin || coord)} />
        </div>
        {/* ---- supporting tasks ---- */}
        <div className="panel">
          <h2>Supporting tasks <small>{tasks.filter((t) => !t.done_at).length} open</small></h2>
          <Tasks projectId={p.id} tasks={tasks} people={people} canEdit={!locked && !!me.id} nameOf={name} />
        </div>
      </div>

      {/* ---- checklist + evidence ---- */}
      {stage && checklist.length > 0 && (
        <div className="panel checklist">
          <h2>Stage {stage.stage_no} checklist <small>{doneCount}/{checklist.length} done</small></h2>
          <ul className="ticks">
            {checklist.map((c) => { const e = ticks.get(c.key); const done = !!e?.done; return (
              <li key={c.key} className={done ? "done" : ""}>
                <label><input type="checkbox" checked={done} disabled={locked || !(iHold || me.isAdmin || coord)} onChange={(ev) => run(() => tickChecklist(p.id, stage.stage_no, c.key, ev.target.checked, e?.note))} /><span>{c.text}</span></label>
                {e?.done && e.by && <small>{name(e.by)} · {fmtWhen(e.at)}</small>}
              </li>
            ); })}
          </ul>
          {stage.evidence && <p className="note evidence-note"><b>Handover evidence:</b> {stage.evidence}</p>}
          <Evidence projectId={p.id} stageNo={stage.stage_no} files={files} canEdit={!locked && !!me.id} canRemove={me.isAdmin || iHold} nameOf={name} />
        </div>
      )}

      {/* ---- history ---- */}
      <div className="panel">
        <h2>Handover history</h2>
        {handovers.length === 0 ? <span style={{ color: "var(--fg3)" }}>No handovers yet.</span> : (
          <ul className="hist handovers">
            {handovers.map((h) => { const to = stages.find((s) => s.stage_no === h.to_stage); const from = stages.find((s) => s.stage_no === h.from_stage); return (
              <li key={h.id} className={h.status.toLowerCase()}>
                <time>{fmtDShort(h.accepted_at ?? h.returned_at ?? h.requested_at)}</time>
                <span className={`flowtag ${h.status === "ACCEPTED" ? "ok" : h.status === "RETURNED" ? "crit" : h.status === "PENDING" ? "bronze" : h.status === "OVERRIDE" ? "warn" : "grey"}`}>{h.status === "MIGRATED" ? "Migrated" : h.status === "OVERRIDE" ? "Moved by admin" : h.status === "CHECKPOINT" ? "Checkpoint" : title(h.status)}</span>
                <span>{from ? <>{from.stage_no} {from.short_name} <span className="arrow">→</span> </> : null}<b>{to ? `${to.stage_no} ${to.short_name}` : h.to_stage}</b></span>
                <span className="by">{h.from_person_id ? `${name(h.from_person_id)} → ` : ""}{name(h.to_person_id)}{h.recorded_by ? ` · recorded by ${name(h.recorded_by)}` : ""}{h.authorised_by ? ` · authorised by ${name(h.authorised_by)}` : ""}</span>
                {(h.note || h.return_reason || h.override_reason || h.acceptance_evidence) && <span className="hist-note">{h.return_reason ? `Returned: ${h.return_reason}` : h.override_reason ? h.override_reason : h.acceptance_evidence ? `“${h.acceptance_evidence}”${h.evidence_time ? ` — ${fmtWhen(h.evidence_time)}` : ""}` : h.note}</span>}
              </li>
            ); })}
          </ul>
        )}
      </div>

      {drawer === "request" && <RequestDrawer project={p} stages={stages} owners={owners} people={people} me={me} checklistMissing={checklist.filter((c) => !ticks.get(c.key)?.done).map((c) => c.text)} onClose={() => setDrawer(null)} />}
      {drawer === "hold" && <HoldDrawer project={p} people={people} onClose={() => setDrawer(null)} />}
      {drawer === "reassign" && <ReassignDrawer project={p} people={people} onClose={() => setDrawer(null)} />}
    </>
  );
}

/** "I confirm this stage" on a migrated card: the owner (or an admin) accepting the migrated stage is the reconciliation step. */
async function overrideAcceptMigration(projectId: string) {
  const { confirmMigratedStage } = await import("@/app/actions");
  return confirmMigratedStage(projectId);
}

function AcceptReturn({ projectId, h }: { projectId: string; h: Handover }) {
  const router = useRouter();
  const [returning, setReturning] = useState(false);
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => { const r = await returnHandover(projectId, h.id, prev, fd); if (r.ok) router.refresh(); return r; }, null as S);
  return (
    <div className="accept">
      {!returning ? (
        <div className="actions">
          <button type="button" className="btn bronze" onClick={() => start(async () => { const r = await acceptHandover(projectId, h.id); if (r?.error) setErr(r.error); else router.refresh(); })}>Accept — I take the ball</button>
          <button type="button" className="btn ghost" onClick={() => setReturning(true)}>Return with a reason</button>
          {err && <span className="msg err">{err}</span>}
        </div>
      ) : (
        <form action={action} className="inline-form">
          <input name="return_reason" required autoFocus placeholder="What's missing? e.g. no FOR PRODUCTION email, drawing register not current" />
          <button className="btn danger sm" disabled={pending}>Return to {h.from_person_id ? "the outgoing owner" : "sender"}</button>
          <button type="button" className="btn ghost sm" onClick={() => setReturning(false)}>Cancel</button>
          {state?.error && <span className="msg err">{state.error}</span>}
        </form>
      )}
    </div>
  );
}

/** Anne's route: the acceptance came on WhatsApp; she pastes the message, records when it was sent. She is the recorder, not the owner. */
function RecordOnBehalf({ projectId, h, who }: { projectId: string; h: Handover; who: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => { const r = await recordAcceptance(projectId, h.id, prev, fd); if (r.ok) router.refresh(); return r; }, null as S);
  if (!open) return <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>Record {who}’s acceptance (WhatsApp)…</button>;
  return (
    <form action={action} className="onbehalf">
      <label>Paste {who}’s acceptance message <small>(the exact message — it is the evidence)</small>
        <textarea name="acceptance_evidence" rows={3} required autoFocus placeholder={`Project … — I accept … responsibility. Next action: … Target: … Blocker: … — ${who.split(" ")[0]}`} /></label>
      <label>When was it sent? <input type="datetime-local" name="evidence_time" /></label>
      <div className="actions"><button className="btn bronze sm" disabled={pending}>Record acceptance on {who.split(" ")[0]}’s behalf</button><button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>{state?.error && <span className="msg err">{state.error}</span>}</div>
      <small className="note">A read receipt, or a message from someone else, is not their acceptance.</small>
    </form>
  );
}

function OverrideAccept({ projectId, h, who }: { projectId: string; h: Handover; who: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => { const r = await overrideAccept(projectId, h.id, prev, fd); if (r.ok) router.refresh(); return r; }, null as S);
  if (!open) return <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>Move it without {who.split(" ")[0]}’s acceptance…</button>;
  return (
    <form action={action} className="inline-form">
      <input name="override_reason" required autoFocus placeholder="Why — recorded against your name as the authoriser" />
      <button className="btn sm" disabled={pending}>Move and record</button>
      <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
      {state?.error && <span className="msg err">{state.error}</span>}
    </form>
  );
}

function ReleaseHold({ projectId, hold }: { projectId: string; hold: Hold }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => { const r = await releaseHold(projectId, hold.id, prev, fd); if (r.ok) { setOpen(false); router.refresh(); } return r; }, null as S);
  if (!open) return <button type="button" className="btn" onClick={() => setOpen(true)}>Release hold</button>;
  return (
    <form action={action} className="inline-form">
      <input name="release_note" autoFocus placeholder="What unblocked it? (optional)" />
      <button className="btn sm" disabled={pending}>Release</button>
      <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
      {state?.error && <span className="msg err">{state.error}</span>}
    </form>
  );
}

function NextAction({ project: p, people, canEdit }: { project: Project; people: Person[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => { const r = await saveNextAction(p.id, prev, fd); if (r.ok) { setEditing(false); router.refresh(); } return r; }, null as S);
  const overdue = !!p.next_action_due && p.next_action_due < new Date().toISOString().slice(0, 10);
  if (!editing) return (
    <div className="nextaction">
      {p.next_action ? <><div className="next-big">{p.next_action}</div><div className="ball-sub">{p.next_action_owner ? title(p.next_action_owner) : "no owner"}{p.next_action_due ? <> · due <b className={overdue ? "crit" : ""}>{fmtD(p.next_action_due)}</b></> : null}</div></> : <span style={{ color: "var(--fg3)" }}>Nothing recorded. One clear next step and who does it.</span>}
      {canEdit && <button type="button" className="linkbtn" onClick={() => setEditing(true)}>{p.next_action ? "Change" : "Set next action"}</button>}
    </div>
  );
  return (
    <form action={action} className="form compact">
      <div className="field wide"><label htmlFor="next_action">What happens next</label><input id="next_action" name="next_action" defaultValue={p.next_action ?? ""} autoFocus placeholder="e.g. Send revised layout to client" /></div>
      <div className="field"><label htmlFor="next_action_owner_id">Who</label><select id="next_action_owner_id" name="next_action_owner_id" defaultValue={p.next_action_owner_id ?? ""}><option value="">—</option>{people.map((x) => <option key={x.id} value={x.id}>{title(x.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="next_action_due">Due</label><input id="next_action_due" name="next_action_due" type="date" defaultValue={p.next_action_due ?? ""} /></div>
      <div className="actions"><button className="btn sm" disabled={pending}>Save</button><button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>{state?.error && <span className="msg err">{state.error}</span>}</div>
    </form>
  );
}

function Tasks({ projectId, tasks, people, canEdit, nameOf }: { projectId: string; tasks: ProjectTask[]; people: Person[]; canEdit: boolean; nameOf: (id: string | null) => string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => { const r = await addTask(projectId, prev, fd); if (r.ok) { setAdding(false); router.refresh(); } return r; }, null as S);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="tasks">
      {tasks.length === 0 && !adding && <span style={{ color: "var(--fg3)" }}>Purchasing, reviews, payment checks, corrections — they sit here under the card and never move it.</span>}
      <ul className="ticks">
        {tasks.map((t) => (
          <li key={t.id} className={t.done_at ? "done" : ""}>
            <label><input type="checkbox" checked={!!t.done_at} disabled={!canEdit} onChange={(e) => start(async () => { await setTaskDone(projectId, t.id, e.target.checked); router.refresh(); })} /><span>{t.title}</span></label>
            <small>{t.owner_id ? nameOf(t.owner_id) : "no owner"}{t.due ? <> · <b className={!t.done_at && t.due < today ? "crit" : ""}>{fmtDShort(t.due)}</b></> : null}</small>
          </li>
        ))}
      </ul>
      {canEdit && !adding && <button type="button" className="linkbtn" onClick={() => setAdding(true)}>+ Task</button>}
      {adding && (
        <form action={action} className="inline-form wrap">
          <input name="title" required autoFocus placeholder="e.g. Chase stone supplier for lead time" style={{ flex: "1 1 220px" }} />
          <select name="owner_id" defaultValue=""><option value="">Owner</option>{people.map((x) => <option key={x.id} value={x.id}>{title(x.name)}</option>)}</select>
          <input type="date" name="due" />
          <button className="btn sm" disabled={pending}>Add</button><button type="button" className="btn ghost sm" onClick={() => setAdding(false)}>Cancel</button>
          {state?.error && <span className="msg err">{state.error}</span>}
        </form>
      )}
    </div>
  );
}

/** Evidence files go straight from the browser into the private `evidence` bucket, then a row records them. Works from a phone. */
function Evidence({ projectId, stageNo, files, canEdit, canRemove, nameOf }: { projectId: string; stageNo: number; files: StageEvidence[]; canEdit: boolean; canRemove: boolean; nameOf: (id: string | null) => string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    for (const f of Array.from(list)) {
      if (f.size > 25 * 1024 * 1024) { setErr(`${f.name} is over 25 MB.`); continue; }
      const path = `${projectId}/${stageNo}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("evidence").upload(path, f, { upsert: false, contentType: f.type || undefined });
      if (error) { setErr(`${f.name}: ${error.message}`); continue; }
      const r = await addEvidence(projectId, stageNo, { file_path: path, file_name: f.name });
      if (r?.error) setErr(r.error);
    }
    setBusy(false); if (fileRef.current) fileRef.current.value = ""; router.refresh();
  }
  async function open(e: StageEvidence) {
    if (e.link_url) { window.open(e.link_url, "_blank"); return; }
    if (e.file_path) { const r = await evidenceUrl(e.file_path); if (r.url) window.open(r.url, "_blank"); else setErr(r.error ?? "Couldn’t open that file."); }
  }
  return (
    <div className="evidence">
      <div className="evidence-head"><span className="loop-k">Evidence</span>
        {canEdit && <>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.dwg,.zip,.msg,.eml" />
          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Uploading…" : "Upload file"}</button>
          <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (!link.trim()) return; const r = await addEvidence(projectId, stageNo, { link_url: link.trim(), file_name: link.trim().replace(/^https?:\/\//, "").slice(0, 60) }); if (r?.error) setErr(r.error); else { setLink(""); router.refresh(); } }}>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="or paste a link (server folder, DocuSign, email)" /><button className="btn ghost sm" disabled={!link.trim()}>Add link</button>
          </form>
        </>}
      </div>
      {err && <div className="msg err">{err}</div>}
      {files.length === 0 ? <span className="note">Nothing attached for this stage yet.</span> : (
        <ul className="files">
          {files.map((e) => (
            <li key={e.id}>
              <button type="button" className="filelink" onClick={() => open(e)}>{e.link_url ? "🔗" : "📎"} {e.file_name ?? e.link_url ?? e.file_path}</button>
              <small>{nameOf(e.by)} · {fmtWhen(e.at)}</small>
              {canRemove && <button type="button" className="x" title="Remove" onClick={() => { if (confirm("Remove this attachment?")) removeEvidence(projectId, e.id).then(() => router.refresh()); }}>×</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestDrawer({ project: p, stages, owners, people, me, checklistMissing, onClose }: { project: Project; stages: Stage[]; owners: StageOwner[]; people: Person[]; me: Me; checklistMissing: string[]; onClose: () => void }) {
  const router = useRouter();
  const [toStage, setToStage] = useState<number>(p.next_stage ?? (p.stage ?? 0) + 1);
  const target = stages.find((s) => s.stage_no === toStage);
  const defaultOwner = target?.owner_rule === "ALLOCATED_PM" ? p.pm_id : target?.owner_rule === "NONE" ? null : owners.find((o) => o.stage_no === toStage)?.person_id ?? null;
  const [owner, setOwner] = useState<string>(defaultOwner ?? "");
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => { const r = await requestHandover(p.id, prev, fd); if (r.ok) { onClose(); router.refresh(); } return r; }, null as S);
  const strict = checklistMissing.length > 0 && !me.isAdmin;
  const retains = owner !== "" && owner === p.ball_holder_id;   // same person carries on: a checkpoint, no acceptance needed
  const who = people.find((x) => x.id === owner);
  return (
    <div className="ddim" onClick={onClose}>
      <form action={action} className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div><span className="phase-k">Handover</span><h2>{retains ? "Record the checkpoint" : "Request handover"}</h2></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="dsec">
          <h3>From</h3>
          <div><b>Stage {p.stage} — {p.stage_name}</b> · {p.ball_holder ? (p.ball_holder_full ?? title(p.ball_holder)) : "nobody"} holds the ball</div>
        </div>
        <div className="dsec">
          <h3>To</h3>
          <div className="field"><label htmlFor="to_stage">Stage</label>
            <select id="to_stage" name="to_stage" value={toStage} onChange={(e) => { const n = parseInt(e.target.value, 10); setToStage(n); const t = stages.find((s) => s.stage_no === n); setOwner((t?.owner_rule === "ALLOCATED_PM" ? p.pm_id : t?.owner_rule === "NONE" ? null : owners.find((o) => o.stage_no === n)?.person_id) ?? ""); }}>
              {stages.filter((s) => s.stage_no !== p.stage && s.stage_no >= 1).map((s) => <option key={s.stage_no} value={s.stage_no}>{s.stage_no} · {s.name}{s.stage_no === p.next_stage ? " (next)" : s.stage_no < (p.stage ?? 0) ? " (back)" : ""}</option>)}
            </select></div>
          {target?.owner_rule !== "NONE" && (
            <div className="field"><label htmlFor="to_person_id">Next owner <small>{target?.owner_rule === "ALLOCATED_PM" ? "— this project's lead PM" : target ? `— ${target.position ?? "default owner"}` : ""}</small></label>
              <select id="to_person_id" name="to_person_id" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">— pick someone —</option>
                {people.map((x) => <option key={x.id} value={x.id}>{x.full_name ?? title(x.name)}{x.position ? ` · ${x.position}` : ""}{!x.can_sign_in ? " (WhatsApp only)" : ""}</option>)}
              </select>
              {who && !who.can_sign_in && <small className="note">{who.full_name ?? title(who.name)} can’t sign in — Anne records their WhatsApp acceptance on their behalf.</small>}
              {toStage < (p.stage ?? 0) && <small className="note">Going back a stage is a recorded return: the receiving owner still has to accept it.</small>}
            </div>
          )}
          <div className="field"><label htmlFor="note">Note to {who ? (who.full_name ?? title(who.name)).split(" ")[0] : "the next owner"}</label><textarea id="note" name="note" rows={3} placeholder="What they're receiving, where the files are, anything open" /></div>
        </div>
        {checklistMissing.length > 0 && (
          <div className={`dsec ${strict ? "warn" : ""}`}>
            <h3>Checklist not complete</h3>
            <ul className="missing">{checklistMissing.map((m) => <li key={m}>{m}</li>)}</ul>
            <small className="note">{strict ? "Tick the stage checklist (and attach the evidence) before requesting the handover — Rev 3 step 1." : "You’re an admin, so this can go anyway; the gaps stay visible on the card."}</small>
          </div>
        )}
        <div className="actions">
          <button className="btn bronze" disabled={pending || strict || (target?.owner_rule !== "NONE" && !owner)}>{retains ? "Record checkpoint" : "Send the request"}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          {state?.error && <span className="msg err">{state.error}</span>}
        </div>
        <small className="note">{retains ? `${p.ball_holder ? title(p.ball_holder) : "The owner"} keeps the ball — the stage moves now and the checkpoint is time-stamped.` : `The card stays with ${p.ball_holder ? title(p.ball_holder) : "the current owner"} as “Awaiting acceptance” until ${who ? (who.full_name ?? title(who.name)).split(" ")[0] : "the next owner"} accepts. No answer, no move.`}</small>
      </form>
    </div>
  );
}

function HoldDrawer({ project: p, people, onClose }: { project: Project; people: Person[]; onClose: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => { const r = await putOnHold(p.id, prev, fd); if (r.ok) { onClose(); router.refresh(); } return r; }, null as S);
  return (
    <div className="ddim" onClick={onClose}>
      <form action={action} className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div><span className="phase-k">Hold</span><h2>Put on hold</h2></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <p className="note">The stage and owner stay the same ({p.stage_name} · {p.ball_holder ? title(p.ball_holder) : "—"}). Record who or what you are waiting on, what has to happen, and when you’ll look at it again.</p>
        <div className="dsec">
          <div className="field"><label htmlFor="reason">Reason</label><input id="reason" name="reason" required autoFocus placeholder="e.g. Client has not approved the design" /></div>
          <div className="form compact">
            <div className="field"><label htmlFor="waiting_on_person_id">Waiting on (team)</label><select id="waiting_on_person_id" name="waiting_on_person_id" defaultValue=""><option value="">—</option>{people.map((x) => <option key={x.id} value={x.id}>{title(x.name)}</option>)}</select></div>
            <div className="field"><label htmlFor="waiting_on">… or outside</label><input id="waiting_on" name="waiting_on" placeholder="Client, supplier name, consultant" /></div>
            <div className="field wide"><label htmlFor="required_action">Required action</label><input id="required_action" name="required_action" placeholder="e.g. PM to chase client approval by email" /></div>
            <div className="field"><label htmlFor="action_due">Action due</label><input id="action_due" name="action_due" type="date" /></div>
            <div className="field"><label htmlFor="review_date">Next review</label><input id="review_date" name="review_date" type="date" /></div>
          </div>
        </div>
        <div className="actions"><button className="btn" disabled={pending}>Put on hold</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button>{state?.error && <span className="msg err">{state.error}</span>}</div>
      </form>
    </div>
  );
}

function ReassignDrawer({ project: p, people, onClose }: { project: Project; people: Person[]; onClose: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => { const r = await reassignBall(p.id, prev, fd); if (r.ok) { onClose(); router.refresh(); } return r; }, null as S);
  return (
    <div className="ddim" onClick={onClose}>
      <form action={action} className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div><span className="phase-k">Reassignment</span><h2>Reassign the ball</h2></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <p className="note">For leave or capacity. Names one replacement and records who authorised it; the former owner stops holding the ball at the same moment. The stage does not change.</p>
        <div className="dsec">
          <div className="field"><label htmlFor="to_person_id">Replacement for {p.ball_holder ? (p.ball_holder_full ?? title(p.ball_holder)) : "—"}</label><select id="to_person_id" name="to_person_id" required defaultValue=""><option value="">— pick someone —</option>{people.filter((x) => x.id !== p.ball_holder_id).map((x) => <option key={x.id} value={x.id}>{x.full_name ?? title(x.name)}{x.position ? ` · ${x.position}` : ""}</option>)}</select></div>
          <div className="field"><label htmlFor="reason">Why</label><input id="reason" name="reason" required placeholder="e.g. Annual leave until 12 Nov" /></div>
        </div>
        <div className="actions"><button className="btn" disabled={pending}>Reassign and record</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button>{state?.error && <span className="msg err">{state.error}</span>}</div>
      </form>
    </div>
  );
}
