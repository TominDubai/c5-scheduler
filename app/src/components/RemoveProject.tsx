"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtD, title, type Project } from "@/lib/model";
import { removeProject, restoreProject } from "@/app/actions";

/** Banner on a removed project, with Restore for team managers. */
export function RemovedBanner({ project, canManage }: { project: Project; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="vobanner removed">
      <b>Removed</b> {fmtD(project.deleted_at)}{project.deleted_by ? ` by ${title(project.deleted_by)}` : ""} — {project.deleted_reason}. It's off the board and list, and not counted anywhere; nothing has been deleted.
      {canManage && <button className="btn sm ghost" style={{ marginLeft: 12 }} disabled={pending} onClick={() => start(async () => { const r = await restoreProject(project.id); if (r?.error) setErr(r.error); else router.refresh(); })}>Restore</button>}
      {err && <span className="msg err" style={{ marginLeft: 8 }}>{err}</span>}
    </div>
  );
}

/** "Remove project" panel: confirm step, reason required. Team managers only (the database enforces it too). */
export default function RemoveProject({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(removeProject.bind(null, project.id), null as { error?: string } | null);
  return (
    <div className="panel">
      <h2>Remove project</h2>
      {!open ? (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <p className="note" style={{ flex: 1, minWidth: 220 }}>Takes it off the board, list, estimation and all counts. VOs, history and notes are kept, and it can be restored from the List → Removed view.</p>
          <button className="btn sm danger" onClick={() => setOpen(true)}>Remove…</button>
        </div>
      ) : (
        <form action={formAction} className="vo-form" style={{ flexWrap: "wrap" }}>
          <input name="reason" autoFocus required maxLength={120} placeholder="Why? e.g. duplicate, entered by mistake, test" aria-label="Reason for removing" style={{ flex: 1, minWidth: 240 }} />
          <button className="btn sm danger" style={{ background: "var(--crit)", color: "#fff", borderColor: "var(--crit)" }} disabled={pending}>{pending ? "Removing…" : `Yes, remove ${title(project.name)}`}</button>
          <button type="button" className="btn sm ghost" disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
          {state?.error && <span className="msg err" style={{ width: "100%" }}>{state.error}</span>}
        </form>
      )}
    </div>
  );
}
