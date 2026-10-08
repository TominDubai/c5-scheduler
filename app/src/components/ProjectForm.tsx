"use client";
import { useActionState } from "react";
import { ALL, QUOTE_STAGES, title, type Project, type Person, type Contractor } from "@/lib/model";
import { saveProject, createProject } from "@/app/actions";

type Props = { project?: Project | null; people: Person[]; contractors: Contractor[]; estimationOnly?: boolean };

export default function ProjectForm({ project, people, contractors, estimationOnly = false }: Props) {
  const lock = estimationOnly; // estimators: pricing fields only
  const action = project ? saveProject.bind(null, project.id) : createProject;
  const [state, formAction, pending] = useActionState(action, null as { error?: string; ok?: boolean; at?: string } | null);
  const pms = people.filter((p) => p.role === "PM" || p.role === "MANAGEMENT");
  const designers = people.filter((p) => p.role === "DESIGNER" || p.role === "TECHNICAL_DESIGNER");
  const estimators = people.filter((p) => p.role === "ESTIMATOR" || p.role === "ADMIN" || p.role === "MANAGEMENT");
  const v = (k: keyof Project) => (project?.[k] ?? "") as string;
  return (
    <form action={formAction} className="form">
      <div className="field wide"><label htmlFor="name">Project name</label><input id="name" name="name" required defaultValue={v("name")} placeholder="e.g. MEADOWS 5, ST3, V1" /></div>
      <div className="field"><label htmlFor="enquiry_no">Enquiry no.</label><input id="enquiry_no" name="enquiry_no" defaultValue={v("enquiry_no")} placeholder="26-120" /></div>
      <div className="field"><label htmlFor="client">Client</label><input id="client" name="client" defaultValue={v("client")} /></div>
      <div className="field"><label htmlFor="contractor_id">Main contractor</label>
        <select id="contractor_id" name="contractor_id" defaultValue={v("contractor_id")}><option value="">—</option>{contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="field"><label htmlFor="status">Status</label>
        <select id="status" name="status" disabled={lock} defaultValue={project?.status ?? "QUOTE"}>{ALL.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="field"><label htmlFor="pm_id">Project manager <small>(assigned by Basim)</small></label>
        <select id="pm_id" name="pm_id" disabled={lock} defaultValue={v("pm_id")}><option value="">Unassigned</option>{pms.map((p) => <option key={p.id} value={p.id}>{title(p.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="pm2_id">Second PM (optional)</label>
        <select id="pm2_id" name="pm2_id" disabled={lock} defaultValue={v("pm2_id")}><option value="">—</option>{pms.map((p) => <option key={p.id} value={p.id}>{title(p.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="designer_id">Designer <small>(assigned by Jinky)</small></label>
        <select id="designer_id" name="designer_id" disabled={lock} defaultValue={v("designer_id")}><option value="">—</option>{designers.map((p) => <option key={p.id} value={p.id}>{title(p.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="signed_quote">Signed quote (AED inc. VAT)</label><input id="signed_quote" name="signed_quote" disabled={lock} inputMode="decimal" defaultValue={project?.signed_quote ?? ""} /></div>
      <div className="field"><label htmlFor="received_date">Enquiry received</label><input id="received_date" name="received_date" type="date" defaultValue={v("received_date")} /></div>
      <div className="field"><label htmlFor="start_date">Project start <small>(date payment received)</small></label><input id="start_date" name="start_date" disabled={lock} type="date" defaultValue={v("start_date")} /></div>
      <div className="field"><label htmlFor="target_date">Target completion <small>(contractor’s programme, joinery only)</small></label><input id="target_date" name="target_date" disabled={lock} type="date" defaultValue={v("target_date")} /></div>
      <div className="field"><label htmlFor="completed_date">Date completed</label><input id="completed_date" name="completed_date" disabled={lock} type="date" defaultValue={v("completed_date")} /></div>
      <div className="field wide sep"><span className="sectionlabel">Pricing (Ramus)</span></div>
      <div className="field"><label htmlFor="quote_stage">Pricing stage</label>
        <select id="quote_stage" name="quote_stage" defaultValue={project?.quote_stage ?? "QUEUED"}>{QUOTE_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="field"><label htmlFor="estimator_id">Estimator</label>
        <select id="estimator_id" name="estimator_id" defaultValue={v("estimator_id")}><option value="">—</option>{estimators.map((p) => <option key={p.id} value={p.id}>{title(p.name)}</option>)}</select></div>
      <div className="field"><label htmlFor="quoted_value">Quoted value (AED inc. VAT)</label><input id="quoted_value" name="quoted_value" inputMode="decimal" defaultValue={project?.quoted_value ?? ""} /></div>
      <div className="field"><label htmlFor="quote_due_date">Quote due</label><input id="quote_due_date" name="quote_due_date" type="date" defaultValue={v("quote_due_date")} /></div>
      <div className="field"><label htmlFor="quote_submitted_date">Quote submitted</label><input id="quote_submitted_date" name="quote_submitted_date" type="date" defaultValue={v("quote_submitted_date")} /></div>
      <div className="field"><label htmlFor="folder_path">Folder on the Public Server</label><input id="folder_path" name="folder_path" defaultValue={v("folder_path")} /></div>
      <div className="field wide"><label htmlFor="notes">Notes</label><textarea id="notes" name="notes" rows={3} defaultValue={v("notes")} /></div>
      <div className="actions">
        <button className="btn" disabled={pending}>{pending ? "Saving…" : project ? "Save changes" : "Create project"}</button>
        {state?.error && <span className="msg err">{state.error}</span>}
        {state?.ok && <span className="msg">Saved</span>}
      </div>
    </form>
  );
}
