import Link from "next/link";
import Shell from "@/components/Shell";
import Failed from "@/components/Failed";
import ProjectForm from "@/components/ProjectForm";
import { getPeople, getContractors } from "@/lib/data";

export const dynamic = "force-dynamic";

async function Inner_NewProjectPage() {
  const [people, contractors] = await Promise.all([getPeople(), getContractors()]);
  return (
    <Shell>
      <div className="page">
        <div className="crumbs"><Link href="/board">Board</Link> / New project</div>
        <div className="head"><h1>New project</h1></div>
        <div className="panel"><ProjectForm people={people} contractors={contractors} /></div>
      </div>
    </Shell>
  );
}

export default async function NewProjectPage() {
  try { return await Inner_NewProjectPage(); }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_")) throw e; // redirects / notFound pass through
    return <Shell><Failed what="the form" error={e} /></Shell>;
  }
}
