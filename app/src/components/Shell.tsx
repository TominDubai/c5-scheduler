import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";
import { getMe } from "@/lib/data";
import { title } from "@/lib/model";

export function Monogram() {
  return <img className="mono" src="/c5-mark.png" alt="Concept 5" width={34} height={34} />;
}

export default async function Shell({ active, children, tools }: { active?: "board" | "list" | "estimation"; children: React.ReactNode; tools?: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const me = await getMe().catch(() => ({ name: "", canEstimation: false, canProjects: false }));
  return (
    <>
      <header className="top">
        <Link href="/board" className="brand"><Monogram /><span className="wordmark">Concept <em>5</em></span><span className="sub">Projects 2026</span></Link>
        <nav className="tabs">
          <Link href="/estimation" className={"tab" + (active === "estimation" ? " on" : "")}>Estimation</Link>
          <Link href="/board" className={"tab" + (active === "board" ? " on" : "")}>Board</Link>
          <Link href="/list" className={"tab" + (active === "list" ? " on" : "")}>List</Link>
        </nav>
        <div className="tools">
          {tools}
          {me.canProjects && <Link href="/projects/new" className="btn sm bronze">+ Project</Link>}
          {user && <form action={signOut} className="userform"><span className="user">{title(me.name) || user.email}</span><button className="btn ghost sm" title={user.email ?? ""}>Sign out</button></form>}
        </div>
      </header>
      {children}
    </>
  );
}
