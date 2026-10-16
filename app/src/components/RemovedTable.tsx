"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LABEL, aed, fmtD, title, type Project } from "@/lib/model";
import { restoreProject } from "@/app/actions";

export default function RemovedTable({ projects, canManage }: { projects: Project[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (projects.length === 0) return null;
  return (
    <div className="listview">
      <div className="tablewrap">
        <table>
          <thead><tr><th>Enq</th><th>Project</th><th>Client</th><th>Status</th><th>Removed</th><th>By</th><th>Reason</th><th className="num">Value</th>{canManage && <th />}</tr></thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td className="enq">{p.enquiry_no ?? "—"}</td>
                <td className="name"><Link href={`/projects/${p.id}`} style={{ color: "var(--navy)" }}>{title(p.name)}</Link></td>
                <td>{title(p.client)}</td>
                <td><span className={`status s-${p.status}`}>{LABEL[p.status]}</span></td>
                <td>{fmtD(p.deleted_at)}</td>
                <td>{p.deleted_by ? title(p.deleted_by) : "—"}</td>
                <td>{p.deleted_reason}</td>
                <td className="num">{aed(p.project_value)}</td>
                {canManage && <td className="num"><button className="btn sm ghost" disabled={pending} onClick={() => start(async () => { const r = await restoreProject(p.id); if (r?.error) setErr(r.error); else router.refresh(); })}>Restore</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {err && <span className="msg err" style={{ padding: "8px 18px", display: "block" }}>{err}</span>}
    </div>
  );
}
