import { Suspense } from "react";
import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import Summary from "@/components/Summary";
import Filters, { applyFilters } from "@/components/Filters";
import Board from "@/components/Board";
import { getProjects, pmCounts, getMe } from "@/lib/data";

export const dynamic = "force-dynamic";

async function Inner_BoardPage({ searchParams }: { searchParams: Promise<{ pm?: string; q?: string }> }) {
  const sp = await searchParams;
  const [all, me] = await Promise.all([getProjects(), getMe()]);
  const rows = applyFilters(all, sp);
  return (
    <Shell active="board" tools={<Suspense><Filters pms={pmCounts(all)} /></Suspense>}>
      <Summary projects={all} />
      <main><Board key={JSON.stringify(sp) + all.map((p) => p.updated_at).join()} projects={rows} canEdit={me.canProjects} /></main>
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
