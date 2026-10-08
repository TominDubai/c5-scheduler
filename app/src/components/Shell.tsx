import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";

export function Monogram() {
  return (
    <svg className="mono" viewBox="0 0 40 40" aria-label="Concept 5">
      <rect x="1" y="1" width="38" height="38" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M24 12.5a8 8 0 1 0 0 15" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M29 12h-7l-.9 7.2a5 5 0 1 1-1.6 6.4" fill="none" stroke="var(--bronze)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Shell({ active, children, tools }: { active?: "board" | "list"; children: React.ReactNode; tools?: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <>
      <header className="top">
        <Link href="/board" className="brand"><Monogram /><span className="wordmark">Concept <em>5</em></span><span className="sub">Projects 2026</span></Link>
        <nav className="tabs">
          <Link href="/board" className={"tab" + (active === "board" ? " on" : "")}>Board</Link>
          <Link href="/list" className={"tab" + (active === "list" ? " on" : "")}>List</Link>
        </nav>
        <div className="tools">
          {tools}
          <Link href="/projects/new" className="btn sm bronze">+ Project</Link>
          {user && <form action={signOut}><button className="btn ghost sm" title={user.email ?? ""}>Sign out</button></form>}
        </div>
      </header>
      {children}
    </>
  );
}
