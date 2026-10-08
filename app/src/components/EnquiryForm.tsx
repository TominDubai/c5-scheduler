"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { title, type Person, type Contractor } from "@/lib/model";
import { createEnquiry } from "@/app/actions";

export default function EnquiryForm({ nextNo, people, contractors }: { nextNo: string; people: Person[]; contractors: Contractor[] }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(null); // last success already acknowledged
  const [state, formAction, pending] = useActionState(createEnquiry, null as { error?: string; ok?: boolean; enquiry_no?: string; id?: string } | null);
  const estimators = people.filter((p) => p.role === "ESTIMATOR" || p.role === "ADMIN" || p.role === "MANAGEMENT");
  const today = new Date().toISOString().slice(0, 10);
  if (state?.ok && seen !== state.id) {
    return <div className="newenq"><span className="msg">Enquiry <b>{state.enquiry_no}</b> added. <Link href={`/projects/${state.id}`}>Open it</Link> or </span><button className="btn sm bronze" onClick={() => { setSeen(state.id!); setOpen(true); }}>+ Another enquiry</button></div>;
  }
  if (!open) return <div className="newenq"><button className="btn bronze" onClick={() => setOpen(true)}>+ New enquiry</button><span className="hint">Next number: <b>{nextNo}</b></span></div>;
  return (
    <form action={formAction} className="panel enqform">
      <h2>New enquiry</h2>
      <div className="form">
        <div className="field"><label htmlFor="enquiry_no">Enquiry no.</label><input id="enquiry_no" name="enquiry_no" defaultValue={nextNo} /></div>
        <div className="field"><label htmlFor="received_date">Received</label><input id="received_date" name="received_date" type="date" defaultValue={today} /></div>
        <div className="field wide"><label htmlFor="name">Project (location / address)</label><input id="name" name="name" required placeholder="e.g. JUMEIRAH ISLANDS CLUSTER 12 VILLA 4" /></div>
        <div className="field"><label htmlFor="client">Client (end user)</label><input id="client" name="client" /></div>
        <div className="field"><label htmlFor="contractor_id">Main contractor</label>
          <select id="contractor_id" name="contractor_id" defaultValue=""><option value="">— / Direct</option>{contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label htmlFor="estimator_id">Estimator</label>
          <select id="estimator_id" name="estimator_id" defaultValue={estimators.find((p) => p.name === "RAMUS")?.id ?? ""}><option value="">—</option>{estimators.map((p) => <option key={p.id} value={p.id}>{title(p.name)}</option>)}</select></div>
        <div className="field"><label htmlFor="quote_due_date">Quote due</label><input id="quote_due_date" name="quote_due_date" type="date" /></div>
        <div className="field wide"><label htmlFor="folder_path">Folder on the Public Server</label><input id="folder_path" name="folder_path" placeholder="Z:\3_PROJECTS\26-135 ..." /></div>
        <div className="field wide"><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" rows={2} /></div>
        <div className="actions">
          <button className="btn" disabled={pending}>{pending ? "Adding…" : "Add enquiry"}</button>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          {state?.error && <span className="msg err">{state.error}</span>}
        </div>
      </div>
    </form>
  );
}
