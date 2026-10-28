"use client";
import { useActionState, useState } from "react";
import { PHASES, type Stage } from "@/lib/model";
import { saveStageDefinition } from "@/app/actions";

type S = { error?: string; ok?: boolean; at?: string } | null;

function StageForm({ s, canEdit }: { s: Stage; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveStageDefinition.bind(null, s.stage_no), null as S);
  const [dirty, setDirty] = useState(false);
  const ro = !canEdit;
  const lines = (xs: string[]) => xs.join("\n");
  return (
    <form action={action} className="stageform panel" onChange={() => setDirty(true)} onSubmit={() => setDirty(false)}>
      <div className="stageform-grid">
        <label>Name<input name="name" defaultValue={s.name} readOnly={ro} required /></label>
        <label>Short name <small>on cards</small><input name="short_name" defaultValue={s.short_name} readOnly={ro} required /></label>
        <label>Department<input name="department" defaultValue={s.department} readOnly={ro} /></label>
        <label>Position <small>under the ball holder</small><input name="position" defaultValue={s.position ?? ""} readOnly={ro} /></label>
        <label className="wide">What the stage is for<textarea name="description" rows={4} defaultValue={s.description ?? ""} readOnly={ro} /></label>
        <label className="wide">Checklist <small>one per line, “key | text” — the ball can’t move until these are ticked</small><textarea name="checklist" rows={Math.max(3, s.checklist.length + 1)} defaultValue={s.checklist.map((c) => `${c.key} | ${c.text}`).join("\n")} readOnly={ro} /></label>
        <label className="wide">Handover evidence <small>Darren’s sentence</small><textarea name="evidence" rows={3} defaultValue={s.evidence ?? ""} readOnly={ro} /></label>
        <label>Supporting <small>one per line, “Name | role”</small><textarea name="supporting" rows={4} defaultValue={lines(s.supporting)} readOnly={ro} /></label>
        <label>Keep in the loop <small>shown, not emailed</small><textarea name="loop" rows={4} defaultValue={lines(s.loop)} readOnly={ro} /></label>
        <label>Must attend <small>makes this a booked meeting</small><textarea name="attendance" rows={4} defaultValue={lines(s.attendance)} readOnly={ro} /></label>
        <label className="check"><input type="checkbox" name="retains_ball" defaultChecked={s.retains_ball} disabled={ro} /> Same person keeps the ball into the next stage (checkpoint, no acceptance)</label>
      </div>
      {canEdit && (
        <div className="actions">
          <button className={"btn sm" + (dirty ? " bronze" : " ghost")} disabled={pending}>{pending ? "Saving…" : "Save stage"}</button>
          {state?.error && <span className="msg err">{state.error}</span>}
          {state?.ok && !dirty && <span className="msg">Saved</span>}
        </div>
      )}
    </form>
  );
}

export default function StageSettings({ stages, canEdit }: { stages: Stage[]; canEdit: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="listview stagelist">
      {stages.map((s) => (
        <details key={s.stage_no} open={open === s.stage_no} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setOpen(s.stage_no); else if (open === s.stage_no) setOpen(null); }}>
          <summary>
            <span className="stagechip"><b>{s.stage_no}</b>{s.name}</span>
            <span className="stagemeta">{PHASES.find((ph) => ph.key === s.phase)?.label ?? s.phase} · {s.department}{s.position ? ` · ${s.position}` : ""} · {s.checklist.length} checklist item{s.checklist.length === 1 ? "" : "s"}{s.attendance.length ? " · meeting" : ""}{s.retains_ball ? " · checkpoint" : ""}</span>
          </summary>
          <StageForm s={s} canEdit={canEdit} />
        </details>
      ))}
    </div>
  );
}
