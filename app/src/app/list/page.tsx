import { Suspense } from "react";
import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import Summary from "@/components/Summary";
import Filters from "@/components/Filters";
import ListTable from "@/components/ListTable";
import Link from "next/link";
import RemovedTable from "@/components/RemovedTable";
import { getProjects, getRemovedProjects, getMe, pmCounts, applyFilters } from "@/lib/data";

export const dynamic = "force-dynamic";

async function Inner_ListPage({ searchParams }: { searchParams: Promise<{ pm?: string; q?: string; show?: string; done?: string }> }) {
  const sp = await searchParams;
  const [all, removed, me] = await Promise.all([getProjects(), getRemovedProjects(), getMe()]);
  if (sp.show === "removed") {
    const done = sp.done ? removed.find((p) => p.id === sp.done) : null;
    return (
      <Shell active="list">
        <main>
          <div className="page">
            <div className="crumbs"><Link href="/list">List</Link> / Removed</div>
            {done && <div className="vobanner done"><b>Done — {done.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} has been removed.</b> It's off the board, list and all counts. Changed your mind? Use Restore on its row below.</div>}
            <div className="head"><div><h1>Removed projects</h1><div className="client">{removed.length === 0 ? "Nothing has been removed." : `${removed.length} off the board. Nothing is deleted — ${me.canTeam ? "restore any of them below." : "Tom, Darren or Jinky can restore them."}`}</div></div></div>
            <RemovedTable projects={removed} canManage={me.canTeam} />
          </div>
        </main>
      </Shell>
    );
  }
  return (
    <Shell active="list" tools={<Suspense><Filters pms={pmCounts(all)} /></Suspense>}>
      <Summary projects={all} />
      <main>
        <ListTable projects={applyFilters(all, sp)} />
        {removed.length > 0 && <p className="note" style={{ padding: "10px 18px" }}><Link href="/list?show=removed" style={{ color: "var(--bronze)", fontWeight: 700 }}>{removed.length} removed project{removed.length === 1 ? "" : "s"}</Link> — not shown or counted.</p>}
      </main>
    </Shell>
  );
}

export default async function ListPage(props: Parameters<typeof Inner_ListPage>[0]) {
  try { return await Inner_ListPage(props); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e; // redirects / notFound pass through
    return <Shell><Failed what="the list" error={e} /></Shell>;
  }
}
