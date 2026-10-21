import { Suspense } from "react";
import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import DrawingsTable from "@/components/DrawingsTable";
import DrawingsFilters from "@/components/DrawingsFilters";
import { getAllItems, getMe, getProjects } from "@/lib/data";
import { itemFlags, type Item, type ItemStage } from "@/lib/model";

export const dynamic = "force-dynamic";

type SP = { project?: string; designer?: string; pm?: string; stage?: string; q?: string; flag?: string };

function filter(items: Item[], sp: SP) {
  const q = (sp.q ?? "").toLowerCase().trim();
  return items.filter((i) =>
    (!sp.project || i.project_id === sp.project) &&
    (!sp.designer || i.designer === sp.designer) &&
    (!sp.pm || i.pm === sp.pm) &&
    (!sp.stage || i.stage === sp.stage || (sp.stage === "DRAWINGS" && ["NOT_STARTED", "DRAWING", "SUBMITTED"].includes(i.stage)) || (sp.stage === "FACTORY" && ["ISSUED", "JOINERY", "PAINT", "DELIVERY"].includes(i.stage)) || (sp.stage === "SITE" && ["INSTALL", "STONE", "SNAGGING"].includes(i.stage))) &&
    (!sp.flag || (sp.flag === "attention" && itemFlags(i).length > 0) || (sp.flag === "r3" && i.past_r3)) &&
    (!q || `${i.drawing_code} ${i.name} ${i.area ?? ""} ${i.project_name} ${i.client ?? ""}`.toLowerCase().includes(q)));
}

/** Every item on every live project — the old Master tab, done properly. Darren's screen. */
async function Inner_DrawingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [all, me, projects] = await Promise.all([getAllItems(), getMe(), getProjects()]);
  const live = all.filter((i) => !i.cancelled);
  const rows = filter(live, sp);
  const count = (f: (i: Item) => boolean) => live.filter(f).length;
  const designers = [...new Set(live.map((i) => i.designer).filter(Boolean) as string[])].sort();
  const pms = [...new Set(live.map((i) => i.pm).filter(Boolean) as string[])].sort();
  const projOpts = projects.filter((p) => live.some((i) => i.project_id === p.id)).map((p) => ({ id: p.id, name: p.name, enquiry_no: p.enquiry_no }));
  const stages = [...new Set(live.map((i) => i.stage))] as ItemStage[];
  const awardedNoItems = projects.filter((p) => !["QUOTE", "LOST", "COMPLETED", "MERGED", "SITE_ON_HOLD"].includes(p.status) && !live.some((i) => i.project_id === p.id));
  return (
    <Shell active="drawings" tools={<Suspense><DrawingsFilters projects={projOpts} designers={designers} pms={pms} stages={stages} /></Suspense>}>
      <section className="summary">
        <div className="stats">
          <div className="stat"><b>{live.length}</b><span>items on live projects</span></div>
          <div className="stat"><b>{count((i) => ["NOT_STARTED", "DRAWING"].includes(i.stage))}</b><span>being drawn</span></div>
          <div className="stat"><b>{count((i) => i.stage === "SUBMITTED")}</b><span>with the client</span></div>
          <div className="stat"><b>{count((i) => ["ISSUED", "JOINERY", "PAINT", "DELIVERY"].includes(i.stage))}</b><span>in the factory</span></div>
          <div className="stat"><b>{count((i) => ["INSTALL", "STONE", "SNAGGING"].includes(i.stage))}</b><span>on site</span></div>
          <div className={`stat${count((i) => itemFlags(i).length > 0) ? " crit" : ""}`}><b>{count((i) => itemFlags(i).length > 0)}</b><span>need attention</span></div>
          {count((i) => i.past_r3) > 0 && <div className="stat crit"><b>{count((i) => i.past_r3)}</b><span>past R3</span></div>}
        </div>
        {awardedNoItems.length > 0 && <p className="note teamnote"><b>{awardedNoItems.length}</b> awarded project{awardedNoItems.length === 1 ? " has" : "s have"} no items yet: {awardedNoItems.slice(0, 6).map((p) => p.enquiry_no ?? p.name).join(", ")}{awardedNoItems.length > 6 ? "…" : ""}. The project designer adds them on the project page.</p>}
      </section>
      <main className="fill column"><DrawingsTable items={rows} total={live.length} canEdit={me.isAdmin || me.canProjects} /></main>
    </Shell>
  );
}

export default async function DrawingsPage(props: Parameters<typeof Inner_DrawingsPage>[0]) {
  try { return await Inner_DrawingsPage(props); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e;
    return <Shell><Failed what="the drawings list" error={e} /></Shell>;
  }
}
