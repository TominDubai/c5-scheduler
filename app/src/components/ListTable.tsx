"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LABEL, ORDER, aed, fmtD, title, tone, delayText, type Project } from "@/lib/model";

type Key = "enquiry_no" | "name" | "client" | "status" | "pm" | "designer" | "start_date" | "target_date" | "days_delayed" | "project_value";
const COLS: [Key, string, boolean][] = [
  ["enquiry_no", "Enq", false], ["name", "Project", false], ["client", "Client", false], ["status", "Status", false], ["pm", "PM", false],
  ["designer", "Designer", false], ["start_date", "Start", true], ["target_date", "Target", true], ["days_delayed", "Delay", true], ["project_value", "Value", true],
];

export default function ListTable({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ k: Key; d: 1 | -1 }>({ k: "status", d: 1 });
  const rows = [...projects].sort((a, b) => {
    if (sort.k === "status") { const s = ORDER[a.status] - ORDER[b.status]; return s !== 0 ? s * sort.d : (b.days_delayed ?? -9e9) - (a.days_delayed ?? -9e9); }
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
            {rows.map((p) => { const t = tone(p); return (
              <tr key={p.id} className="row" onClick={() => router.push(`/projects/${p.id}`)}>
                <td className="enq">{p.enquiry_no ?? "—"}</td><td className="name">{title(p.name)}</td><td>{title(p.client)}</td>
                <td><span className={`status s-${p.status}`}>{LABEL[p.status]}</span></td>
                <td>{p.pm ? title(p.pm) : <i>unassigned</i>}{p.pm2 ? ` + ${title(p.pm2)}` : ""}</td><td>{p.designer ? title(p.designer) : "—"}</td>
                <td className="num">{fmtD(p.start_date)}</td><td className="num">{fmtD(p.target_date)}</td>
                <td className="num"><span className={`pill ${t}`}>{delayText(p)}</span></td>
                <td className="num">{aed(p.project_value)}</td>
              </tr>); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
