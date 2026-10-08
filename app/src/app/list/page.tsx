import { Suspense } from "react";
import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import Summary from "@/components/Summary";
import Filters, { applyFilters } from "@/components/Filters";
import ListTable from "@/components/ListTable";
import { getProjects, pmCounts } from "@/lib/data";

export const dynamic = "force-dynamic";

async function Inner_ListPage({ searchParams }: { searchParams: Promise<{ pm?: string; q?: string }> }) {
  const sp = await searchParams;
  const all = await getProjects();
  return (
    <Shell active="list" tools={<Suspense><Filters pms={pmCounts(all)} /></Suspense>}>
      <Summary projects={all} />
      <main><ListTable projects={applyFilters(all, sp)} /></main>
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
