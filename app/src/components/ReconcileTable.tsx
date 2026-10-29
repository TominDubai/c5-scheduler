"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { title, type Project, type Stage, type StageOwner, type Person } from "@/lib/model";
import { reconcileCard } from "@/app/actions";

type Props = { projects: Project[]; stages: Stage[]; owners: StageOwner[]; people: Person[]; canEdit: boolean };

export default function ReconcileTable({ projects, stages, owners, people, canEdit }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // what each row currently says, keyed by project; untouched rows keep the migrated values
  const [edits, setEdits] = useState<Record<string, { stage: number | null; ball: string | null }>>({});
  const own = new Map(owners.map((o) => [o.stage_no, o.person_id]));
  const byNo = new Map(stages.map((s) => [s.stage_no, s]));
  const active = people.filter((p) => p.is_active);
  const nameOf = (id: string | null) => { const p = people.find((x) => x.id === id); return p ? (p.full_name ?? title(p.name)) : null; };
  const suggested = (stageNo: number | null, p: Project) => { const s = stageNo != null ? byNo.get(stageNo) : null; if (!s) return null; return s.owner_rule === "ALLOCATED_PM" ? p.pm_id : s.owner_rule === "NONE" ? null : (own.get(s.stage_no) ?? null); };
  const current = (p: Project) => edits[p.id] ?? { stage: p.stage, ball: p.ball_holder_id };
  const setStage = (p: Project, stage: number | null) => setEdits({ ...edits, [p.id]: { stage, ball: suggested(stage, p) } });
  const setBall = (p: Project, ball: string | null) => setEdits({ ...edits, [p.id]: { ...current(p), ball } });
  const confirm = (p: Project) => {
    const c = current(p);
    if (c.stage == null) { setErr(`${title(p.name)}: pick a stage first.`); return; }
    setBusy(p.id);
    start(async () => {
      const r = await reconcileCard(p.id, c.stage !== p.stage ? c.stage : null, c.ball);
      setBusy(null);
      if (r?.error) setErr(r.error); else { setErr(null); router.refresh(); }
    });
  };
  if (projects.length === 0) return <div className="listview"><div className="empty">Every live card has been confirmed. Nothing to do here.</div></div>;
  return (
    <div className="listview">
      {err && <div className="msg err">{err}</div>}
      <div className="tablewrap team">
        <table>
          <thead><tr><th>Enquiry</th><th>Project</th><th>Lead PM</th><th>Old status</th><th>Stage</th><th>Holds the ball</th><th /></tr></thead>
          <tbody>
            {projects.map((p) => { const c = current(p); const changed = c.stage !== p.stage || c.ball !== p.ball_holder_id; return (
              <tr key={p.id} className={changed ? "changed" : ""}>
                <td className="enq">{p.enquiry_no ?? "—"}</td>
                <td className="name"><Link href={`/projects/${p.id}`}>{title(p.name)}</Link>{p.client ? <small className="pos">{title(p.client)}</small> : null}</td>
                <td>{p.pm ? title(p.pm) : <i className="crit">no PM</i>}</td>
                <td><small>{p.status.toLowerCase().replace(/_/g, " ")}{p.flow_status === "ON_HOLD" ? " · on hold" : ""}</small></td>
                <td>{canEdit ? (
                  <select value={c.stage ?? ""} onChange={(e) => setStage(p, e.target.value === "" ? null : Number(e.target.value))} disabled={pending && busy === p.id}>
                    <option value="">— pick a stage —</option>
                    {stages.filter((s) => s.stage_no >= 3 && s.stage_no <= 16).map((s) => <option key={s.stage_no} value={s.stage_no}>{s.stage_no} {s.name}</option>)}
                  </select>
                ) : (c.stage != null ? <span className="stagechip"><b>{c.stage}</b>{byNo.get(c.stage)?.short_name}</span> : <i>none</i>)}</td>
                <td>{canEdit ? (
                  <select value={c.ball ?? ""} onChange={(e) => setBall(p, e.target.value || null)} disabled={pending && busy === p.id}>
                    <option value="">— nobody —</option>
                    {active.map((x) => <option key={x.id} value={x.id}>{x.full_name ?? title(x.name)}{x.position ? ` · ${x.position}` : ""}</option>)}
                  </select>
                ) : (nameOf(c.ball) ?? <i>nobody</i>)}
                  {canEdit && c.stage != null && suggested(c.stage, p) && suggested(c.stage, p) !== c.ball && <small className="pos">Rev 3 default: {nameOf(suggested(c.stage, p))}</small>}
                </td>
                <td className="save">{canEdit && <button type="button" className={"btn sm" + (changed ? " bronze" : "")} disabled={pending && busy === p.id} onClick={() => confirm(p)}>{busy === p.id && pending ? "Saving…" : changed ? "Save & confirm" : "Confirm"}</button>}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
