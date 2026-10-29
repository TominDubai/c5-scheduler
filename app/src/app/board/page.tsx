import { Suspense } from "react";
import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import Summary from "@/components/Summary";
import Filters from "@/components/Filters";
import Board from "@/components/Board";
import TodayMeetings from "@/components/TodayMeetings";
import { getProjects, getMe, getStages, applyFilters, filterOptions, type BoardFilters } from "@/lib/data";

export const dynamic = "force-dynamic";

async function Inner_BoardPage({ searchParams }: { searchParams: Promise<BoardFilters> }) {
  const sp = await searchParams;
  const [all, me, stages] = await Promise.all([getProjects(), getMe(), getStages()]);
  // The Board carries stages 3–16, Completed for 30 days, and cards whose stage is still to be set at reconciliation.
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const onBoard = all.filter((p) => p.status !== "LOST" && p.status !== "MERGED" && (p.stage == null ? p.status !== "QUOTE" : p.stage >= 3) && (p.status !== "COMPLETED" || (p.completed_date ?? "") >= cutoff));
  const rows = applyFilters(onBoard, sp);
  const opts = filterOptions(onBoard);
  return (
    <Shell active="board" tools={<Suspense><Filters full pms={opts.pms} balls={opts.balls} depts={opts.depts} waiting={opts.waiting} /></Suspense>}>
      <Summary projects={all} />
      <TodayMeetings />
      <main className="fill"><Board key={JSON.stringify(sp) + all.map((p) => p.updated_at).join()} projects={rows} stages={stages} isAdmin={me.isAdmin} myId={me.id} /></main>
    </Shell>
  );
}

export default async function BoardPage(props: Parameters<typeof Inner_BoardPage>[0]) {
  try { return await Inner_BoardPage(props); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e; // redirects / notFound pass through
    return <Shell><Failed what="the board" error={e} /></Shell>;
  }
}
