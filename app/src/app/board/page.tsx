import { Suspense } from "react";
import Shell from "@/components/Shell";
import Summary from "@/components/Summary";
import Filters, { applyFilters } from "@/components/Filters";
import Board from "@/components/Board";
import { getProjects, pmCounts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ pm?: string; q?: string }> }) {
  const sp = await searchParams;
  const all = await getProjects();
  const rows = applyFilters(all, sp);
  return (
    <Shell active="board" tools={<Suspense><Filters pms={pmCounts(all)} /></Suspense>}>
      <Summary projects={all} />
      <main><Board key={JSON.stringify(sp) + all.map((p) => p.updated_at).join()} projects={rows} /></main>
    </Shell>
  );
}
