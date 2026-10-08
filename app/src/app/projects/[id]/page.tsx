import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import ProjectForm from "@/components/ProjectForm";
import Variations from "@/components/Variations";
import { getProject, getPeople, getContractors, getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { STAGES, ORDER, LABEL, aed, fmtD, title, tone, delayText, type Variation, type History } from "@/lib/model";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, people, contractors, me] = await Promise.all([getProject(id), getPeople(), getContractors(), getMe()]);
  if (!p) notFound();
  const supabase = await createClient();
  const [{ data: vos }, { data: hist }] = await Promise.all([
    supabase.from("variations").select("*").eq("project_id", id).order("vo_no"),
    supabase.from("status_history").select("*, who:people(name)").eq("project_id", id).order("changed_at", { ascending: false }),
  ]);
  const t = tone(p);
  const canEdit = me.canProjects || (me.canEstimation && p.status === "QUOTE");
  const history = (hist ?? []) as (History & { who: { name: string } | null })[];
  return (
    <Shell>
      <div className="page">
        <div className="crumbs"><Link href="/board">Board</Link> / <span className="enq">{p.enquiry_no ?? "no enquiry no."}</span></div>
        <div className="head">
          <div><h1>{title(p.name)}</h1><div className="client">{title(p.client)}{p.contractor ? ` · via ${p.contractor}` : ""}</div></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={`status s-${p.status}`}>{LABEL[p.status]}</span><span className={`pill ${t}`}>{delayText(p)}</span></div>
        </div>
        <div>
          <div className="stagebar">{STAGES.map(([k]) => <span key={k} className={(ORDER[k] <= ORDER[p.status] && ORDER[p.status] <= ORDER.COMPLETED ? "on " : "") + (k === p.status ? "cur" : "")} />)}</div>
          <div className="stagebar-labels">{STAGES.map(([k, l]) => <span key={k}>{l}</span>)}</div>
        </div>
        <div className="grid2">
          <div className="panel">
            <h2>At a glance</h2>
            <dl>
              <dt>Project manager</dt><dd>{p.pm ? title(p.pm) : "Unassigned"}{p.pm2 ? ` + ${title(p.pm2)}` : ""}</dd>
              <dt>Designer</dt><dd>{p.designer ? title(p.designer) : "—"}</dd>
              <dt>Enquiry received</dt><dd>{fmtD(p.received_date)}</dd>
              <dt>Project start</dt><dd>{fmtD(p.start_date)}</dd>
              <dt>Target completion</dt><dd>{fmtD(p.target_date)}{p.days_to_completion != null && <small> · {p.days_to_completion} days programme</small>}</dd>
              <dt>Completed</dt><dd>{fmtD(p.completed_date)}</dd>
              <dt>Duration</dt><dd>{p.duration_days != null ? `${p.duration_days} days${p.completed_date ? "" : " so far"}` : "—"}</dd>
              <dt>Project value</dt><dd>{aed(p.project_value)} <small>inc. VAT · {p.vo_count} VO{p.vo_count === 1 ? "" : "s"}</small></dd>
              <dt>In this stage since</dt><dd>{fmtD(p.status_since)}</dd>
            </dl>
          </div>
          <Variations projectId={p.id} signedQuote={p.signed_quote} vos={(vos ?? []) as Variation[]} canEdit={me.canProjects} />
        </div>
        {canEdit ? (
          <div className="panel">
            <h2>Edit project</h2>
            <ProjectForm project={p} people={people} contractors={contractors} estimationOnly={!me.canProjects} />
          </div>
        ) : (
          <div className="panel"><h2>Details</h2><dl>
            <dt>Enquiry no.</dt><dd>{p.enquiry_no ?? "—"}</dd>
            <dt>Contractor</dt><dd>{p.contractor ?? "—"}</dd>
            <dt>Estimator</dt><dd>{p.estimator ? title(p.estimator) : "—"}</dd>
            <dt>Quoted value</dt><dd>{aed(p.quoted_value)}</dd>
            <dt>Folder</dt><dd>{p.folder_path ?? "—"}</dd>
            <dt>Notes</dt><dd>{p.notes ?? "—"}</dd>
          </dl><p className="note">You can view this project but not edit it.</p></div>
        )}
        <div className="panel">
          <h2>Status history</h2>
          {history.length === 0 ? <span style={{ color: "var(--fg3)" }}>No changes recorded yet.</span> : (
            <ul className="hist">
              {history.map((h) => (
                <li key={h.id}><time>{fmtD(h.changed_at)}</time>
                  {h.from_status ? <><span className={`status s-${h.from_status}`}>{LABEL[h.from_status]}</span><span className="arrow">→</span></> : null}
                  <span className={`status s-${h.to_status}`}>{LABEL[h.to_status]}</span>
                  <span className="by">{h.who?.name ? `by ${title(h.who.name)}` : h.note ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Shell>
  );
}
