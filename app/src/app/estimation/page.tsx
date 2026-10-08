import Shell from "@/components/Shell";
import EstimationBoard from "@/components/EstimationBoard";
import EnquiryForm from "@/components/EnquiryForm";
import { getProjects, getPeople, getContractors, getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { aedS } from "@/lib/model";

export const dynamic = "force-dynamic";

export default async function EstimationPage() {
  const [all, people, contractors, me] = await Promise.all([getProjects(), getPeople(), getContractors(), getMe()]);
  const supabase = await createClient();
  const { data: nextNo } = await supabase.rpc("next_enquiry_no");
  const quotes = all.filter((p) => p.status === "QUOTE");
  const open = quotes.filter((p) => p.quote_stage !== "SUBMITTED");
  const submitted = quotes.filter((p) => p.quote_stage === "SUBMITTED");
  const oldest = open.reduce((m, p) => Math.max(m, p.days_since_enquiry ?? 0), 0);
  const wonThisYear = all.filter((p) => p.status !== "QUOTE" && p.status !== "LOST" && (p.received_date ?? "") >= `${new Date().getFullYear()}-01-01`).length;
  return (
    <Shell active="estimation">
      <section className="summary">
        <div className="stats">
          <div className="stat"><b>{open.length}</b><span>being priced</span></div>
          <div className="stat"><b>{submitted.length}</b><span>submitted, awaiting decision</span></div>
          <div className="stat"><b>{aedS(submitted.reduce((s, p) => s + (p.quoted_value || 0), 0))}</b><span>value out for decision</span></div>
          <div className={`stat${oldest > 21 ? " crit" : ""}`}><b>{oldest}d</b><span>oldest open enquiry</span></div>
          <div className="stat"><b>{wonThisYear}</b><span>won this year</span></div>
        </div>
        {me.canEstimation && <EnquiryForm nextNo={(nextNo as string) ?? ""} people={people} contractors={contractors} />}
      </section>
      <main><EstimationBoard key={all.map((p) => p.updated_at).join()} projects={quotes} canEdit={me.canEstimation} /></main>
    </Shell>
  );
}
