"use client";
import { Fragment, useActionState, useState } from "react";
import { title, type Person } from "@/lib/model";
import { savePerson, addPerson } from "@/app/actions";

const ROLE_LABEL: Record<string, string> = { MANAGEMENT: "Management", SALES: "Sales", PM: "Project manager", PROJECT_COORDINATOR: "Project coordinator", DESIGNER: "Designer", TECHNICAL_DESIGNER: "Technical designer", ESTIMATOR: "Estimator", PROCUREMENT: "Procurement", PRODUCTION: "Production", STORE: "Store / dispatch", ACCOUNTS: "Accounts", ADMIN: "Office / admin" };
const ROLE_ORDER = Object.keys(ROLE_LABEL);
type State = { error?: string; ok?: boolean; at?: string } | null;

function Row({ p, canEdit }: { p: Person; canEdit: boolean }) {
  const [state, action, pending] = useActionState(savePerson.bind(null, p.id), null as State);
  const [dirty, setDirty] = useState(false);
  const flags = [p.can_edit_projects && "projects", p.can_edit_estimation && "estimation", p.can_manage_team && "team"].filter(Boolean).join(" + ");
  if (!canEdit) return (
    <tr className={p.is_active ? "" : "off"}>
      <td className="name">{title(p.name)}</td><td>{p.full_name ?? "—"}{p.position ? <small className="pos">{p.position}</small> : null}</td><td>{p.email ?? <i>{p.can_sign_in ? "no email" : "WhatsApp only"}</i>}</td><td>{p.whatsapp ?? "—"}</td><td><span className="pill">{flags || "view"}</span></td><td>{[p.notify_on_award && <span key="s" className="pill ok">signings</span>, p.handles_escalations && <span key="e" className="pill ok">escalations</span>, p.notify_progress_invoice && <span key="p" className="pill ok">45% invoice</span>, p.notify_final_invoice && <span key="f" className="pill ok">final invoice</span>].filter(Boolean)}{!p.notify_on_award && !p.handles_escalations && !p.notify_progress_invoice && !p.notify_final_invoice && "—"}</td><td>{p.is_active ? "Active" : "Left"}</td><td />
    </tr>
  );
  return (
    <tr className={p.is_active ? "" : "off"}>
      <td className="name">{title(p.name)}</td>
      <td><input form={`f-${p.id}`} name="full_name" defaultValue={p.full_name ?? ""} placeholder="Full name" onChange={() => setDirty(true)} /><input form={`f-${p.id}`} name="position" defaultValue={p.position ?? ""} placeholder="Position (shown under the ball holder)" className="pos" onChange={() => setDirty(true)} /></td>
      <td><input form={`f-${p.id}`} name="email" type="email" defaultValue={p.email ?? ""} placeholder={p.can_sign_in ? "name@concept-5.com" : "no email — WhatsApp only"} onChange={() => setDirty(true)} className={p.email || !p.can_sign_in ? "" : "missing"} />
        <label className="check"><input form={`f-${p.id}`} type="checkbox" name="whatsapp_only" defaultChecked={!p.can_sign_in} onChange={() => setDirty(true)} /> WhatsApp only</label></td>
      <td><input form={`f-${p.id}`} name="whatsapp" defaultValue={p.whatsapp ?? ""} placeholder="+9715…" onChange={() => setDirty(true)} /></td>
      <td><span className="pill">{flags || "view"}</span></td>
      <td><label className="check"><input form={`f-${p.id}`} type="checkbox" name="notify_on_award" defaultChecked={p.notify_on_award} onChange={() => setDirty(true)} /> Signings</label><label className="check"><input form={`f-${p.id}`} type="checkbox" name="handles_escalations" defaultChecked={p.handles_escalations} onChange={() => setDirty(true)} /> Escalations</label><label className="check" title="Emailed when a project reaches Installation — progress invoice (45%)"><input form={`f-${p.id}`} type="checkbox" name="notify_progress_invoice" defaultChecked={p.notify_progress_invoice} onChange={() => setDirty(true)} /> 45% invoice</label><label className="check" title="Emailed when a project is Completed — final invoice and supplier close-out"><input form={`f-${p.id}`} type="checkbox" name="notify_final_invoice" defaultChecked={p.notify_final_invoice} onChange={() => setDirty(true)} /> Final invoice</label></td>
      <td><label className="check"><input form={`f-${p.id}`} type="checkbox" name="is_active" defaultChecked={p.is_active} onChange={() => setDirty(true)} /> Active</label></td>
      <td className="save">
        <form id={`f-${p.id}`} action={action} onSubmit={() => setDirty(false)}>
          <button className={"btn sm" + (dirty ? " bronze" : " ghost")} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          {state?.error && <span className="msg err">{state.error}</span>}
          {state?.ok && !dirty && <span className="msg">Saved</span>}
        </form>
      </td>
    </tr>
  );
}

function AddRow() {
  const [state, action, pending] = useActionState(addPerson, null as State);
  return (
    <tr className="addrow">
      <td><input form="f-new" name="name" placeholder="SHORT NAME" required className="upper" /></td>
      <td><input form="f-new" name="full_name" placeholder="Full name" /><input form="f-new" name="position" placeholder="Position" className="pos" /></td>
      <td><input form="f-new" name="email" type="email" placeholder="name@concept-5.com" /><label className="check"><input form="f-new" type="checkbox" name="whatsapp_only" /> WhatsApp only</label></td>
      <td><input form="f-new" name="whatsapp" placeholder="+9715…" /></td>
      <td><select form="f-new" name="role" defaultValue="PM">{ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td>
      <td />
      <td className="save">
        <form id="f-new" action={action} key={state?.at}>
          <button className="btn sm" disabled={pending}>{pending ? "Adding…" : "+ Add"}</button>
          {state?.error && <span className="msg err">{state.error}</span>}
          {state?.ok && <span className="msg">Added</span>}
        </form>
      </td>
    </tr>
  );
}

export default function TeamTable({ people, canEdit }: { people: Person[]; canEdit: boolean }) {
  const groups = ROLE_ORDER.map((r) => [r, people.filter((p) => p.role === r).sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name))] as const).filter(([, ps]) => ps.length);
  return (
    <div className="listview">
      <div className="tablewrap team">
        <table>
          <thead><tr><th>Name</th><th>Full name</th><th>Email</th><th>WhatsApp</th><th>Can edit</th><th>Also emailed about</th><th>Status</th><th /></tr></thead>
          <tbody>
            {groups.map(([role, ps]) => (
              <Fragment key={role}>
                <tr className="group"><td colSpan={8}>{ROLE_LABEL[role]}</td></tr>
                {ps.map((p) => <Row key={p.id} p={p} canEdit={canEdit} />)}
              </Fragment>
            ))}
            {canEdit && <AddRow />}
          </tbody>
        </table>
      </div>
    </div>
  );
}
