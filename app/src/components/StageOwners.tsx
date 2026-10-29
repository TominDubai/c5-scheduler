"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { title, type Stage, type StageOwner, type StageTarget, type Person } from "@/lib/model";
import { setStageOwner } from "@/app/actions";

/** Who holds the ball by default at each stage. The Rev 3 names were seeded on 28 Oct 2026; change them here, not in code. */
export default function StageOwners({ stages, owners, targets, people, canEdit }: { stages: Stage[]; owners: StageOwner[]; targets: StageTarget[]; people: Person[]; canEdit: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const own = new Map(owners.map((o) => [o.stage_no, o.person_id]));
  const tgt = new Map(targets.map((t) => [t.stage_no, t]));
  const nameOf = (id: string | null | undefined) => { const p = people.find((x) => x.id === id); return p ? (p.full_name ?? title(p.name)) : "—"; };
  return (
    <div className="listview">
      <div className="tablewrap">
        <table className="stageowners">
          <thead><tr><th>Stage</th><th>Department</th><th>Position (Rev 3)</th><th>Holds the ball by default</th><th className="num">Target days</th><th className="num">Response</th></tr></thead>
          <tbody>
            {stages.filter((s) => s.stage_no !== 17).map((s) => (
              <tr key={s.stage_no}>
                <td className="name"><span className="stagechip"><b>{s.stage_no}</b>{s.name}</span></td>
                <td>{s.department}</td>
                <td>{s.position ?? "—"}</td>
                <td>{s.owner_rule === "ALLOCATED_PM" ? <i>the project’s lead PM</i> : canEdit ? (
                  <select value={own.get(s.stage_no) ?? ""} onChange={(e) => { const v = e.target.value || null; start(async () => { const r = await setStageOwner(s.stage_no, v); if (r?.error) setErr(r.error); else { setErr(null); router.refresh(); } }); }}>
                    <option value="">— nobody —</option>
                    {people.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.full_name ?? title(p.name)}{p.position ? ` · ${p.position}` : ""}</option>)}
                  </select>
                ) : nameOf(own.get(s.stage_no))}</td>
                <td className="num">{tgt.get(s.stage_no)?.target_days ?? <i>tba</i>}</td>
                <td className="num">{tgt.get(s.stage_no)?.response_hours != null ? `${tgt.get(s.stage_no)!.response_hours}h` : <i>tba</i>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {err && <div className="msg err">{err}</div>}
      <p className="note" style={{ padding: "8px 2px" }}>Target days and escalation response times are still to be agreed with Darren; stage age shows from day one, overdue colouring switches on once the numbers are in.</p>
    </div>
  );
}
