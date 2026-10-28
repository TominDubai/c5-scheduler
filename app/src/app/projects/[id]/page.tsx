import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import BackButton from "@/components/BackButton";
import ProjectForm from "@/components/ProjectForm";
import Variations from "@/components/Variations";
import RemoveProject, { RemovedBanner } from "@/components/RemoveProject";
import TargetRevisions from "@/components/TargetRevisions";
import ItemsPanel from "@/components/ItemsPanel";
import Workflow from "@/components/Workflow";
import { Suspense } from "react";
import { getProject, getPeople, getContractors, getMe, getProjectMeetings, getProjects, getTargetRevisions, getProjectItems, getItemTypes, getProjectWatchers, getStages, getStageOwners, getProjectWorkflow } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { PHASES, COMPLETED_STAGE, LABEL, aed, fmtD, title, tone, delayText, hm, fmtDay, todayDubai, LOCATION_LABEL, byEnq, type Variation, type History } from "@/lib/model";

export const dynamic = "force-dynamic";

async function Inner_ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [p, people, contractors, me, meetings, all, revisions, itemsData, itemTypes, watchers, stages, owners, wf, { data: vos }, { data: hist }] = await Promise.all([
    getProject(id), getPeople(), getContractors(), getMe(), getProjectMeetings(id), getProjects(), getTargetRevisions(id), getProjectItems(id), getItemTypes(), getProjectWatchers(id), getStages(), getStageOwners(), getProjectWorkflow(id),
    supabase.from("variations").select("*").eq("project_id", id).order("vo_no"),
    supabase.from("status_history").select("*, who:people(name)").eq("project_id", id).order("changed_at", { ascending: false }),
  ]);
  if (!p) notFound();
  const t = tone(p);
  const canEdit = !p.deleted_at && (me.canProjects || (me.canEstimation && p.status === "QUOTE"));
  const history = (hist ?? []) as (History & { who: { name: string } | null })[];
  const live = all.filter((x) => !["QUOTE", "LOST", "COMPLETED", "MERGED"].includes(x.status)).sort(byEnq).map((x) => ({ id: x.id, name: x.name, enquiry_no: x.enquiry_no }));
  const voNo = p.status === "MERGED" ? (await supabase.from("variations").select("vo_no").eq("source_enquiry_id", p.id).maybeSingle()).data?.vo_no ?? null : null;
  return (
    <Shell>
      <div className="page">
        <div className="crumbs"><BackButton fallback="/board" /><Link href="/board">Board</Link> / <span className="enq">{p.enquiry_no ?? "no enquiry no."}</span></div>
        <div className="head">
          <div><h1>{title(p.name)}</h1><div className="client">{title(p.client)}{p.contractor ? ` · via ${p.contractor}` : ""}</div></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{p.stage != null ? <span className="stagechip big"><b>{p.stage}</b>{p.stage_short}</span> : <span className={`status s-${p.status}`}>{LABEL[p.status]}</span>}<span className={`pill ${t}`}>{delayText(p)}</span></div>
        </div>
        {p.deleted_at && <RemovedBanner project={p} canManage={me.canTeam} />}
        {p.parent_project_id && (
          <div className={`vobanner${p.status === "MERGED" ? " done" : ""}`}>
            {p.status === "MERGED"
              ? <>Won — added as <b>VO{voNo ?? ""}</b> on <Link href={`/projects/${p.parent_project_id}`}>{title(p.parent_name)}</Link>. This enquiry is closed.</>
              : <>VO enquiry for <Link href={`/projects/${p.parent_project_id}`}>{title(p.parent_name)}</Link>{p.parent_enquiry_no ? ` (${p.parent_enquiry_no})` : ""} — when it's won it becomes the next VO on that project.</>}
          </div>
        )}
        {p.stage != null && (
          <div className="stagebar17" aria-label="Stages 0 to 16, then Completed">
            {[...PHASES, { key: "COMPLETE" as const, label: "Completed", short: "Done", stages: [COMPLETED_STAGE] }].map((ph) => (
              <div key={ph.key} className={`sb-phase ph-${ph.key}${ph.stages.some((n) => n === p.stage) ? " cur" : ""}`} style={{ flex: ph.stages.length }}>
                <div className="sb-segs">{ph.stages.map((n) => <span key={n} className={(n < p.stage! ? "on " : "") + (n === p.stage ? "cur" : "")} title={stages.find((s) => s.stage_no === n)?.name}>{n === COMPLETED_STAGE ? "✓" : n}</span>)}</div>
                <small>{ph.key === "COMPLETE" ? "Completed" : ph.label}</small>
              </div>
            ))}
          </div>
        )}
        {p.status !== "LOST" && p.status !== "MERGED" && (p.stage == null || p.stage >= 3) && (
          <Workflow project={p} stages={stages} owners={owners} people={people} me={me} handovers={wf.handovers} holds={wf.holds} evidence={wf.evidence} tasks={wf.tasks} locked={!!p.deleted_at} />
        )}
        <div className="grid2">
          <div className="panel">
            <h2>At a glance</h2>
            <dl>
              <dt>Lead PM</dt><dd>{p.pm ? title(p.pm) : <i style={{ color: p.stage != null && p.stage >= 4 ? "var(--crit)" : "var(--fg3)" }}>{p.stage != null && p.stage >= 4 ? "not named — required from allocation" : "Unassigned"}</i>}{p.pm2 ? <small> · supporting {title(p.pm2)}</small> : null}</dd>
              <dt>Coordinator</dt><dd>{p.coordinator ? title(p.coordinator) : <i style={{ color: p.stage != null && p.stage >= 5 ? "var(--crit)" : "var(--fg3)" }}>{p.stage != null && p.stage >= 5 ? "not named" : "—"}</i>}</dd>
              <dt>Designer</dt><dd>{p.designer ? title(p.designer) : <i style={{ color: p.stage != null && p.stage >= 5 ? "var(--crit)" : "var(--fg3)" }}>{p.stage != null && p.stage >= 5 ? "not named" : "—"}</i>}{p.technical_designer ? <small> · technical {title(p.technical_designer)}</small> : null}</dd>
              <dt>Enquiry received</dt><dd>{fmtD(p.received_date)}</dd>
              <dt>Project start</dt><dd>{fmtD(p.start_date)}</dd>
              <dt>Target completion</dt><dd>{fmtD(p.target_date)}{p.target_rev != null && p.target_rev > 0 && <span className="rev">Rev {p.target_rev}</span>}{p.days_to_completion != null && <small> · {p.days_to_completion} days programme</small>}</dd>
              <dt>Completed</dt><dd>{fmtD(p.completed_date)}</dd>
              <dt>Duration</dt><dd>{p.duration_days != null ? `${p.duration_days} days${p.completed_date ? "" : " so far"}` : "—"}</dd>
              <dt>Project value</dt><dd>{aed(p.project_value)} <small>inc. VAT · {p.vo_count} VO{p.vo_count === 1 ? "" : "s"}</small></dd>
              <dt>In this stage since</dt><dd>{fmtD(p.status_since)}</dd>
              <dt>Updates go to</dt><dd>{(() => {
                const ids = [p.pm_id, p.pm2_id, p.designer_id, ...watchers].filter(Boolean) as string[];
                const names = [...new Set(ids)].map((id) => people.find((x) => x.id === id)).filter(Boolean).map((x) => title(x!.name));
                return names.length ? names.join(", ") : <i style={{ color: "var(--fg3)" }}>nobody yet — assign a PM and a designer</i>;
              })()}</dd>
            </dl>
          </div>
          <Variations projectId={p.id} signedQuote={p.signed_quote} vos={(vos ?? []) as Variation[]} canEdit={me.canProjects && !p.deleted_at} />
        </div>
        {p.status !== "QUOTE" && p.status !== "LOST" && p.status !== "MERGED" && (
          <>
            {!p.designer_id && <div className="vobanner"><b>No designer assigned.</b> The project designer creates the item list — assign one in the form below before items go in.</div>}
            <Suspense><ItemsPanel projectId={p.id} projectDesignerId={p.designer_id} data={itemsData} types={itemTypes} people={people} me={me} locked={!!p.deleted_at} /></Suspense>
          </>
        )}
        {canEdit ? (
          <div className="panel">
            <h2>Edit project</h2>
            <ProjectForm project={p} people={people} contractors={contractors} estimationOnly={!me.canProjects} liveProjects={live} watchers={watchers} isAdmin={me.isAdmin} />
          </div>
        ) : (
          <div className="panel"><h2>Details</h2><dl>
            <dt>Enquiry no.</dt><dd>{p.enquiry_no ?? "—"}</dd>
            <dt>Contractor</dt><dd>{p.contractor ?? "—"}</dd>
            <dt>Estimator</dt><dd>{p.estimator ? title(p.estimator) : "—"}</dd>
            <dt>Quoted value</dt><dd>{aed(p.quoted_value)}</dd>
            <dt>Folder</dt><dd>{p.folder_path ?? "—"}</dd>
            <dt>Notes</dt><dd>{p.notes ?? "—"}</dd>
          </dl><p className="note">{p.deleted_at ? "This project has been removed; restore it to edit." : "You can view this project but not edit it."}</p></div>
        )}
        <TargetRevisions revisions={revisions} current={p.target_date} canEdit={canEdit && me.canProjects} />
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
        <div className="panel">
          <h2>Meetings</h2>
          {meetings.length === 0 ? <span style={{ color: "var(--fg3)" }}>No meetings for this project yet. <Link href="/meetings" style={{ color: "var(--bronze)", fontWeight: 700 }}>Book one →</Link></span> : (
            <ul className="hist">
              {meetings.map((m) => { const past = m.meeting_date < todayDubai(); return (
                <li key={m.id} style={past ? { opacity: .6 } : undefined}>
                  <time>{fmtDay(m.meeting_date)}</time>
                  <span className="enq">{hm(m.start_time)}–{hm(m.end_time)}</span>
                  <Link href={`/meetings?w=${m.meeting_date}`} style={{ fontWeight: 700, color: "var(--navy)" }}>{m.title}</Link>
                  <span className={`pill ${m.location === "ROOM" ? "soon" : m.location === "SITE" ? "done" : ""}`}>{LOCATION_LABEL[m.location]}</span>
                  <span className="by">{m.attendees.map(title).join(", ")}</span>
                </li>
              ); })}
            </ul>
          )}
        </div>
        {me.canTeam && !p.deleted_at && <RemoveProject project={p} />}
      </div>
    </Shell>
  );
}

export default async function ProjectPage(props: Parameters<typeof Inner_ProjectPage>[0]) {
  try { return await Inner_ProjectPage(props); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e; // redirects / notFound pass through
    return <Shell><Failed what="this project" error={e} /></Shell>;
  }
}
