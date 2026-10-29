"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FLOW_LABEL, aed, fmtD, title, tone, delayText, stageAge, type Project } from "@/lib/model";

type Key = "enquiry_no" | "name" | "client" | "stage" | "ball_holder" | "flow_status" | "hold_waiting_on" | "stage_age_days" | "pm" | "designer" | "target_date" | "days_delayed" | "project_value";
const COLS: [Key, string, boolean][] = [
  ["enquiry_no", "Enq", false], ["name", "Project", false], ["client", "Client", false], ["stage", "Stage", false], ["ball_holder", "Ball holder", false],
  ["flow_status", "Status", false], ["hold_waiting_on", "Waiting on", false], ["stage_age_days", "In stage", true],
  ["pm", "PM", false], ["designer", "Designer", false], ["target_date", "Target", true], ["days_delayed", "Delay", true], ["project_value", "Value", true],
];

/** The List, Rev 3: stage, ball holder, flow status, waiting on and stage age are columns, all sortable. */
export default function ListTable({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ k: Key; d: 1 | -1 }>({ k: "stage", d: 1 });
  const rows = [...projects].sort((a, b) => {
    if (sort.k === "stage") { const s = (a.stage ?? 99) - (b.stage ?? 99); return s !== 0 ? s * sort.d : (b.stage_age_days ?? -9e9) - (a.stage_age_days ?? -9e9); }
    const av = a[sort.k] ?? null, bv = b[sort.k] ?? null;
    if (av == null && bv == null) return 0; if (av == null) return 1; if (bv == null) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * sort.d;
  });
  const click = (k: Key) => setSort((s) => ({ k, d: s.k === k ? (s.d === 1 ? -1 : 1) : 1 }));
  return (
    <div className="listview">
      <div className="tablewrap">
        <table>
          <thead><tr>{COLS.map(([k, l, num]) => <th key={k} className={(num ? "num " : "") + (sort.k === k ? "sorted" : "")} onClick={() => click(k)}>{l}{sort.k === k ? (sort.d === 1 ? " ↑" : " ↓") : ""}</th>)}</tr></thead>
          <tbody>
            {rows.map((p) => { const t = tone(p); const age = stageAge(p); return (
              <tr key={p.id} className="row" onClick={() => router.push(`/projects/${p.id}`)}>
                <td className="enq">{p.enquiry_no ?? "—"}</td><td className="name">{title(p.name)}</td><td>{title(p.client)}</td>
                <td>{p.stage != null ? <span className={`stagechip ph-${p.phase ?? ""}`}><b>{p.stage}</b>{p.stage_short}</span> : <i>{p.status === "LOST" ? "Lost" : "to be set"}</i>}</td>
                <td>{p.ball_holder ? <span className="who"><b className="av">{p.ball_holder.split(/[\s/]+/).map((s) => s[0]).join("").slice(0, 2)}</b>{title(p.ball_holder)}</span> : <i>nobody</i>}</td>
                <td>{p.flow_status === "ACTIVE" ? <span className="flowtag">Active</span> : <span className={`flowtag ${p.flow_status === "ON_HOLD" ? "grey" : "bronze"}`}>{FLOW_LABEL[p.flow_status]}{p.flow_status === "AWAITING_ACCEPTANCE" && p.pending_to_person ? ` → ${title(p.pending_to_person)}` : ""}</span>}</td>
                <td>{p.hold_waiting_on ? title(p.hold_waiting_on) : "—"}</td>
                <td className="num">{age.text ? <span className={`pill ${age.tone}`}>{age.text}</span> : "—"}</td>
                <td>{p.pm ? title(p.pm) : <i>unassigned</i>}{p.pm2 ? ` + ${title(p.pm2)}` : ""}</td><td>{p.designer ? title(p.designer) : "—"}</td>
                <td className="num">{fmtD(p.target_date)}{p.target_rev ? <span className="rev">R{p.target_rev}</span> : null}</td>
                <td className="num"><span className={`pill ${t}`}>{delayText(p)}</span></td>
                <td className="num">{aed(p.project_value)}</td>
              </tr>); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
