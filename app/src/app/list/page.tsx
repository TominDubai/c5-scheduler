import { Suspense } from "react";
import Shell from "@/components/Shell";
import Summary from "@/components/Summary";
import Filters, { applyFilters } from "@/components/Filters";
import ListTable from "@/components/ListTable";
import { getProjects, pmCounts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ListPage({ searchParams }: { searchParams: Promise<{ pm?: string; q?: string }> }) {
  const sp = await searchParams;
  const all = await getProjects();
  return (
    <Shell active="list" tools={<Suspense><Filters pms={pmCounts(all)} /></Suspense>}>
      <Summary projects={all} />
      <main><ListTable projects={applyFilters(all, sp)} /></main>
    </Shell>
  );
}
