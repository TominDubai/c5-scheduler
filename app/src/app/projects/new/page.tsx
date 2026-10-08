import Link from "next/link";
import Shell from "@/components/Shell";
import ProjectForm from "@/components/ProjectForm";
import { getPeople, getContractors } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
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
