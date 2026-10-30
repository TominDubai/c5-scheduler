"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { title, SCOPES, type Person, type Contractor, type ParentOption } from "@/lib/model";
import ParentOptions from "@/components/ParentOptions";
import { createEnquiry } from "@/app/actions";

/**
 * New enquiry. Two kinds (team comments round 1, page 2 — Jinky): a **Project** is a new job with its own
 * name, client and contractor; a **Variation order** points at an existing project and inherits those, and
 * records who it is charged to. Both get an enquiry number and go through the same pricing columns; a won
 * VO becomes a line on its parent instead of a new card (db/011, db/022).
 */
export default function EnquiryForm({ nextNo, people, contractors, liveProjects }: { nextNo: string; people: Person[]; contractors: Contractor[]; liveProjects: ParentOption[] }) {
  const [kind, setKind] = useState<"PROJECT" | "VO">("PROJECT");
  const [parent, setParent] = useState("");
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(null); // last success already acknowledged
  const [state, formAction, pending] = useActionState(createEnquiry, null as { error?: string; ok?: boolean; enquiry_no?: string; id?: string } | null);
  const estimators = people.filter((p) => p.role === "ESTIMATOR" || p.role === "ADMIN" || p.role === "MANAGEMENT");
  const today = new Date().toISOString().slice(0, 10);
  const isVo = kind === "VO";
  const parentRow = liveProjects.find((p) => p.id === parent);
  if (state?.ok && seen !== state.id) {
    return <div className="newenq"><span className="msg">Enquiry <b>{state.enquiry_no}</b> added. <Link href={`/projects/${state.id}`}>Open it</Link> or </span><button className="btn sm bronze" onClick={() => { setSeen(state.id!); setOpen(true); }}>+ Another enquiry</button></div>;
  }
  if (!open) return <div className="newenq"><button className="btn bronze" onClick={() => setOpen(true)}>+ New enquiry</button><span className="hint">Next number: <b>{nextNo}</b></span></div>;
  return (
    <form action={formAction} className="panel enqform">
      <div className="enqkind" role="radiogroup" aria-label="Kind of enquiry">
        <h2>New enquiry</h2>
        <div className="seg">
          <button type="button" className={kind === "PROJECT" ? "on" : ""} aria-pressed={kind === "PROJECT"} onClick={() => { setKind("PROJECT"); setParent(""); }}>Project</button>
          <button type="button" className={isVo ? "on" : ""} aria-pressed={isVo} onClick={() => setKind("VO")}>Variation order</button>
        </div>
        <span className="hint">{isVo ? "Extra work on a project we already have — it becomes a VO on that project when it's won." : "A new job with its own card."}</span>
      </div>
      <input type="hidden" name="kind" value={kind} />
      <div className="form">
        <div className="field"><label htmlFor="enquiry_no">Enquiry no.</label><input id="enquiry_no" name="enquiry_no" defaultValue={nextNo} /></div>
        <div className="field"><label htmlFor="received_date">Received</label><input id="received_date" name="received_date" type="date" defaultValue={today} /></div>
        {isVo ? (
          <>
            <div className="field wide"><label htmlFor="parent_project_id">This VO is for</label>
              <select id="parent_project_id" name="parent_project_id" required value={parent} onChange={(e) => setParent(e.target.value)} className={parent ? "vo-on" : ""}>
                <option value="">— pick the project —</option>
                <ParentOptions projects={liveProjects} />
              </select>
              {parentRow?.completed && <small className="hint">That project is completed. When this VO is won the card comes back to the board at Award / contract with Jean.</small>}
            </div>
            <div className="field wide"><label htmlFor="charged_to">This VO is charged to <small>(client, contractor, …)</small></label><input id="charged_to" name="charged_to" placeholder="e.g. CLIENT / MACS / GTS" /></div>
            <div className="field"><label htmlFor="estimator_id">Estimator</label>
              <select id="estimator_id" name="estimator_id" defaultValue={estimators.find((p) => p.name === "RAMUS")?.id ?? ""}><option value="">—</option>{estimators.map((p) => <option key={p.id} value={p.id}>{title(p.name)}</option>)}</select></div>
            <div className="field"><label htmlFor="quote_type">Quote type</label><input id="quote_type" name="quote_type" list="quote-types" defaultValue="VO" placeholder="VO1 / ADDTL …" /><datalist id="quote-types"><option value="VO" /><option value="VO1" /><option value="VO2" /><option value="VO3" /><option value="ADDTL" /><option value="REVISED" /></datalist></div>
          </>
        ) : (
          <>
            <div className="field wide"><label htmlFor="name">Project (location / address)</label><input id="name" name="name" required placeholder="e.g. JUMEIRAH ISLANDS CLUSTER 12 VILLA 4" /></div>
            <div className="field"><label htmlFor="client">Client (end user)</label><input id="client" name="client" /></div>
            <div className="field"><label htmlFor="contractor_id">Main contractor</label>
              <select id="contractor_id" name="contractor_id" defaultValue=""><option value="">— / Direct</option>{contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label htmlFor="estimator_id">Estimator</label>
              <select id="estimator_id" name="estimator_id" defaultValue={estimators.find((p) => p.name === "RAMUS")?.id ?? ""}><option value="">—</option>{estimators.map((p) => <option key={p.id} value={p.id}>{title(p.name)}</option>)}</select></div>
            <div className="field"><label htmlFor="quote_type">Quote type</label><input id="quote_type" name="quote_type" list="quote-types" placeholder="FULL QUOTE / KITCHEN …" /><datalist id="quote-types"><option value="FULL QUOTE" /><option value="KITCHEN" /><option value="PARTIAL" /><option value="SMALL WORKS" /><option value="REVISED" /></datalist></div>
          </>
        )}
        <div className="field"><label>Scope</label><div className="checks">{SCOPES.map((s) => <label key={s}><input type="checkbox" name="scope" value={s} defaultChecked={s === "Joinery"} /> {s}</label>)}</div></div>
        <div className="field"><label htmlFor="raised_by">Raised by <small>(who sent it in)</small></label><input id="raised_by" name="raised_by" placeholder="e.g. AFTAB" /></div>
        <div className="field"><label htmlFor="quote_due_date">Quote due</label><input id="quote_due_date" name="quote_due_date" type="date" /></div>
        {!isVo && <div className="field wide"><label htmlFor="folder_path">Folder on the Public Server</label><input id="folder_path" name="folder_path" placeholder="Z:\3_PROJECTS\26-135 ..." /></div>}
        <div className="field wide"><label htmlFor="notes">Notes{isVo ? <small> (what the VO covers)</small> : null}</label><textarea id="notes" name="notes" rows={2} /></div>
        <div className="actions">
          <button className="btn" disabled={pending}>{pending ? "Adding…" : isVo ? "Add VO enquiry" : "Add enquiry"}</button>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          {state?.error && <span className="msg err">{state.error}</span>}
        </div>
      </div>
    </form>
  );
}
