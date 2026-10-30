import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import EstimationBoard from "@/components/EstimationBoard";
import EnquiryForm from "@/components/EnquiryForm";
import { getProjects, getPeople, getContractors, getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { byEnq, aedS } from "@/lib/model";

export const dynamic = "force-dynamic";

async function Inner_EstimationPage() {
  const supabase = await createClient();
  const [all, people, contractors, me, { data: nextNo }] = await Promise.all([getProjects(), getPeople(), getContractors(), getMe(), supabase.rpc("next_enquiry_no")]);
  const quotes = all.filter((p) => p.status === "QUOTE" && p.stage !== 0);
  const qualifying = all.filter((p) => p.status === "QUOTE" && p.stage === 0);
  // Stage 0 decisions belong to Sales — Tom and Aftab (and the other admins); names stay in the database
  const canQualify = me.isAdmin || me.role === "SALES";
  // VO parents: live projects first, then completed ones — a VO on a finished job reopens its card (db/022), never a new project
  const live = all.filter((p) => !["QUOTE", "LOST", "MERGED"].includes(p.status) && !p.deleted_at).sort(byEnq).map((p) => ({ id: p.id, name: p.name, enquiry_no: p.enquiry_no, client: p.client, completed: p.status === "COMPLETED" }));
  const open = quotes.filter((p) => p.quote_stage !== "SUBMITTED");
  const submitted = quotes.filter((p) => p.quote_stage === "SUBMITTED");
  const active = submitted.filter((p) => !p.quote_dormant);
  const dormant = submitted.filter((p) => p.quote_dormant);
  // Jinky, 30 Oct: count project quotes and VOs separately so "58 submitted" says how many jobs we're really chasing
  const activeProjects = active.filter((p) => !p.parent_project_id);
  const activeVos = active.filter((p) => !!p.parent_project_id);
  const activeValue = activeProjects.reduce((t, p) => t + (p.quoted_value ?? 0), 0);
  const voValue = activeVos.reduce((t, p) => t + (p.quoted_value ?? 0), 0);
  const oldest = open.reduce((m, p) => Math.max(m, p.days_since_enquiry ?? 0), 0);
  const wonThisYear = all.filter((p) => p.status !== "QUOTE" && p.status !== "LOST" && (p.received_date ?? "") >= `${new Date().getFullYear()}-01-01`).length;
  return (
    <Shell active="estimation">
      <section className="summary">
        <div className="stats">
          {qualifying.length > 0 && <div className="stat bronze"><b>{qualifying.length}</b><span>qualifying</span></div>}
          <div className="stat"><b>{open.length}</b><span>being priced</span></div>
          <div className="stat"><b>{activeProjects.length}</b><span>project quotes awaiting decision{activeValue > 0 ? ` · ${aedS(activeValue)}` : ""}</span></div>
          <div className="stat"><b>{activeVos.length}</b><span>VOs awaiting decision{voValue > 0 ? ` · ${aedS(voValue)}` : ""}</span></div>
          {dormant.length > 0 && <div className="stat"><b>{dormant.length}</b><span>dormant</span></div>}
          <div className={`stat${oldest > 21 ? " crit" : ""}`}><b>{oldest}d</b><span>oldest open enquiry</span></div>
          <div className="stat"><b>{wonThisYear}</b><span>won this year</span></div>
        </div>
        {me.canEstimation && <EnquiryForm nextNo={(nextNo as string) ?? ""} people={people} contractors={contractors} liveProjects={live} />}
      </section>
      <main className="fill"><EstimationBoard key={all.map((p) => p.updated_at).join()} projects={quotes} canEdit={me.canEstimation} canQualify={canQualify} qualifying={qualifying} /></main>
    </Shell>
  );
}

export default async function EstimationPage() {
  try { return await Inner_EstimationPage(); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e; // redirects / notFound pass through
    return <Shell><Failed what="estimation" error={e} /></Shell>;
  }
}
